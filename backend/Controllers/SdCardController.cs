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
    /// Acceso a grabaciones almacenadas en la tarjeta SD de las cámaras.
    /// Usa MQTT request-response para comunicarse con el edge gateway.
    /// Ruta base: /api/cameras/{cameraId}/sdcard
    /// </summary>
    [ApiController]
    [Route("api/cameras/{cameraId:int}/sdcard")]
    [Authorize]
    public class SdCardController : ControllerBase
    {
        private readonly ApplicationDbContext _db;
        private readonly ICameraEdgeService _edge;
        private readonly ILogger<SdCardController> _logger;

        public SdCardController(ApplicationDbContext db, ICameraEdgeService edge, ILogger<SdCardController> logger)
        {
            _db     = db;
            _edge   = edge;
            _logger = logger;
        }

        // ─── GET /api/cameras/{cameraId}/sdcard?start=ISO&end=ISO ─────────────
        /// <summary>Lista grabaciones en la SD card entre dos fechas.</summary>
        [HttpGet]
        public async Task<IActionResult> ListRecordings(
            int cameraId,
            [FromQuery] DateTime? start = null,
            [FromQuery] DateTime? end   = null,
            CancellationToken ct = default)
        {
            var (camera, gatewayId, error) = await GetCameraWithGateway(cameraId);
            if (error != null) return error;

            try
            {
                var response = await _edge.RequestEdgeAsync(
                    gatewayId!, "isapi", "listSdRecordings",
                    new
                    {
                        cameraId   = camera!.CameraId ?? camera.CameraKey,
                        startTime  = start?.ToUniversalTime().ToString("o"),
                        endTime    = end?.ToUniversalTime().ToString("o")
                    },
                    12000, ct);

                return Ok(JsonDocument.Parse(response).RootElement);
            }
            catch (TimeoutException)
            {
                return StatusCode(504, new { message = "El gateway no respondió. La cámara puede estar offline." });
            }
            catch (InvalidOperationException ex)
            {
                return StatusCode(503, new { message = ex.Message });
            }
        }

        // ─── POST /api/cameras/{cameraId}/sdcard/play ─────────────────────────
        /// <summary>
        /// Inicia la reproducción de un clip SD mediante relay RTSP en mediamtx.
        /// Body: { "playbackUri": "rtsp://..." }
        /// Devuelve: { "pathName": "...", "hlsPath": "http://central-mediamtx:8888/.../index.m3u8" }
        /// </summary>
        [HttpPost("play")]
        public async Task<IActionResult> StartPlayback(
            int cameraId,
            [FromBody] SdPlaybackRequest req,
            CancellationToken ct)
        {
            if (string.IsNullOrWhiteSpace(req.PlaybackUri))
                return BadRequest(new { message = "playbackUri es requerido." });

            var (camera, gatewayId, error) = await GetCameraWithGateway(cameraId);
            if (error != null) return error;

            try
            {
                var response = await _edge.RequestEdgeAsync(
                    gatewayId!, "isapi", "startSdPlayback",
                    new
                    {
                        cameraId    = camera!.CameraId ?? camera.CameraKey,
                        playbackUri = req.PlaybackUri
                    },
                    20000, ct);

                return Ok(JsonDocument.Parse(response).RootElement);
            }
            catch (TimeoutException)
            {
                return StatusCode(504, new { message = "El gateway no respondió al iniciar la reproducción." });
            }
            catch (InvalidOperationException ex)
            {
                return StatusCode(503, new { message = ex.Message });
            }
        }

        // ─── Helpers ──────────────────────────────────────────────────────────
        private async Task<(Models.Camera? camera, string? gatewayId, IActionResult? error)>
            GetCameraWithGateway(int cameraId)
        {
            var userId = int.Parse(User.FindFirstValue(JwtRegisteredClaimNames.Sub)
                         ?? User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "0");
            var role   = User.FindFirstValue(ClaimTypes.Role);

            var camera = await _db.Cameras
                .Include(c => c.Client)
                .FirstOrDefaultAsync(c => c.Id == cameraId &&
                    (role == "admin" || c.UserId == userId));

            if (camera == null)
                return (null, null, NotFound(new { message = "Cámara no encontrada." }));

            var gatewayId = camera.Client?.GatewayId;
            if (string.IsNullOrEmpty(gatewayId))
                return (null, null, BadRequest(new { message = "Esta cámara no tiene gateway asignado." }));

            return (camera, gatewayId, null);
        }
    }

    public class SdPlaybackRequest
    {
        public string PlaybackUri { get; set; } = string.Empty;
    }
}
