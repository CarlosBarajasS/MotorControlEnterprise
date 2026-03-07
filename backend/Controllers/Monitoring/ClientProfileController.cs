using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MotorControlEnterprise.Api.Data;

namespace MotorControlEnterprise.Api.Controllers
{
    [ApiController]
    [Route("api/client")]
    [Authorize(Roles = "client")]
    public class ClientProfileController : ControllerBase
    {
        private readonly ApplicationDbContext _db;

        public ClientProfileController(ApplicationDbContext db)
        {
            _db = db;
        }

        // GET /api/client/me
        [HttpGet("me")]
        public async Task<IActionResult> GetMyProfile()
        {
            if (!int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var userId))
                return Unauthorized();

            var client = await _db.Clients
                .Include(c => c.User)
                .FirstOrDefaultAsync(c => c.UserId == userId);

            if (client is null)
                return NotFound(new { error = "Perfil de cliente no encontrado" });

            var cameras = await _db.Cameras
                .Where(c => c.ClientId == client.Id)
                .Select(c => new
                {
                    c.Id,
                    c.Name,
                    c.Location,
                    c.Status,
                    c.LastSeen,
                    c.CameraId
                })
                .ToListAsync();

            return Ok(new
            {
                client.Id,
                client.Name,
                client.BusinessType,
                client.City,
                client.State,
                client.Country,
                client.ContactName,
                client.ContactPhone,
                client.ContactEmail,
                client.Status,
                client.CloudStorageActive,
                client.CloudStorageEnabledAt,
                client.LocalStorageType,
                client.NvrBrand,
                client.CreatedAt,
                Cameras = cameras,
                User = client.User is null ? null : new
                {
                    client.User.Email,
                    client.User.Name
                }
            });
        }

        // PATCH /api/client/me/change-password
        [HttpPatch("me/change-password")]
        public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest req)
        {
            if (!int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var userId))
                return Unauthorized();

            var user = await _db.Users.FindAsync(userId);
            if (user is null)
                return NotFound(new { error = "Usuario no encontrado" });

            if (!BCrypt.Net.BCrypt.Verify(req.CurrentPassword, user.PasswordHash))
                return BadRequest(new { error = "Contraseña actual incorrecta" });

            user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.NewPassword);
            user.MustChangePassword = false;
            user.UpdatedAt = DateTime.UtcNow;

            await _db.SaveChangesAsync();

            return Ok(new { message = "Contraseña actualizada correctamente" });
        }
    }

    public record ChangePasswordRequest(string CurrentPassword, string NewPassword);
}
