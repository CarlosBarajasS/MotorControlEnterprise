using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MotorControlEnterprise.Api.Data;
using MotorControlEnterprise.Api.Services;

namespace MotorControlEnterprise.Api.Controllers
{
    [ApiController]
    [Route("health")]
    public class HealthController : ControllerBase
    {
        private readonly ApplicationDbContext _db;
        private readonly IConfiguration _config;

        public HealthController(ApplicationDbContext db, IConfiguration config)
        {
            _db    = db;
            _config = config;
        }

        [HttpGet]
        public async Task<IActionResult> Get()
        {
            var dbOk = false;
            try
            {
                dbOk = await _db.Database.CanConnectAsync();
            }
            catch { /* db unreachable */ }

            var status = dbOk ? "healthy" : "degraded";

            return dbOk
                ? Ok(new { status, services = new { database = "ok" }, uptime = Environment.TickCount64 / 1000 })
                : StatusCode(503, new { status, services = new { database = "error" } });
        }

        // GET /health/test-email?to=correo@ejemplo.com  — envía un email de prueba
        [HttpGet("test-email")]
        [Authorize(Roles = "admin")]
        public async Task<IActionResult> TestEmail([FromQuery] string? to, [FromServices] IEmailService emailService)
        {
            var recipient = to ?? _config["Email:AdminAlertEmail"];
            if (string.IsNullOrWhiteSpace(recipient))
                return BadRequest(new { message = "Pasa ?to=correo@ejemplo.com o configura Email:AdminAlertEmail en .env" });

            await emailService.SendTestEmailAsync(recipient);
            return Ok(new { message = $"Email de prueba enviado a {recipient}" });
        }
    }
}
