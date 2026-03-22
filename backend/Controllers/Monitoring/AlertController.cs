using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MotorControlEnterprise.Api.Data;
using MotorControlEnterprise.Api.Models;
using MotorControlEnterprise.Api.Services;

namespace MotorControlEnterprise.Api.Controllers
{
    [ApiController]
    [Route("api/alerts")]
    [Authorize(Roles = "admin,installer")]
    public class AlertController : ControllerBase
    {
        private readonly ApplicationDbContext _db;
        private readonly AlertService _alertService;

        public AlertController(ApplicationDbContext db, AlertService alertService)
        {
            _db           = db;
            _alertService = alertService;
        }

        // GET /api/alerts?status=Active&priority=P1&clientId=5&page=1&pageSize=50
        [HttpGet]
        public async Task<IActionResult> GetAlerts(
            [FromQuery] string? status     = null,
            [FromQuery] string? priority   = null,
            [FromQuery] int?    clientId   = null,
            [FromQuery] int     page       = 1,
            [FromQuery] int     pageSize   = 50)
        {
            if (page < 1) page = 1;
            if (pageSize < 1 || pageSize > 200) pageSize = 50;

            var query = _db.Alerts.Include(a => a.Client).AsQueryable();

            if (!string.IsNullOrEmpty(status) && Enum.TryParse<AlertStatus>(status, true, out var s))
                query = query.Where(a => a.Status == s);

            if (!string.IsNullOrEmpty(priority) && Enum.TryParse<AlertPriority>(priority, true, out var p))
                query = query.Where(a => a.Priority == p);

            if (clientId.HasValue)
                query = query.Where(a => a.ClientId == clientId);

            var total = await query.CountAsync();
            var data  = await query
                .OrderBy(a => a.Priority)
                .ThenByDescending(a => a.CreatedAt)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .Select(a => new {
                    a.Id, a.Fingerprint, a.EntityType, a.EntityId, a.AlertType,
                    Priority         = a.Priority.ToString(),
                    Status           = a.Status.ToString(),
                    a.Title, a.Message, a.ClientId,
                    ClientName       = a.Client != null ? a.Client.Name : null,
                    a.CreatedAt, a.LastTriggeredAt, a.AcknowledgedAt, a.AcknowledgedBy, a.ResolvedAt
                })
                .ToListAsync();

            return Ok(new { total, page, pageSize, data });
        }

        // GET /api/alerts/unread-count
        [HttpGet("unread-count")]
        public async Task<IActionResult> GetUnreadCount()
        {
            var count = await _db.Alerts.CountAsync(a => a.Status == AlertStatus.Active);
            return Ok(new { count });
        }

        // PATCH /api/alerts/{id}/acknowledge
        [HttpPatch("{id:int}/acknowledge")]
        public async Task<IActionResult> Acknowledge(int id)
        {
            var adminEmail = User.FindFirstValue(JwtRegisteredClaimNames.Email)
                          ?? User.FindFirstValue(ClaimTypes.Email)
                          ?? "admin";

            var (success, error, alert) = await _alertService.AcknowledgeAsync(id, adminEmail);

            if (!success && error == "not_found")         return NotFound(new { error = "Alerta no encontrada." });
            if (!success && error == "already_resolved")  return Conflict(new { error = "No se puede reconocer una alerta ya resuelta." });

            return Ok(new {
                alert!.Id, Status = alert.Status.ToString(),
                alert.AcknowledgedAt, alert.AcknowledgedBy
            });
        }
    }
}
