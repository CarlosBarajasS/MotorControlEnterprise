using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MotorControlEnterprise.Api.Data;
using System.Security.Claims;
using System.Text.Json;
using System.IdentityModel.Tokens.Jwt;

namespace MotorControlEnterprise.Api.Controllers
{
    /// <summary>
    /// Proxy de streaming HLS para usuarios normales.
    /// Valida que la cámara pertenezca al usuario antes de hacer proxy.
    /// Ruta base: /api/stream
    /// </summary>
    [ApiController]
    [Route("api/stream")]
    [Authorize]
    public class UserStreamController : ControllerBase
    {
        private readonly ApplicationDbContext _db;
        private readonly IConfiguration _config;
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly ILogger<UserStreamController> _logger;

        public UserStreamController(
            ApplicationDbContext db,
            IConfiguration config,
            IHttpClientFactory httpClientFactory,
            ILogger<UserStreamController> logger)
        {
            _db                = db;
            _config            = config;
            _httpClientFactory = httpClientFactory;
            _logger            = logger;
        }

        private int GetCurrentUserId() =>
            int.Parse(User.FindFirstValue(JwtRegisteredClaimNames.Sub)
                      ?? User.FindFirstValue(ClaimTypes.NameIdentifier)
                      ?? "0");

        private string GetCurrentUserRole() =>
            User.FindFirstValue(ClaimTypes.Role) ?? "client";

        // ─── GET /api/stream/{cameraId}/hls ──────────────────────────────────
        [HttpGet("{cameraId:int}/hls")]
        public async Task<IActionResult> GetHls(int cameraId, CancellationToken ct)
        {
            var camera = await GetAuthorizedCamera(cameraId);
            if (camera == null) return NotFound(new { message = "Cámara no encontrada o acceso denegado." });

            var streamPath  = ResolveStreamPath(camera);
            var mediamtxUrl = $"{MediamtxBase()}/{streamPath}/index.m3u8";

            try
            {
                var http     = _httpClientFactory.CreateClient("mediamtx");
                var response = await http.GetAsync(mediamtxUrl, ct);

                if (!response.IsSuccessStatusCode)
                    return StatusCode((int)response.StatusCode, new { message = "Stream no disponible." });

                var content     = await response.Content.ReadAsStringAsync(ct);
                var contentType = response.Content.Headers.ContentType?.ToString()
                                  ?? "application/vnd.apple.mpegurl";

                // Reescribir segmentos relativos para que pasen por el proxy
                content = RewritePlaylistUrls(content, cameraId);

                // Actualizar lastSeen
                camera.LastSeen  = DateTime.UtcNow;
                camera.UpdatedAt = DateTime.UtcNow;
                _ = _db.SaveChangesAsync(CancellationToken.None);

                return Content(content, contentType);
            }
            catch (HttpRequestException ex)
            {
                _logger.LogError(ex, "Error conectando a MediaMTX para cámara {CameraId}", cameraId);
                return StatusCode(503, new { message = "Servicio de stream no disponible." });
            }
        }

        // ─── GET /api/stream/{cameraId}/hls/{segment} ────────────────────────
        [HttpGet("{cameraId:int}/hls/{segment}")]
        public async Task<IActionResult> GetHlsSegment(int cameraId, string segment, CancellationToken ct)
        {
            // Validar nombre de segmento (seguridad — sin path traversal)
            if (!System.Text.RegularExpressions.Regex.IsMatch(segment, @"^[\w\-]+\.(ts|m3u8|mp4|m4s)$"))
                return BadRequest(new { message = "Nombre de segmento inválido." });

            var camera = await GetAuthorizedCamera(cameraId);
            if (camera == null) return NotFound(new { message = "Acceso denegado." });

            var streamPath  = ResolveStreamPath(camera);
            var segmentUrl  = $"{MediamtxBase()}/{streamPath}/{segment}";
            var isPlaylist  = segment.EndsWith(".m3u8");

            try
            {
                var http     = _httpClientFactory.CreateClient("mediamtx");
                var response = await http.GetAsync(segmentUrl, ct);

                if (!response.IsSuccessStatusCode)
                    return StatusCode((int)response.StatusCode, new { message = "Segmento no disponible." });

                if (isPlaylist)
                {
                    var content = await response.Content.ReadAsStringAsync(ct);
                    content = RewritePlaylistUrls(content, cameraId);
                    return Content(content, "application/vnd.apple.mpegurl");
                }
                else
                {
                    var contentType = segment.EndsWith(".mp4") || segment.EndsWith(".m4s")
                        ? "video/mp4" : "video/MP2T";
                    var bytes = await response.Content.ReadAsByteArrayAsync(ct);
                    return File(bytes, contentType);
                }
            }
            catch (HttpRequestException ex)
            {
                _logger.LogError(ex, "Error obteniendo segmento {Segment} para cámara {CameraId}", segment, cameraId);
                return StatusCode(502, new { message = "Error al obtener segmento." });
            }
        }

        // ─── GET /api/stream/{cameraId}/rtsp ─────────────────────────────────
        [HttpGet("{cameraId:int}/rtsp")]
        public async Task<IActionResult> GetRtsp(int cameraId)
        {
            var camera = await GetAuthorizedCamera(cameraId);
            if (camera == null) return NotFound(new { message = "Acceso denegado." });

            if (string.IsNullOrEmpty(camera.Streams))
                return NotFound(new { message = "Stream RTSP no disponible." });

            try
            {
                var doc = JsonDocument.Parse(camera.Streams);
                var rtsp = doc.RootElement.TryGetProperty("rtsp", out var el) ? el.GetString() : null;
                if (string.IsNullOrEmpty(rtsp))
                    return NotFound(new { message = "Stream RTSP no disponible." });

                return Ok(new { url = rtsp, message = "Abre esta URL en VLC u otro reproductor RTSP." });
            }
            catch
            {
                return NotFound(new { message = "Stream RTSP no disponible." });
            }
        }

        // ─── GET /api/stream/{cameraId}/webrtc ───────────────────────────────
        [HttpGet("{cameraId:int}/webrtc")]
        public async Task<IActionResult> GetWebrtc(int cameraId)
        {
            var camera = await GetAuthorizedCamera(cameraId);
            if (camera == null) return NotFound(new { message = "Acceso denegado." });

            if (string.IsNullOrEmpty(camera.Streams))
                return NotFound(new { message = "Stream WebRTC no disponible." });

            try
            {
                var doc    = JsonDocument.Parse(camera.Streams);
                var webrtc = doc.RootElement.TryGetProperty("webrtc", out var el) ? el.GetString() : null;
                if (string.IsNullOrEmpty(webrtc))
                    return NotFound(new { message = "Stream WebRTC no disponible." });

                return Ok(new { url = webrtc, type = "webrtc" });
            }
            catch
            {
                return NotFound(new { message = "Stream WebRTC no disponible." });
            }
        }

        // ─── GET /api/stream/{cameraId}/snapshot ─────────────────────────────
        [HttpGet("{cameraId:int}/snapshot")]
        public async Task<IActionResult> GetSnapshot(int cameraId)
        {
            var camera = await GetAuthorizedCamera(cameraId);
            if (camera == null) return NotFound(new { message = "Acceso denegado." });

            return StatusCode(501, new
            {
                message = "Snapshot aún no implementado.",
                note    = "Futura funcionalidad: capturar frame via FFmpeg."
            });
        }

        // ─── Helpers ──────────────────────────────────────────────────────────
        private async Task<Models.Camera?> GetAuthorizedCamera(int cameraId)
        {
            var userId = GetCurrentUserId();
            var role   = GetCurrentUserRole();

            if (role == "admin")
                return await _db.Cameras.FindAsync(cameraId);

            return await _db.Cameras
                .FirstOrDefaultAsync(c => c.Id == cameraId && c.UserId == userId && c.Status == "active");
        }

        private string MediamtxBase() =>
            _config["Mediamtx:HlsBaseUrl"] ?? "http://central-mediamtx:8888";

        private string ResolveStreamPath(Models.Camera camera)
        {
            if (!string.IsNullOrEmpty(camera.Streams))
            {
                try
                {
                    var doc = JsonDocument.Parse(camera.Streams);
                    if (doc.RootElement.TryGetProperty("centralRtsp", out var rtspEl))
                    {
                        var rtspUrl = rtspEl.GetString();
                        if (!string.IsNullOrEmpty(rtspUrl))
                            return new Uri(rtspUrl).AbsolutePath.TrimStart('/');
                    }
                    if (doc.RootElement.TryGetProperty("centralHls", out var hlsEl))
                    {
                        var hlsUrl = hlsEl.GetString();
                        if (!string.IsNullOrEmpty(hlsUrl))
                            return new Uri(hlsUrl).AbsolutePath.TrimStart('/').Replace("/index.m3u8", "");
                    }
                }
                catch { /* ignorar */ }
            }
            return camera.CameraKey ?? $"camera-{camera.Id}";
        }

        private static string RewritePlaylistUrls(string content, int cameraId)
        {
            return System.Text.RegularExpressions.Regex.Replace(
                content,
                @"^((?!#|http)[^\s]+\.(m3u8|ts|mp4|m4s))$",
                m => $"/api/stream/{cameraId}/hls/{m.Value}",
                System.Text.RegularExpressions.RegexOptions.Multiline);
        }
    }
}
