using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MotorControlEnterprise.Api.Data;
using System.Text.Json;

namespace MotorControlEnterprise.Api.Controllers
{
    [ApiController]
    [Route("api/admin/stream")]
    [Authorize]
    public class StreamController : ControllerBase
    {
        private readonly ApplicationDbContext _db;
        private readonly IConfiguration _config;
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly ILogger<StreamController> _logger;

        public StreamController(
            ApplicationDbContext db,
            IConfiguration config,
            IHttpClientFactory httpClientFactory,
            ILogger<StreamController> logger)
        {
            _db = db;
            _config = config;
            _httpClientFactory = httpClientFactory;
            _logger = logger;
        }

        /// <summary>
        /// Proxy del playlist HLS desde central-mediamtx hacia el cliente.
        /// GET /api/admin/stream/{id}/hls  → http://central-mediamtx:8888/{streamPath}/index.m3u8
        /// </summary>
        [HttpGet("{id:int}/hls")]
        public async Task<IActionResult> GetHls(int id, CancellationToken ct)
        {
            var camera = await _db.Cameras.FindAsync(new object[] { id }, ct);
            if (camera == null) return NotFound(new { message = "Cámara no encontrada" });

            // Obtener streamPath desde el campo Streams (JSON) de la cámara.
            // Soporta múltiples formatos: centralRtsp/centralHls (legacy),
            // rtsp/hls (normalizado por register handler), streams.hls (edge-agent).
            string? streamPath = null;
            if (!string.IsNullOrEmpty(camera.Streams))
            {
                try
                {
                    var doc  = JsonDocument.Parse(camera.Streams);
                    var root = doc.RootElement;

                    static string? HlsUrlToPath(string? hlsUrl)
                    {
                        if (string.IsNullOrEmpty(hlsUrl)) return null;
                        try { return new Uri(hlsUrl).AbsolutePath.TrimStart('/').Replace("/index.m3u8", ""); }
                        catch { return null; }
                    }

                    static string? RtspUrlToPath(string? rtspUrl)
                    {
                        if (string.IsNullOrEmpty(rtspUrl)) return null;
                        try { return new Uri(rtspUrl).AbsolutePath.TrimStart('/'); }
                        catch { return null; }
                    }

                    // 1. centralRtsp (formato legacy)
                    if (streamPath == null && root.TryGetProperty("centralRtsp", out var crEl))
                        streamPath = RtspUrlToPath(crEl.GetString());

                    // 2. centralHls (formato legacy)
                    if (streamPath == null && root.TryGetProperty("centralHls", out var chEl))
                        streamPath = HlsUrlToPath(chEl.GetString());

                    // 3. rtsp top-level (formato normalizado por register handler)
                    if (streamPath == null && root.TryGetProperty("rtsp", out var rtspEl))
                        streamPath = RtspUrlToPath(rtspEl.GetString());

                    // 4. hls top-level (formato normalizado)
                    if (streamPath == null && root.TryGetProperty("hls", out var hlsEl))
                        streamPath = HlsUrlToPath(hlsEl.GetString());

                    // 5. streams.hls anidado (formato edge-agent directo)
                    if (streamPath == null && root.TryGetProperty("streams", out var streamsEl)
                        && streamsEl.TryGetProperty("hls", out var nestedHlsEl))
                        streamPath = HlsUrlToPath(nestedHlsEl.GetString());

                    // 6. streams.main anidado (formato edge-agent, fallback RTSP)
                    if (streamPath == null && root.TryGetProperty("streams", out var streamsEl2)
                        && streamsEl2.TryGetProperty("main", out var mainEl))
                        streamPath = RtspUrlToPath(mainEl.GetString());
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "No se pudo parsear Streams de cámara {Id}", id);
                }
            }

            // Fallback: usar CameraKey si no hay streamPath
            if (string.IsNullOrEmpty(streamPath))
                streamPath = camera.CameraKey ?? $"camera-{id}";

            var mediamtxBase = _config["Mediamtx:HlsBaseUrl"] ?? "http://central-mediamtx:8888";
            var hlsPlaylist  = $"{mediamtxBase}/{streamPath}/index.m3u8";

            try
            {
                var client   = _httpClientFactory.CreateClient("mediamtx");
                var response = await client.GetAsync(hlsPlaylist, ct);

                if (!response.IsSuccessStatusCode)
                {
                    _logger.LogWarning("MediaMTX devolvió {Status} para {Path}", response.StatusCode, streamPath);
                    return StatusCode((int)response.StatusCode,
                        new { message = "Stream no disponible", path = streamPath });
                }

                var content     = await response.Content.ReadAsStringAsync(ct);
                var contentType = response.Content.Headers.ContentType?.ToString() ?? "application/vnd.apple.mpegurl";

                return Content(content, contentType);
            }
            catch (HttpRequestException ex)
            {
                _logger.LogError(ex, "Error conectando a MediaMTX en {Url}", hlsPlaylist);
                return StatusCode(503, new { message = "Servicio de stream no disponible" });
            }
        }

        /// <summary>
        /// Devuelve la URL HLS pública para que el frontend la use directamente.
        /// </summary>
        [HttpGet("{id:int}/hls-url")]
        public async Task<IActionResult> GetHlsUrl(int id, CancellationToken ct)
        {
            var camera = await _db.Cameras.FindAsync(new object[] { id }, ct);
            if (camera == null) return NotFound();

            var streamPath   = camera.CameraKey ?? $"camera-{id}";
            var mediamtxBase = _config["Mediamtx:HlsPublicUrl"]
                            ?? _config["Mediamtx:HlsBaseUrl"]
                            ?? "http://central-mediamtx:8888";

            return Ok(new
            {
                hlsUrl     = $"{mediamtxBase}/{streamPath}/index.m3u8",
                streamPath = streamPath,
                cameraId   = camera.Id,
                status     = camera.Status
            });
        }
    }
}
