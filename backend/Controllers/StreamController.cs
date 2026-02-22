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

            // Obtener streamPath desde el campo Streams (JSON) de la cámara
            string? streamPath = null;
            if (!string.IsNullOrEmpty(camera.Streams))
            {
                try
                {
                    var doc = JsonDocument.Parse(camera.Streams);
                    if (doc.RootElement.TryGetProperty("centralRtsp", out var el))
                    {
                        // Extraer el path del RTSP URL: rtsp://host:port/{path}
                        var rtspUrl = el.GetString();
                        if (!string.IsNullOrEmpty(rtspUrl))
                        {
                            var uri = new Uri(rtspUrl);
                            streamPath = uri.AbsolutePath.TrimStart('/');
                        }
                    }
                    // Fallback: centralHls directo
                    if (streamPath == null && doc.RootElement.TryGetProperty("centralHls", out var hlsEl))
                    {
                        var hlsUrl = hlsEl.GetString();
                        if (!string.IsNullOrEmpty(hlsUrl))
                        {
                            var uri = new Uri(hlsUrl);
                            streamPath = uri.AbsolutePath.TrimStart('/').Replace("/index.m3u8", "");
                        }
                    }
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
