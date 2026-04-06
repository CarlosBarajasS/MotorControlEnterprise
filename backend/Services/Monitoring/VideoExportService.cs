using System.Diagnostics;
using System.Globalization;
using MotorControlEnterprise.Api.Models;

namespace MotorControlEnterprise.Api.Services
{
    /// <summary>
    /// Genera clips MP4 a partir de segmentos almacenados en NAS,
    /// recortando al rango exacto solicitado y aplicando marca de agua NIRMGROUP.
    /// </summary>
    public class VideoExportService
    {
        private readonly IConfiguration _config;
        private readonly ILogger<VideoExportService> _logger;
        private const int MaxDurationMinutes = 30;

        public VideoExportService(IConfiguration config, ILogger<VideoExportService> logger)
        {
            _config = config;
            _logger = logger;
        }

        public record ExportResult(bool Success, string? FilePath, string? ErrorCode, string? ErrorMessage);

        /// <summary>
        /// Localiza segmentos NAS para [startUtc, endUtc], concatena con FFmpeg y aplica
        /// recorte exacto + marca de agua NIRMGROUP.
        /// El caller debe eliminar FilePath tras enviarlo al cliente.
        /// </summary>
        public async Task<ExportResult> ExportClipAsync(
            Camera camera, DateTime startUtc, DateTime endUtc, CancellationToken ct = default)
        {
            if ((endUtc - startUtc).TotalMinutes > MaxDurationMinutes)
                return new ExportResult(false, null, "RANGE_TOO_LONG",
                    $"El rango no puede exceder {MaxDurationMinutes} minutos.");

            if (endUtc <= startUtc)
                return new ExportResult(false, null, "INVALID_RANGE",
                    "endTime debe ser posterior a startTime.");

            var nasPath   = _config["Storage:NasRecordingsPath"] ?? "/mnt/nas/recordings";
            var clientDir = camera.Client?.GatewayId ?? camera.ClientId?.ToString() ?? "unknown";
            var cameraDir = camera.CameraId ?? camera.Id.ToString();
            var baseDir   = Path.Combine(nasPath, clientDir, cameraDir);
            var segments  = FindOverlappingSegments(baseDir, startUtc, endUtc);

            if (segments.Count == 0)
                return new ExportResult(false, null, "NO_RECORDINGS",
                    "No se encontraron grabaciones para el rango especificado.");

            var tmpDir      = Path.Combine(Path.GetTempPath(), "mce_exports");
            Directory.CreateDirectory(tmpDir);
            var listFile   = Path.Combine(tmpDir, $"concat_{Guid.NewGuid():N}.txt");
            var outputFile = Path.Combine(tmpDir, $"export_{Guid.NewGuid():N}.mp4");

            try
            {
                // Formato de concat list de FFmpeg: file '/ruta/al/segmento.mp4'
                char q = (char)39;
                var concatLines = segments.Select(s =>
                    "file " + q + s.Path.Replace("\\", "/").Replace(q.ToString(), "\\'" ) + q);
                await File.WriteAllLinesAsync(listFile, concatLines, ct);

                var trimStart = Math.Max(0, (startUtc - segments[0].StartTime).TotalSeconds);
                var duration  = (endUtc - startUtc).TotalSeconds;
                var drawtext  = BuildWatermarkFilter(SanitizeFilterText(camera.Name));
                var ffArgs    = BuildFfmpegArgs(listFile, trimStart, duration, drawtext, outputFile);

                _logger.LogInformation(
                    "VideoExport: cam={CamId} segs={Count} offset={Offset:F1}s dur={Duration:F1}s",
                    camera.Id, segments.Count, trimStart, duration);

                var (exitCode, stderr) = await RunFfmpegAsync(ffArgs, ct);

                if (exitCode != 0)
                {
                    _logger.LogError("FFmpeg exit={Exit}: {Stderr}", exitCode, stderr);
                    return new ExportResult(false, null, "FFMPEG_ERROR",
                        "Error al procesar el video. Intenta con un rango diferente.");
                }

                if (!File.Exists(outputFile) || new FileInfo(outputFile).Length == 0)
                    return new ExportResult(false, null, "EMPTY_OUTPUT", "El clip generado esta vacio.");

                return new ExportResult(true, outputFile, null, null);
            }
            catch (OperationCanceledException) { throw; }
            catch (Exception ex)
            {
                _logger.LogError(ex, "VideoExportService error camara {CamId}", camera.Id);
                return new ExportResult(false, null, "INTERNAL_ERROR", "Error interno al generar el clip.");
            }
            finally
            {
                if (File.Exists(listFile)) try { File.Delete(listFile); } catch { /* ignorar */ }
            }
        }

        // â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

        private record SegmentInfo(string Path, DateTime StartTime);

        /// <summary>
        /// Busca segmentos MP4 cuyo rango se solapa con [startUtc, endUtc].
        /// Estructura NAS: {baseDir}/{yyyy-MM-dd}/{HH-mm-ss}.mp4
        /// La duracion de cada segmento proviene de StreamRecorder:SegmentSeconds (default 900).
        /// </summary>
        private List<SegmentInfo> FindOverlappingSegments(string baseDir, DateTime startUtc, DateTime endUtc)
        {
            var segSecs = int.Parse(_config["StreamRecorder:SegmentSeconds"] ?? "900");
            var result  = new List<SegmentInfo>();

            if (!Directory.Exists(baseDir)) return result;

            var date = startUtc.Date;
            while (date <= endUtc.Date)
            {
                var dateDir = Path.Combine(baseDir, date.ToString("yyyy-MM-dd"));
                if (Directory.Exists(dateDir))
                {
                    foreach (var file in Directory.GetFiles(dateDir, "*.mp4")
                                 .Where(f => new FileInfo(f).Length > 0).OrderBy(f => f))
                    {
                        var stem = Path.GetFileNameWithoutExtension(file);
                        if (!DateTime.TryParseExact(
                                $"{date:yyyy-MM-dd} {stem}", "yyyy-MM-dd HH-mm-ss",
                                CultureInfo.InvariantCulture, DateTimeStyles.None, out var segStart))
                            continue;

                        var segEnd = segStart.AddSeconds(segSecs);
                        // Solapamiento: segStart < endUtc AND segEnd > startUtc
                        if (segStart < endUtc && segEnd > startUtc)
                            result.Add(new SegmentInfo(file, segStart));
                    }
                }
                date = date.AddDays(1);
            }
            return result.OrderBy(s => s.StartTime).ToList();
        }

        /// <summary>
        /// Construye el filtro drawtext de FFmpeg con dos lineas en esquina inferior derecha:
        ///   Linea 1: "NIRMGROUP  |  {nombreCamara}"
        ///   Linea 2: timestamp dinamico del frame
        /// </summary>
        private static string BuildWatermarkFilter(string safeName)
        {
            const string font = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
            char q = (char)39;
            return
                "drawtext=fontfile=" + q + font + q +
                ":text=" + q + "NIRMGROUP  |  " + safeName + q +
                ":fontsize=18:fontcolor=white" +
                ":box=1:boxcolor=black@0.55:boxborderw=5:x=w-tw-10:y=h-th-30," +
                "drawtext=fontfile=" + q + font + q +
                ":text=" + q + "%{localtime\\:%Y-%m-%d %H\\:%M\\:%S}" + q +
                ":fontsize=14:fontcolor=white" +
                ":box=1:boxcolor=black@0.55:boxborderw=4:x=w-tw-10:y=h-th-10";
        }

        private static string BuildFfmpegArgs(
            string listFile, double trimStart, double duration,
            string drawtextFilter, string outputFile)
        {
            var ss  = trimStart.ToString("F3", CultureInfo.InvariantCulture);
            var dur = duration.ToString("F3", CultureInfo.InvariantCulture);
            // concat demuxer -> trim exacto -> watermark -> h264/aac -> MP4 streaming-friendly
            return $"-y -f concat -safe 0 -i \"{listFile}\" " +
                   $"-ss {ss} -t {dur} " +
                   $"-vf \"{drawtextFilter}\" " +
                   "-c:v libx264 -preset fast -crf 23 " +
                   "-c:a aac -b:a 128k " +
                   "-movflags +faststart " +
                   "-avoid_negative_ts make_zero " +
                   $"\"{outputFile}\"";
        }

        private static async Task<(int ExitCode, string Stderr)> RunFfmpegAsync(
            string args, CancellationToken ct)
        {
            using var proc = new Process
            {
                StartInfo = new ProcessStartInfo
                {
                    FileName = "ffmpeg", Arguments = args,
                    UseShellExecute = false, RedirectStandardError = true, CreateNoWindow = true
                }
            };
            proc.Start();
            var stderrTask = proc.StandardError.ReadToEndAsync(ct);
            // Si el request se cancela, matar el proceso FFmpeg
            await using (ct.Register(() => { try { if (!proc.HasExited) proc.Kill(true); } catch { /* ignorar */ } }))
                await proc.WaitForExitAsync(ct);
            return (proc.ExitCode, await stderrTask);
        }

        /// <summary>Escapa caracteres especiales para el filtro drawtext de FFmpeg.</summary>
        private static string SanitizeFilterText(string text) =>
            text.Replace("\\", "\\\\")
                .Replace("'",  "\\'")
                .Replace(":",  "\\:")
                .Replace("[",  "\\[")
                .Replace("]",  "\\]");
    }
}
