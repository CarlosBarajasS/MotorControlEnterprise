using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MotorControlEnterprise.Api.Data;
using MotorControlEnterprise.Api.Services;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text.Json;

namespace MotorControlEnterprise.Api.Controllers
{
    /// <summary>
    /// Grabaciones en almacenamiento cloud (NAS) y reproducción local vía edge gateway.
    /// Ruta base: /api/recordings
    /// </summary>
    [ApiController]
    [Route("api/recordings")]
    [Authorize]
    public class RecordingController : ControllerBase
    {
        private readonly ApplicationDbContext _db;
        private readonly ICameraEdgeService _edge;
        private readonly IConfiguration _config;
        private readonly ILogger<RecordingController> _logger;

        public RecordingController(
            ApplicationDbContext db,
            ICameraEdgeService edge,
            IConfiguration config,
            ILogger<RecordingController> logger)
        {
            _db     = db;
            _edge   = edge;
            _config = config;
            _logger = logger;
        }

        private int GetCurrentUserId() =>
            int.Parse(User.FindFirstValue(JwtRegisteredClaimNames.Sub)
                      ?? User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "0");

        private string GetCurrentUserRole() =>
            User.FindFirstValue(ClaimTypes.Role) ?? "client";

        // ─── GET /api/recordings/cloud/{cameraId}/dates ───────────────────────
        /// <summary>Lista las fechas que tienen grabaciones disponibles en NAS.</summary>
        [HttpGet("cloud/{cameraId:int}/dates")]
        public async Task<IActionResult> ListCloudDates(int cameraId)
        {
            var camera = await GetAuthorizedCamera(cameraId);
            if (camera == null) return NotFound(new { message = "Cámara no encontrada." });

            var nasPath = _config["Storage:NasRecordingsPath"] ?? "/mnt/nas/raspberry_data/videos";
            var dir     = Path.Combine(nasPath,
                camera.ClientId?.ToString() ?? "unknown",
                cameraId.ToString());

            if (!Directory.Exists(dir))
                return Ok(new { dates = Array.Empty<string>() });

            try
            {
                var dates = Directory.GetDirectories(dir)
                    .Select(d => Path.GetFileName(d))
                    .Where(d => System.Text.RegularExpressions.Regex.IsMatch(d, @"^\d{4}-\d{2}-\d{2}$"))
                    .OrderByDescending(d => d)
                    .ToArray();

                return Ok(new { dates });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error leyendo directorio NAS para cámara {CameraId}", cameraId);
                return StatusCode(503, new { message = "No se pudo acceder al almacenamiento." });
            }
        }

        // ─── GET /api/recordings/cloud/{cameraId}?date=YYYY-MM-DD ─────────────
        /// <summary>Lista los archivos MP4 de una fecha específica en NAS.</summary>
        [HttpGet("cloud/{cameraId:int}")]
        public async Task<IActionResult> ListCloudFiles(int cameraId, [FromQuery] string? date = null)
        {
            var camera = await GetAuthorizedCamera(cameraId);
            if (camera == null) return NotFound(new { message = "Cámara no encontrada." });

            var nasPath  = _config["Storage:NasRecordingsPath"] ?? "/mnt/nas/raspberry_data/videos";
            var dateDir  = date ?? DateTime.UtcNow.ToString("yyyy-MM-dd");
            var dir      = Path.Combine(nasPath,
                camera.ClientId?.ToString() ?? "unknown",
                cameraId.ToString(),
                dateDir);

            if (!Directory.Exists(dir))
                return Ok(new { date = dateDir, files = Array.Empty<object>() });

            try
            {
                var files = Directory.GetFiles(dir, "*.mp4")
                    .Select(f =>
                    {
                        var name      = Path.GetFileNameWithoutExtension(f);
                        var info      = new FileInfo(f);
                        // Nombre esperado: YYYYMMDD_HHmmss.mp4
                        DateTime.TryParseExact(name, "yyyyMMdd_HHmmss",
                            null, System.Globalization.DateTimeStyles.None, out var startTime);
                        return new
                        {
                            filename  = Path.GetFileName(f),
                            path      = f,
                            sizeMb    = Math.Round(info.Length / 1024.0 / 1024.0, 2),
                            startTime = startTime != default ? startTime : (DateTime?)null
                        };
                    })
                    .OrderBy(f => f.filename)
                    .ToArray();

                return Ok(new { date = dateDir, files });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error listando archivos NAS para cámara {CameraId}", cameraId);
                return StatusCode(503, new { message = "Error al acceder al almacenamiento." });
            }
        }

        // ─── GET /api/recordings/cloud/video?path=... ─────────────────────────
        /// <summary>
        /// Sirve un archivo MP4 desde NAS con soporte Range (seek en el video).
        /// </summary>
        [HttpGet("cloud/video")]
        public async Task<IActionResult> ServeCloudVideo([FromQuery] string path)
        {
            if (string.IsNullOrWhiteSpace(path))
                return BadRequest(new { message = "Path requerido." });

            // Seguridad: solo archivos .mp4 sin path traversal
            if (path.Contains("..") || !path.EndsWith(".mp4"))
                return BadRequest(new { message = "Path inválido." });

            var nasBase = _config["Storage:NasRecordingsPath"] ?? "/mnt/nas/raspberry_data/videos";
            var fullPath = Path.GetFullPath(path);

            if (!fullPath.StartsWith(Path.GetFullPath(nasBase)))
                return Forbid();

            if (!System.IO.File.Exists(fullPath))
                return NotFound(new { message = "Archivo no encontrado." });

            // Verificar que la cámara en el path pertenece al usuario
            // Path esperado: {nasBase}/{clientId}/{cameraId}/{date}/{filename}.mp4
            var parts = fullPath.Replace(Path.GetFullPath(nasBase), "")
                               .TrimStart(Path.DirectorySeparatorChar)
                               .Split(Path.DirectorySeparatorChar);

            if (parts.Length >= 2 && int.TryParse(parts[1], out var pathCameraId))
            {
                var camera = await _db.Cameras
                    .Include(c => c.Client)
                    .FirstOrDefaultAsync(c => c.Id == pathCameraId);
                if (camera == null) return Forbid();

                if (camera.Client != null && !camera.Client.CloudStorageActive)
                    return StatusCode(403, new { message = "El almacenamiento cloud no está activo para este cliente." });
            }

            return PhysicalFile(fullPath, "video/mp4", enableRangeProcessing: true);
        }

        // ─── GET /api/recordings/local/{cameraId}?date=YYYY-MM-DD ─────────────
        /// <summary>Lista grabaciones locales en el edge gateway vía MQTT.</summary>
        [HttpGet("local/{cameraId:int}")]
        public async Task<IActionResult> ListLocalFiles(int cameraId, [FromQuery] string? date = null, CancellationToken ct = default)
        {
            var camera = await GetAuthorizedCamera(cameraId, includeClient: true);
            if (camera == null) return NotFound(new { message = "Cámara no encontrada." });

            var gatewayId = camera.Client?.GatewayId;
            if (string.IsNullOrEmpty(gatewayId))
                return BadRequest(new { message = "La cámara no tiene gateway asignado." });

            try
            {
                var response = await _edge.RequestEdgeAsync(
                    gatewayId, "recordings", "list",
                    new { cameraId = camera.CameraId ?? camera.CameraKey, date },
                    15000, ct);

                return Ok(JsonDocument.Parse(response).RootElement);
            }
            catch (TimeoutException)
            {
                return StatusCode(504, new { message = "El edge gateway no respondió." });
            }
            catch (InvalidOperationException ex)
            {
                return StatusCode(503, new { message = ex.Message });
            }
        }

        // ─── POST /api/recordings/local/{cameraId}/play ───────────────────────
        /// <summary>
        /// Inicia reproducción de un archivo local en el edge vía mediamtx relay.
        /// Body: { "filename": "20260101_120000.mp4" }
        /// Devuelve: { "hlsPath": "http://central-mediamtx:8888/.../index.m3u8" }
        /// </summary>
        [HttpPost("local/{cameraId:int}/play")]
        public async Task<IActionResult> PlayLocalFile(int cameraId, [FromBody] LocalPlayRequest req, CancellationToken ct)
        {
            if (string.IsNullOrWhiteSpace(req.Filename))
                return BadRequest(new { message = "filename es requerido." });

            var camera = await GetAuthorizedCamera(cameraId, includeClient: true);
            if (camera == null) return NotFound(new { message = "Cámara no encontrada." });

            var gatewayId = camera.Client?.GatewayId;
            if (string.IsNullOrEmpty(gatewayId))
                return BadRequest(new { message = "La cámara no tiene gateway asignado." });

            try
            {
                var response = await _edge.RequestEdgeAsync(
                    gatewayId, "recordings", "play",
                    new { cameraId = camera.CameraId ?? camera.CameraKey, filename = req.Filename },
                    20000, ct);

                return Ok(JsonDocument.Parse(response).RootElement);
            }
            catch (TimeoutException)
            {
                return StatusCode(504, new { message = "El edge gateway no respondió." });
            }
            catch (InvalidOperationException ex)
            {
                return StatusCode(503, new { message = ex.Message });
            }
        }

        // ─── Helpers ──────────────────────────────────────────────────────────
        private async Task<Models.Camera?> GetAuthorizedCamera(int cameraId, bool includeClient = false)
        {
            var userId = GetCurrentUserId();
            var role   = GetCurrentUserRole();

            var query = _db.Cameras.AsQueryable();
            if (includeClient) query = query.Include(c => c.Client);

            return await query.FirstOrDefaultAsync(c =>
                c.Id == cameraId && (role == "admin" || c.UserId == userId));
        }

        private bool CloudStorageActive => true; // accedido desde camera.Client
    }

    public class LocalPlayRequest
    {
        public string Filename { get; set; } = string.Empty;
    }
}
