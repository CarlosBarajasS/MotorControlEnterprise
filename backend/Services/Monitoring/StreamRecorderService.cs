using Microsoft.EntityFrameworkCore;
using MotorControlEnterprise.Api.Data;
using System.Collections.Concurrent;
using System.Diagnostics;

namespace MotorControlEnterprise.Api.Services
{
    /// <summary>
    /// BackgroundService que graba continuamente los streams RTSP de las cámaras
    /// con almacenamiento cloud activo, segmentando en archivos MP4 de 15 minutos
    /// almacenados en la ruta NAS: {nasPath}/{gatewayId}/{cameraId}/{YYYY-MM-DD}/{HH-MM-SS}.mp4
    /// </summary>
    public class StreamRecorderService : BackgroundService
    {
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly IConfiguration _config;
        private readonly ILogger<StreamRecorderService> _logger;

        // key: "{gatewayId}/{cameraId}"
        private readonly ConcurrentDictionary<string, Process> _processes = new();

        public StreamRecorderService(
            IServiceScopeFactory scopeFactory,
            IConfiguration config,
            ILogger<StreamRecorderService> logger)
        {
            _scopeFactory = scopeFactory;
            _config       = config;
            _logger       = logger;
        }

        /// <summary>Returns the set of "{gatewayId}/{cameraId}" keys whose ffmpeg process is alive.</summary>
        public IReadOnlyCollection<string> GetActiveRecordingKeys() =>
            _processes.Where(kv => !kv.Value.HasExited).Select(kv => kv.Key).ToList();

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            // Esperar que la app arranque completamente antes del primer escaneo
            await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    await RefreshRecordingsAsync(stoppingToken);
                }
                catch (Exception ex) when (!stoppingToken.IsCancellationRequested)
                {
                    _logger.LogError(ex, "StreamRecorderService: error en RefreshRecordings");
                }

                var intervalSec = int.Parse(_config["StreamRecorder:RefreshIntervalSeconds"] ?? "300");
                await Task.Delay(TimeSpan.FromSeconds(intervalSec), stoppingToken);
            }
        }

        public override async Task StopAsync(CancellationToken cancellationToken)
        {
            _logger.LogInformation("StreamRecorderService: deteniendo {Count} procesos ffmpeg", _processes.Count);
            foreach (var key in _processes.Keys.ToList())
                StopProcess(key);

            await base.StopAsync(cancellationToken);
        }

        // ─── Refresh ──────────────────────────────────────────────────────────

        private async Task RefreshRecordingsAsync(CancellationToken ct)
        {
            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            // Las cámaras IsRecordingOnly son entidades virtuales de configuración — no tienen
            // heartbeat MQTT propio. Su elegibilidad para grabación depende de:
            //   1. Que el gateway esté vivo (heartbeat reciente)
            //   2. Que el cliente tenga CloudStorageActive
            // El campo Status de la cámara NO se usa: nunca recibe actualizaciones propias.
            var gatewayThreshold = DateTime.UtcNow - TimeSpan.FromMinutes(5);

            var cameras = await db.Cameras
                .Include(c => c.Client)
                    .ThenInclude(cl => cl!.Gateways)
                .Where(c => c.IsRecordingOnly
                         && c.Client != null
                         && c.Client.CloudStorageActive
                         && c.CameraId != null
                         && c.Client.Gateways.Any(g =>
                                g.LastHeartbeatAt != null &&
                                g.LastHeartbeatAt > gatewayThreshold))
                .ToListAsync(ct);

            var activeKeys = cameras
                .Select(c => $"{c.Client!.Gateways.FirstOrDefault()!.GatewayId}/{c.CameraId}")
                .ToHashSet();

            // Detener procesos de cámaras que ya no deben grabarse
            foreach (var key in _processes.Keys.ToList())
            {
                if (!activeKeys.Contains(key))
                    StopProcess(key);
            }

            // Iniciar grabación de cámaras nuevas o cuyo proceso murió
            var nasPath = _config["Storage:NasRecordingsPath"] ?? "/mnt/nas/recordings";

            foreach (var camera in cameras)
            {
                var gatewayId = camera.Client!.Gateways.FirstOrDefault()?.GatewayId;
                if (string.IsNullOrEmpty(gatewayId))
                {
                    _logger.LogWarning("StreamRecorder: cámara {CameraId} no tiene gateway asignado, se omite", camera.CameraId);
                    continue;
                }

                var key = $"{gatewayId}/{camera.CameraId}";

                // Pre-crear directorios de fecha hoy y mañana en cada ciclo.
                // -strftime_mkdir 1 puede fallar silenciosamente en montajes NFS;
                // esto garantiza que ffmpeg siempre encuentre el directorio destino.
                try
                {
                    var baseDir = Path.Combine(nasPath, gatewayId, camera.CameraId!);
                    Directory.CreateDirectory(Path.Combine(baseDir, DateTime.Now.ToString("yyyy-MM-dd")));
                    Directory.CreateDirectory(Path.Combine(baseDir, DateTime.Now.AddDays(1).ToString("yyyy-MM-dd")));
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "StreamRecorder: no se pudo pre-crear directorio NAS para {Key}", key);
                }

                if (_processes.TryGetValue(key, out var existing) && !existing.HasExited)
                    continue;

                StartRecording(gatewayId, camera.CameraId!);
            }
        }

        // ─── Process management ───────────────────────────────────────────────

        private void StartRecording(string gatewayId, string cameraId)
        {
            var key      = $"{gatewayId}/{cameraId}";
            var nasPath  = _config["Storage:NasRecordingsPath"] ?? "/mnt/nas/recordings";
            var segSec   = _config["StreamRecorder:SegmentSeconds"] ?? "900";
            var rtspUser = _config["Mediamtx:User"] ?? "edge";
            var rtspPass = _config["Mediamtx:Password"] ?? "CHANGE_THIS";
            var rtspHost = _config["StreamRecorder:MediamtxHost"] ?? "central-mediamtx";
            var rtspPort = _config["StreamRecorder:MediamtxPort"] ?? "8554";

            // MediaMTX paths use hyphens (GATEWAY_CLIENT_ID_SAFE) while DB stores colons (MAC format)
            var rtspGatewayId = gatewayId.Replace(":", "-");
            var inputUrl    = $"rtsp://{rtspUser}:{rtspPass}@{rtspHost}:{rtspPort}/{rtspGatewayId}/{cameraId}";
            var outDir      = Path.Combine(nasPath, gatewayId, cameraId);
            var outPattern  = Path.Combine(outDir, "%Y-%m-%d", "%H-%M-%S.mp4");

            // Asegurar que el directorio base existe
            Directory.CreateDirectory(outDir);

            var args =
                $"-rtsp_transport tcp " +
                $"-i {inputUrl} " +
                $"-c:v copy -an " +    // copy video, drop audio (G.711/pcm_alaw not supported in MP4)
                $"-f segment " +
                $"-segment_time {segSec} " +
                $"-segment_format mp4 " +
                $"-movflags +frag_keyframe+empty_moov+default_base_moof " +
                $"-strftime 1 " +
                $"-strftime_mkdir 1 " +
                $"-reset_timestamps 1 " +
                $"-segment_atclocktime 1 " +
                $"-fflags +genpts+igndts " +
                $"-y " +
                $"\"{outPattern}\"";

            var process = new Process
            {
                StartInfo = new ProcessStartInfo
                {
                    FileName               = "ffmpeg",
                    Arguments              = args,
                    UseShellExecute        = false,
                    RedirectStandardOutput = false,
                    RedirectStandardError  = false,
                    CreateNoWindow         = true
                },
                EnableRaisingEvents = true
            };

            process.Exited += (_, _) =>
            {
                _logger.LogWarning("StreamRecorder: ffmpeg para {Key} terminó (código {Code})",
                    key, process.ExitCode);
                _processes.TryRemove(key, out _);
                process.Dispose();
            };

            process.Start();
            _processes[key] = process;
            _logger.LogInformation("StreamRecorder: iniciando grabación {Key} → {OutDir}", key, outDir);
        }

        private void StopProcess(string key)
        {
            if (!_processes.TryRemove(key, out var process)) return;

            if (!process.HasExited)
            {
                try
                {
                    process.Kill(entireProcessTree: true);
                    process.WaitForExit(5000);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "StreamRecorder: error al matar proceso {Key}", key);
                }
            }

            process.Dispose();
            _logger.LogInformation("StreamRecorder: detenida grabación {Key}", key);
        }
    }
}
