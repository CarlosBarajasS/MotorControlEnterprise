using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MotorControlEnterprise.Api.Data;
using MotorControlEnterprise.Api.Services;
using System.Security.Claims;
using System.Text.Json;
using System.IdentityModel.Tokens.Jwt;

namespace MotorControlEnterprise.Api.Controllers
{
    /// <summary>
    /// Control PTZ (Pan/Tilt/Zoom) para cámaras que lo soportan.
    /// Usa el patrón request-response sobre MQTT vía CameraEdgeService.
    /// Ruta base: /api/cameras/{cameraId}/ptz
    /// </summary>
    [ApiController]
    [Route("api/cameras/{cameraId:int}/ptz")]
    [Authorize]
    public class PtzController : ControllerBase
    {
        private readonly ApplicationDbContext _db;
        private readonly ICameraEdgeService _edge;
        private readonly ILogger<PtzController> _logger;

        public PtzController(ApplicationDbContext db, ICameraEdgeService edge, ILogger<PtzController> logger)
        {
            _db     = db;
            _edge   = edge;
            _logger = logger;
        }

        public record PtzMoveRequest(int Pan = 0, int Tilt = 0, int Zoom = 0);

        // ─── POST /api/cameras/{cameraId}/ptz/move ────────────────────────────
        [HttpPost("move")]
        public async Task<IActionResult> Move(int cameraId, [FromBody] PtzMoveRequest req, CancellationToken ct)
        {
            var (camera, error) = await GetPtzCamera(cameraId);
            if (error != null) return error;

            try
            {
                var gatewayId = camera!.Client?.GatewayId
                    ?? await GetGatewayId(camera.ClientId);

                if (string.IsNullOrEmpty(gatewayId))
                    return BadRequest(new { message = "Esta cámara no tiene gateway asignado." });

                var response = await _edge.RequestEdgeAsync(gatewayId, "ptz", "move",
                    new { cameraId = camera.CameraId ?? camera.CameraKey, pan = req.Pan, tilt = req.Tilt, zoom = req.Zoom },
                    8000, ct);

                return Ok(new { success = true, response = JsonDocument.Parse(response).RootElement });
            }
            catch (TimeoutException)
            {
                return StatusCode(504, new { message = "El gateway no respondió a tiempo." });
            }
            catch (InvalidOperationException ex)
            {
                return StatusCode(503, new { message = ex.Message });
            }
        }

        // ─── POST /api/cameras/{cameraId}/ptz/stop ────────────────────────────
        [HttpPost("stop")]
        public async Task<IActionResult> Stop(int cameraId, CancellationToken ct)
        {
            var (camera, error) = await GetPtzCamera(cameraId);
            if (error != null) return error;

            try
            {
                var gatewayId = camera!.Client?.GatewayId ?? await GetGatewayId(camera.ClientId);
                if (string.IsNullOrEmpty(gatewayId))
                    return BadRequest(new { message = "Esta cámara no tiene gateway asignado." });

                var response = await _edge.RequestEdgeAsync(gatewayId, "ptz", "stop",
                    new { cameraId = camera.CameraId ?? camera.CameraKey },
                    8000, ct);

                return Ok(new { success = true });
            }
            catch (TimeoutException)
            {
                return StatusCode(504, new { message = "El gateway no respondió a tiempo." });
            }
            catch (InvalidOperationException ex)
            {
                return StatusCode(503, new { message = ex.Message });
            }
        }

        // ─── GET /api/cameras/{cameraId}/ptz/presets ─────────────────────────
        [HttpGet("presets")]
        public async Task<IActionResult> ListPresets(int cameraId, CancellationToken ct)
        {
            var (camera, error) = await GetPtzCamera(cameraId);
            if (error != null) return error;

            try
            {
                var gatewayId = camera!.Client?.GatewayId ?? await GetGatewayId(camera.ClientId);
                if (string.IsNullOrEmpty(gatewayId))
                    return BadRequest(new { message = "Esta cámara no tiene gateway asignado." });

                var response = await _edge.RequestEdgeAsync(gatewayId, "ptz", "listPresets",
                    new { cameraId = camera.CameraId ?? camera.CameraKey },
                    10000, ct);

                return Ok(JsonDocument.Parse(response).RootElement);
            }
            catch (TimeoutException)
            {
                return StatusCode(504, new { message = "El gateway no respondió a tiempo." });
            }
            catch (InvalidOperationException ex)
            {
                return StatusCode(503, new { message = ex.Message });
            }
        }

        // ─── POST /api/cameras/{cameraId}/ptz/presets/{presetId}/goto ─────────
        [HttpPost("presets/{presetId}/goto")]
        public async Task<IActionResult> GotoPreset(int cameraId, string presetId, CancellationToken ct)
        {
            var (camera, error) = await GetPtzCamera(cameraId);
            if (error != null) return error;

            try
            {
                var gatewayId = camera!.Client?.GatewayId ?? await GetGatewayId(camera.ClientId);
                if (string.IsNullOrEmpty(gatewayId))
                    return BadRequest(new { message = "Esta cámara no tiene gateway asignado." });

                var response = await _edge.RequestEdgeAsync(gatewayId, "ptz", "gotoPreset",
                    new { cameraId = camera.CameraId ?? camera.CameraKey, presetId },
                    10000, ct);

                return Ok(new { success = true });
            }
            catch (TimeoutException)
            {
                return StatusCode(504, new { message = "El gateway no respondió a tiempo." });
            }
            catch (InvalidOperationException ex)
            {
                return StatusCode(503, new { message = ex.Message });
            }
        }

        // ─── Helpers ──────────────────────────────────────────────────────────
        private async Task<(Models.Camera? camera, IActionResult? error)> GetPtzCamera(int cameraId)
        {
            var userId = int.Parse(User.FindFirstValue(JwtRegisteredClaimNames.Sub)
                         ?? User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "0");
            var role   = User.FindFirstValue(ClaimTypes.Role);

            var camera = await _db.Cameras
                .Include(c => c.Client)
                .FirstOrDefaultAsync(c => c.Id == cameraId &&
                    (role == "admin" || c.UserId == userId));

            if (camera == null)
                return (null, NotFound(new { message = "Cámara no encontrada." }));

            if (!camera.Ptz)
                return (null, BadRequest(new { message = "Esta cámara no soporta PTZ." }));

            if (camera.ClientId == null)
                return (null, BadRequest(new { message = "Esta cámara no tiene gateway asociado." }));

            return (camera, null);
        }

        private async Task<string?> GetGatewayId(int? clientId)
        {
            if (clientId == null) return null;
            var client = await _db.Clients.FindAsync(clientId);
            return client?.GatewayId;
        }
    }
}
