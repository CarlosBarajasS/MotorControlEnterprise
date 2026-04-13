using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MotorControlEnterprise.Api.Data;
using MotorControlEnterprise.Api.Models;

namespace MotorControlEnterprise.Api.Controllers
{
    [ApiController]
    [Route("api/client")]
    [Authorize(Roles = "client")]
    public class ClientCameraRestrictController : ControllerBase
    {
        private readonly ApplicationDbContext _db;

        public ClientCameraRestrictController(ApplicationDbContext db)
        {
            _db = db;
        }

        private async Task<Client?> GetClientAsync()
        {
            if (!int.TryParse(User.FindFirstValue(JwtRegisteredClaimNames.Sub), out var userId))
                return null;
            return await _db.Clients.FirstOrDefaultAsync(c => c.UserId == userId);
        }

        // PATCH /api/client/cameras/:id/restricted
        [HttpPatch("cameras/{id:int}/restricted")]
        public async Task<IActionResult> ToggleRestricted(int id, [FromBody] RestrictRequest req)
        {
            var client = await GetClientAsync();
            if (client is null) return Unauthorized();

            var camera = await _db.Cameras
                .FirstOrDefaultAsync(c => c.Id == id && c.ClientId == client.Id && !c.IsRecordingOnly);
            if (camera is null) return NotFound(new { error = "Cámara no encontrada" });

            camera.IsClientRestricted = req.Restricted;
            camera.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();

            return Ok(new { camera.Id, camera.IsClientRestricted });
        }

        // GET /api/client/private
        [HttpGet("private")]
        public async Task<IActionResult> GetPrivateCameras()
        {
            var client = await GetClientAsync();
            if (client is null) return Unauthorized();

            var cameras = await _db.Cameras
                .Where(c => c.ClientId == client.Id && c.IsClientRestricted && !c.IsRecordingOnly)
                .Select(c => new {
                    c.Id, c.Name, c.Location, c.Status, c.LastSeen, c.CameraId,
                    c.IsClientRestricted
                })
                .ToListAsync();

            return Ok(cameras);
        }
    }

    public record RestrictRequest(bool Restricted);
}
