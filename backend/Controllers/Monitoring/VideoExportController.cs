using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MotorControlEnterprise.Api.Data;
using MotorControlEnterprise.Api.Services;

namespace MotorControlEnterprise.Api.Controllers
{
    /// <summary>
    /// Permite a un cliente descargar un clip de video de sus camaras con marca de agua NIRMGROUP.
    /// </summary>
    [ApiController]
    [Route("api/client/cameras")]
    [Authorize(Roles = "client")]
    public class VideoExportController : ControllerBase
    {
        private readonly ApplicationDbContext _db;
        private readonly VideoExportService _export;
        private readonly ILogger<VideoExportController> _logger;

        public VideoExportController(
            ApplicationDbContext db,
            VideoExportService export,
            ILogger<VideoExportController> logger)
        {
            _db     = db;
            _export = export;
            _logger = logger;
        }

        // â”€â”€â”€ POST /api/client/cameras/{cameraId}/export â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        /// <summary>
        /// Genera y descarga un clip MP4 del rango indicado con marca de agua NIRMGROUP.
        /// Solo el cliente propietario puede acceder a sus propias camaras.
        /// El rango maximo es de 30 minutos.
        /// </summary>
        /// <param name="cameraId">ID interno de la camara</param>
        /// <param name="req">Rango de tiempo en UTC</param>
        [HttpPost("{cameraId:int}/export")]
        public async Task<IActionResult> ExportClip(
            int cameraId,
            [FromBody] ExportClipRequest req,
            CancellationToken ct)
        {
            // 1. Identificar al cliente desde el JWT
            if (!int.TryParse(
                    User.FindFirstValue(JwtRegisteredClaimNames.Sub) ??
                    User.FindFirstValue(ClaimTypes.NameIdentifier), out var userId))
                return Unauthorized();

            // 2. Verificar que la camara pertenece al cliente autenticado
            var clientId = await _db.Clients
                .Where(c => c.UserId == userId && c.DeletedAt == null)
                .Select(c => (int?)c.Id)
                .FirstOrDefaultAsync(ct);

            if (clientId == null)
                return Forbid();

            var camera = await _db.Cameras
                .Include(c => c.Client)
                    .ThenInclude(cl => cl!.Gateways)
                .FirstOrDefaultAsync(c =>
                    c.Id == cameraId && c.ClientId == clientId, ct);

            if (camera == null)
                return StatusCode(403, new { message = "La camara no pertenece a tu cuenta." });

            // 3. Validar rango
            var startUtc = req.StartTime.ToUniversalTime();
            var endUtc   = req.EndTime.ToUniversalTime();

            if (endUtc <= startUtc)
                return BadRequest(new { message = "endTime debe ser posterior a startTime." });

            if ((endUtc - startUtc).TotalMinutes > 30)
                return BadRequest(new { message = "El rango no puede exceder 30 minutos." });

            if (startUtc > DateTime.UtcNow)
                return BadRequest(new { message = "El rango no puede ser en el futuro." });

            // 4. Generar clip via FFmpeg
            var result = await _export.ExportClipAsync(camera, startUtc, endUtc, ct);

            if (!result.Success)
            {
                return result.ErrorCode switch
                {
                    "NO_RECORDINGS" => NotFound(new { message = result.ErrorMessage }),
                    "RANGE_TOO_LONG" or "INVALID_RANGE" => BadRequest(new { message = result.ErrorMessage }),
                    _ => StatusCode(500, new { message = result.ErrorMessage })
                };
            }

            // 5. Preparar nombre de archivo para descarga
            var camName  = camera.Name.Replace(" ", "_").Replace("/", "-");
            var fileName = $"clip_{camName}_{startUtc:yyyyMMdd_HHmmss}_{endUtc:HHmmss}_NIRMGROUP.mp4";

            // 6. Retornar el archivo y limpiar tras el envio
            var fileStream = new FileStream(result.FilePath!, FileMode.Open, FileAccess.Read,
                FileShare.None, bufferSize: 65536, useAsync: true);

            Response.OnCompleted(async () =>
            {
                await fileStream.DisposeAsync();
                try { System.IO.File.Delete(result.FilePath!); }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "No se pudo eliminar clip temporal {Path}", result.FilePath);
                }
            });

            return new FileStreamResult(fileStream, "video/mp4")
            {
                FileDownloadName = fileName,
                EnableRangeProcessing = false
            };
        }
    }

    public class ExportClipRequest
    {
        /// <summary>Inicio del clip (ISO 8601). Se convierte a UTC internamente.</summary>
        public DateTime StartTime { get; set; }

        /// <summary>Fin del clip (ISO 8601). Se convierte a UTC internamente.</summary>
        public DateTime EndTime { get; set; }
    }
}
