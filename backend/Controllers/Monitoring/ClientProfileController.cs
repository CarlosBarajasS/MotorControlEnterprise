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
            if (!int.TryParse(User.FindFirstValue(JwtRegisteredClaimNames.Sub), out var userId))
                return Unauthorized();

            var client = await _db.Clients
                .Include(c => c.User)
                .FirstOrDefaultAsync(c => c.UserId == userId);

            if (client is null)
                return NotFound(new { error = "Perfil de cliente no encontrado" });

            var cameras = await _db.Cameras
                .Where(c => c.ClientId == client.Id && !c.IsRecordingOnly)
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
                client.GatewayId,
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
            if (!int.TryParse(User.FindFirstValue(JwtRegisteredClaimNames.Sub), out var userId))
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

        // GET /api/client/me/alerts/unread-count
        [HttpGet("me/alerts/unread-count")]
        public async Task<IActionResult> GetAlertUnreadCount()
        {
            if (!int.TryParse(User.FindFirstValue(JwtRegisteredClaimNames.Sub), out var userId))
                return Unauthorized();

            var client = await _db.Clients.FirstOrDefaultAsync(c => c.UserId == userId);
            if (client is null) return Ok(new { count = 0 });

            var pref = await _db.AlertPreferences.FindAsync(client.Id);
            if (pref != null && !pref.InAppEnabled) return Ok(new { count = 0 });

            var count = await _db.Alerts.CountAsync(a =>
                a.ClientId == client.Id && a.Status == AlertStatus.Active);

            return Ok(new { count });
        }

        // GET /api/client/me/alerts
        [HttpGet("me/alerts")]
        public async Task<IActionResult> GetMyAlerts()
        {
            if (!int.TryParse(User.FindFirstValue(JwtRegisteredClaimNames.Sub), out var userId))
                return Unauthorized();

            var client = await _db.Clients.FirstOrDefaultAsync(c => c.UserId == userId);
            if (client is null) return Ok(Array.Empty<object>());

            var pref = await _db.AlertPreferences.FindAsync(client.Id);
            if (pref != null && !pref.InAppEnabled) return Ok(Array.Empty<object>());

            var alerts = await _db.Alerts
                .Where(a => a.ClientId == client.Id)
                .OrderBy(a => a.Priority)
                .ThenByDescending(a => a.CreatedAt)
                .Take(50)
                .Select(a => new {
                    a.Id, a.AlertType, Priority = a.Priority.ToString(),
                    Status = a.Status.ToString(), a.Title, a.Message,
                    a.CreatedAt, a.AcknowledgedAt, a.ResolvedAt
                })
                .ToListAsync();

            return Ok(alerts);
        }

        // GET /api/client/me/alert-preferences
        [HttpGet("me/alert-preferences")]
        public async Task<IActionResult> GetAlertPreferences()
        {
            if (!int.TryParse(User.FindFirstValue(JwtRegisteredClaimNames.Sub), out var userId))
                return Unauthorized();

            var client = await _db.Clients.FirstOrDefaultAsync(c => c.UserId == userId);
            if (client is null) return NotFound(new { error = "Perfil no encontrado" });

            var pref = await _db.AlertPreferences.FindAsync(client.Id)
                       ?? new AlertPreference { ClientId = client.Id };

            return Ok(new { pref.InAppEnabled, pref.EmailEnabled, pref.MinPriority });
        }

        // PATCH /api/client/me/alert-preferences
        [HttpPatch("me/alert-preferences")]
        public async Task<IActionResult> UpdateAlertPreferences([FromBody] AlertPreferenceRequest req)
        {
            if (!int.TryParse(User.FindFirstValue(JwtRegisteredClaimNames.Sub), out var userId))
                return Unauthorized();

            var client = await _db.Clients.FirstOrDefaultAsync(c => c.UserId == userId);
            if (client is null) return NotFound(new { error = "Perfil no encontrado" });

            var pref = await _db.AlertPreferences.FindAsync(client.Id);
            if (pref == null)
            {
                pref = new AlertPreference { ClientId = client.Id };
                _db.AlertPreferences.Add(pref);
            }

            if (req.InAppEnabled.HasValue)  pref.InAppEnabled = req.InAppEnabled.Value;
            if (req.EmailEnabled.HasValue)  pref.EmailEnabled = req.EmailEnabled.Value;
            if (req.MinPriority.HasValue && req.MinPriority >= 1 && req.MinPriority <= 4)
                pref.MinPriority = req.MinPriority.Value;

            await _db.SaveChangesAsync();
            return Ok(new { pref.InAppEnabled, pref.EmailEnabled, pref.MinPriority });
        }
    }

    public record ChangePasswordRequest(string CurrentPassword, string NewPassword);
    public record AlertPreferenceRequest(bool? InAppEnabled, bool? EmailEnabled, int? MinPriority);
}
