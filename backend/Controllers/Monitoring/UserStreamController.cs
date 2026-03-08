using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
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
        private readonly IMemoryCache _cache;

        public UserStreamController(
            ApplicationDbContext db,
            IConfiguration config,
            IHttpClientFactory httpClientFactory,
            ILogger<UserStreamController> logger,
            IMemoryCache cache)
        {
            _db                = db;
            _config            = config;
            _httpClientFactory = httpClientFactory;
            _logger            = logger;
            _cache             = cache;
        }

        private int GetCurrentUserId()
        {
            var raw = User.FindFirstValue(JwtRegisteredClaimNames.Sub)
                      ?? User.FindFirstValue(ClaimTypes.NameIdentifier);
            return int.TryParse(raw, out var id) ? id : 0;
        }

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
                var token = HttpContext.Request.Query["token"].FirstOrDefault();
                content = RewritePlaylistUrls(content, cameraId, token);

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

            var camera = await GetAuthorizedCameraCached(cameraId, ct);
            if (camera == null) return NotFound(new { message = "Acceso denegado." });

            var streamPath  = ResolveStreamPath(camera);
            var isPlaylist  = segment.EndsWith(".m3u8");

            // Construir URL del segmento; reenviar parámetros LL-HLS para sub-playlists.
            // Sin estos params MediaMTX responde de inmediato en vez de esperar el siguiente
            // segmento, lo que deja a Safari sin frames nuevos y el video se congela.
            var segmentUrl = $"{MediamtxBase()}/{streamPath}/{segment}";
            if (isPlaylist)
            {
                var llParams = new List<string>();
                var msn  = HttpContext.Request.Query["_HLS_msn"].FirstOrDefault();
                var part = HttpContext.Request.Query["_HLS_part"].FirstOrDefault();
                var skip = HttpContext.Request.Query["_HLS_skip"].FirstOrDefault();
                if (msn  != null) llParams.Add($"_HLS_msn={Uri.EscapeDataString(msn)}");
                if (part != null) llParams.Add($"_HLS_part={Uri.EscapeDataString(part)}");
                if (skip != null) llParams.Add($"_HLS_skip={Uri.EscapeDataString(skip)}");
                if (llParams.Count > 0)
                    segmentUrl += "?" + string.Join("&", llParams);
            }

            try
            {
                var http = _httpClientFactory.CreateClient("mediamtx");

                if (isPlaylist)
                {
                    var response = await http.GetAsync(segmentUrl, ct);
                    if (!response.IsSuccessStatusCode)
                        return StatusCode((int)response.StatusCode, new { message = "Segmento no disponible." });

                    var content = await response.Content.ReadAsStringAsync(ct);
                    var token = HttpContext.Request.Query["token"].FirstOrDefault();
                    content = RewritePlaylistUrls(content, cameraId, token);
                    return Content(content, "application/vnd.apple.mpegurl");
                }
                else
                {
                    var contentType = segment.EndsWith(".mp4") || segment.EndsWith(".m4s")
                        ? "video/mp4" : "video/MP2T";

                    using var response = await http.GetAsync(segmentUrl, HttpCompletionOption.ResponseHeadersRead, ct);
                    if (!response.IsSuccessStatusCode)
                        return StatusCode((int)response.StatusCode, new { message = "Segmento no disponible." });

                    Response.ContentType = contentType;
                    if (response.Content.Headers.ContentLength.HasValue)
                        Response.ContentLength = response.Content.Headers.ContentLength.Value;

                    await response.Content.CopyToAsync(Response.Body, ct);
                    return new EmptyResult();
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
        private async Task<Models.Camera?> GetAuthorizedCameraCached(int cameraId, CancellationToken ct = default)
        {
            var userId   = GetCurrentUserId();
            var cacheKey = $"stream-auth:{userId}:{cameraId}";

            if (_cache.TryGetValue(cacheKey, out bool isAuthorized))
            {
                if (!isAuthorized) return null;
                return await _db.Cameras.FindAsync(new object[] { cameraId }, ct);
            }

            var camera     = await GetAuthorizedCamera(cameraId);
            var authorized = camera != null;
            _cache.Set(cacheKey, authorized, TimeSpan.FromMinutes(5));
            return camera;
        }

        private async Task<Models.Camera?> GetAuthorizedCamera(int cameraId)
        {
            var userId = GetCurrentUserId();
            var role   = GetCurrentUserRole();

            if (role == "admin" || role == "installer")
                return await _db.Cameras.FindAsync(cameraId);

            // Para usuarios cliente: buscar via Client.UserId → ClientId → Camera.ClientId
            var clientId = await _db.Clients
                .Where(c => c.UserId == userId)
                .Select(c => (int?)c.Id)
                .FirstOrDefaultAsync();

            if (clientId == null) return null;

            return await _db.Cameras
                .FirstOrDefaultAsync(c => c.Id == cameraId && c.ClientId == clientId && c.Status == "active");
        }

        private string MediamtxBase() =>
            _config["Mediamtx:HlsBaseUrl"] ?? "http://central-mediamtx:8888";

        private string ResolveStreamPath(Models.Camera camera)
        {
            if (!string.IsNullOrEmpty(camera.Streams))
            {
                try
                {
                    var doc  = JsonDocument.Parse(camera.Streams);
                    var root = doc.RootElement;

                    static string? HlsPath(string? url)
                    {
                        if (string.IsNullOrEmpty(url)) return null;
                        try { return new Uri(url).AbsolutePath.TrimStart('/').Replace("/index.m3u8", ""); }
                        catch { return null; }
                    }
                    static string? RtspPath(string? url)
                    {
                        if (string.IsNullOrEmpty(url)) return null;
                        try { return new Uri(url).AbsolutePath.TrimStart('/'); }
                        catch { return null; }
                    }

                    string? path = null;

                    // 1. centralRtsp (formato legacy)
                    if (path == null && root.TryGetProperty("centralRtsp", out var el1))
                        path = RtspPath(el1.GetString());

                    // 2. centralHls (formato legacy)
                    if (path == null && root.TryGetProperty("centralHls", out var el2))
                        path = HlsPath(el2.GetString());

                    // 3. rtsp top-level (normalizado)
                    if (path == null && root.TryGetProperty("rtsp", out var el3))
                        path = RtspPath(el3.GetString());

                    // 4. hls top-level (normalizado)
                    if (path == null && root.TryGetProperty("hls", out var el4))
                        path = HlsPath(el4.GetString());

                    // 5. streams.hls anidado (edge-agent directo)
                    if (path == null && root.TryGetProperty("streams", out var nested)
                        && nested.TryGetProperty("hls", out var el5))
                        path = HlsPath(el5.GetString());

                    // 6. streams.main anidado (edge-agent, fallback RTSP)
                    if (path == null && root.TryGetProperty("streams", out var nested2)
                        && nested2.TryGetProperty("main", out var el6))
                        path = RtspPath(el6.GetString());

                    if (!string.IsNullOrEmpty(path)) return path;
                }
                catch { /* ignorar */ }
            }
            return camera.CameraKey ?? $"camera-{camera.Id}";
        }

        private static string RewritePlaylistUrls(string content, int cameraId, string? token = null)
        {
            var qs = !string.IsNullOrEmpty(token) ? $"?token={Uri.EscapeDataString(token)}" : "";

            // 1. Reescribir URLs absolutas de MediaMTX (http[s]://host/path/seg.ext)
            content = System.Text.RegularExpressions.Regex.Replace(
                content,
                @"^https?://[^\s]+/([\w\-]+\.(m3u8|ts|mp4|m4s))$",
                m => $"/api/stream/{cameraId}/hls/{m.Groups[1].Value}{qs}",
                System.Text.RegularExpressions.RegexOptions.Multiline);

            // 2. Reescribir URLs relativas con o sin subdirectorio — extraer solo el filename
            content = System.Text.RegularExpressions.Regex.Replace(
                content,
                @"^(?!#|http|/)(?:[^\s]*/)?(\w[\w\-]*\.(m3u8|ts|mp4|m4s))$",
                m => $"/api/stream/{cameraId}/hls/{m.Groups[1].Value}{qs}",
                System.Text.RegularExpressions.RegexOptions.Multiline);

            // 3 y 4. Solo para Safari (qs no vacío): reescribir init segment y partes LL-HLS.
            //    HLS.js resuelve las URIs relativas correctamente y no necesita estas reescrituras.
            //    Safari native HLS sí necesita el token en cada recurso individual.
            if (!string.IsNullOrEmpty(qs))
            {
                // 3. Reescribir #EXT-X-MAP:URI — init segment fMP4/CMAF
                content = System.Text.RegularExpressions.Regex.Replace(
                    content,
                    @"(#EXT-X-MAP:URI=""?)(?:https?://[^\s""]*?/|(?:[^""/ \t]*/))?([\w\-]+\.(?:mp4|m4s))(""?)",
                    m =>
                    {
                        var filename = m.Groups[2].Value;
                        return $"{m.Groups[1].Value}/api/stream/{cameraId}/hls/{filename}{qs}{m.Groups[3].Value}";
                    });

                // 4. Reescribir #EXT-X-PART:...,URI — partes LL-HLS
                //    Sin esto Safari intenta descargar las partes sin token y recibe 401,
                //    lo que impide que el stream arranque en iOS.
                content = System.Text.RegularExpressions.Regex.Replace(
                    content,
                    @"(#EXT-X-PART:[^""\n]*URI="")(?:https?://[^\s""]*?/|(?:[^""/ \t]*/))?([^""\s]+\.(?:mp4|m4s))("")",
                    m =>
                    {
                        var filename = m.Groups[2].Value;
                        return $"{m.Groups[1].Value}/api/stream/{cameraId}/hls/{filename}{qs}{m.Groups[3].Value}";
                    });

                // 5. Reescribir #EXT-X-PRELOAD-HINT:TYPE=PART,URI — carga anticipada del siguiente part LL-HLS.
                //    Safari 18 intenta precargar este recurso antes de que esté disponible.
                //    Sin token → 401 → Safari no puede avanzar el stream y se congela.
                content = System.Text.RegularExpressions.Regex.Replace(
                    content,
                    @"(#EXT-X-PRELOAD-HINT:[^""\n]*URI="")(?:https?://[^\s""]*?/|(?:[^""/ \t]*/))?([^""\s]+\.(?:mp4|m4s))("")",
                    m =>
                    {
                        var filename = m.Groups[2].Value;
                        return $"{m.Groups[1].Value}/api/stream/{cameraId}/hls/{filename}{qs}{m.Groups[3].Value}";
                    });
            }

            return content;
        }
    }
}
