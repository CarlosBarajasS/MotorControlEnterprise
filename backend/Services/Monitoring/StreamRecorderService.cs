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

            // Solo cámaras marcadas como IsRecordingOnly (baja calidad para NAS/cloud)
            // Las cámaras de alta calidad (IsRecordingOnly=false) son exclusivamente para streaming en vivo
            var cameras = await db.Cameras
                .Include(c => c.Client)
                .Where(c => c.Status == "active"
                         && c.IsRecordingOnly
                         && c.Client != null
                         && c.Client.CloudStorageActive
                         && c.CameraId != null
                         && c.Client.GatewayId != null)
                .ToListAsync(ct);

            var activeKeys = cameras
                .Select(c => $"{c.Client!.GatewayId}/{c.CameraId}")
                .ToHashSet();

            // Detener procesos de cámaras que ya no deben grabarse
            foreach (var key in _processes.Keys.ToList())
            {
                if (!activeKeys.Contains(key))
                    StopProcess(key);
            }

            // Iniciar grabación de cámaras nuevas o cuyo proceso murió
            foreach (var camera in cameras)
            {
                var key = $"{camera.Client!.GatewayId}/{camera.CameraId}";

                if (_processes.TryGetValue(key, out var existing) && !existing.HasExited)
                    continue;

                StartRecording(camera.Client!.GatewayId!, camera.CameraId!);
            }
        }

        // ─── Process management ───────────────────────────────────────────────

        private void StartRecording(string gatewayId, string cameraId)
        {
            var key      = $"{gatewayId}/{cameraId}";
            var nasPath  = _config["Storage:NasRecordingsPath"] ?? "/mnt/nas/recordings";
            var segSec   = _config["StreamRecorder:SegmentSeconds"] ?? "900";
            var rtspUser = _config["Mediamtx:User"] ?? "edge";
            var rtspPass = _config["Mediamtx:Password"] ?? "edge123";
            var rtspHost = _config["StreamRecorder:MediamtxHost"] ?? "central-mediamtx";
            var rtspPort = _config["StreamRecorder:MediamtxPort"] ?? "8554";

            var inputUrl    = $"rtsp://{rtspUser}:{rtspPass}@{rtspHost}:{rtspPort}/{gatewayId}/{cameraId}";
            var outDir      = Path.Combine(nasPath, gatewayId, cameraId);
            var outPattern  = Path.Combine(outDir, "%Y-%m-%d", "%H-%M-%S.mp4");

            // Asegurar que el directorio base existe
            Directory.CreateDirectory(outDir);

            var args =
                $"-rtsp_transport tcp " +
                $"-i {inputUrl} " +
                $"-c copy " +
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
