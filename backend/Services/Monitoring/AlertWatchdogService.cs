using Microsoft.EntityFrameworkCore;
using MotorControlEnterprise.Api.Data;
using MotorControlEnterprise.Api.Models;

namespace MotorControlEnterprise.Api.Services
{
    public class AlertWatchdogService : BackgroundService
    {
        private readonly IServiceProvider _services;
        private readonly IConfiguration _config;
        private readonly ILogger<AlertWatchdogService> _logger;

        private static readonly TimeSpan Interval        = TimeSpan.FromMinutes(2);
        private static readonly TimeSpan CameraTimeout   = TimeSpan.FromMinutes(5);
        private static readonly TimeSpan GatewayTimeout  = TimeSpan.FromMinutes(3);

        public AlertWatchdogService(
            IServiceProvider services,
            IConfiguration config,
            ILogger<AlertWatchdogService> logger)
        {
            _services = services;
            _config   = config;
            _logger   = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            // Wait 1 minute after startup before first run
            await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    await RunChecksAsync(stoppingToken);
                }
                catch (Exception ex) when (!stoppingToken.IsCancellationRequested)
                {
                    _logger.LogError(ex, "AlertWatchdog: error during checks");
                }

                await Task.Delay(Interval, stoppingToken);
            }
        }

        private async Task RunChecksAsync(CancellationToken ct)
        {
            using var scope   = _services.CreateScope();
            var db            = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var alertService  = scope.ServiceProvider.GetRequiredService<AlertService>();

            var now = DateTime.UtcNow;

            // ── 1. Gateway offline check ──────────────────────────────────────
            var gatewayThreshold = now - GatewayTimeout;
            var offlineGateways  = await db.Clients
                .Where(c => c.Status == "active" &&
                            c.DeletedAt == null &&
                            c.GatewayId != null &&
                            c.LastHeartbeatAt != null &&
                            c.LastHeartbeatAt < gatewayThreshold)
                .ToListAsync(ct);

            foreach (var gw in offlineGateways)
            {
                var fp = $"Gateway-{gw.GatewayId}-GatewayDown";
                await alertService.TryCreateAsync(
                    fp,
                    AlertEntityType.Gateway,
                    gw.GatewayId ?? gw.Id.ToString(),
                    AlertType.GatewayDown,
                    AlertPriority.P1,
                    $"Gateway '{gw.Name}' desconectado",
                    $"El gateway '{gw.GatewayId}' no ha enviado heartbeat en los últimos {GatewayTimeout.TotalMinutes} minutos. Todas las cámaras del cliente pueden estar afectadas.",
                    gw.Id);
            }

            // ── 2. Camera offline check ───────────────────────────────────────
            var cameraThreshold = now - CameraTimeout;
            var offlineCameras  = await db.Cameras
                .Include(c => c.Client)
                .Where(c => c.Status == "active" &&
                            c.IsRecordingOnly != true &&
                            c.LastSeen != null &&
                            c.LastSeen < cameraThreshold)
                .ToListAsync(ct);

            foreach (var cam in offlineCameras)
            {
                var fp = $"Camera-{cam.Id}-Offline";
                await alertService.TryCreateAsync(
                    fp,
                    AlertEntityType.Camera,
                    cam.Id.ToString(),
                    AlertType.Offline,
                    AlertPriority.P2,
                    $"Cámara '{cam.Name}' sin señal",
                    $"La cámara '{cam.Name}' no ha reportado actividad en los últimos {CameraTimeout.TotalMinutes} minutos.",
                    cam.ClientId);
            }

            // ── 3. NAS storage check ─────────────────────────────────────────
            var nasPath = _config["Storage:NasRecordingsPath"] ?? "/mnt/nas/recordings";
            if (Directory.Exists(nasPath))
            {
                try
                {
                    double usedMb = Directory
                        .GetFiles(nasPath, "*.mp4", SearchOption.AllDirectories)
                        .Where(f => new FileInfo(f).Length > 0)
                        .Sum(f => new FileInfo(f).Length / 1024.0 / 1024.0);

                    double capacityMb = 0;
                    try { capacityMb = new DriveInfo(nasPath).TotalSize / 1024.0 / 1024.0; } catch { }

                    if (capacityMb > 0)
                    {
                        var usedPct = usedMb / capacityMb;

                        if (usedPct > 0.90)
                        {
                            await alertService.TryCreateAsync(
                                "Storage-nas-StorageCritical",
                                AlertEntityType.Storage, "nas",
                                AlertType.StorageCritical, AlertPriority.P2,
                                "Almacenamiento NAS crítico (>90%)",
                                $"El NAS está al {usedPct:P0} de capacidad ({usedMb / 1024:F1} GB de {capacityMb / 1024:F0} GB). Riesgo inmediato de pérdida de grabaciones.",
                                clientId: null);

                            // Resolve the lower P3 alert if it was active
                            await alertService.ResolveAsync(
                                "Storage-nas-StorageHigh",
                                "Almacenamiento NAS bajo nivel de advertencia",
                                "El nivel de almacenamiento bajó del umbral de advertencia.",
                                "nas", AlertEntityType.Storage);
                        }
                        else if (usedPct > 0.80)
                        {
                            await alertService.TryCreateAsync(
                                "Storage-nas-StorageHigh",
                                AlertEntityType.Storage, "nas",
                                AlertType.StorageHigh, AlertPriority.P3,
                                "Almacenamiento NAS alto (>80%)",
                                $"El NAS está al {usedPct:P0} de capacidad ({usedMb / 1024:F1} GB de {capacityMb / 1024:F0} GB).",
                                clientId: null);
                        }
                        else
                        {
                            // Below all thresholds — resolve any existing storage alerts
                            await alertService.ResolveAsync(
                                "Storage-nas-StorageCritical",
                                "Almacenamiento NAS normalizado",
                                "El uso del NAS bajó por debajo del umbral crítico.",
                                "nas", AlertEntityType.Storage);
                            await alertService.ResolveAsync(
                                "Storage-nas-StorageHigh",
                                "Almacenamiento NAS normalizado",
                                "El uso del NAS bajó por debajo del umbral de advertencia.",
                                "nas", AlertEntityType.Storage);
                        }
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "AlertWatchdog: error reading NAS storage");
                }
            }
        }
    }
}
