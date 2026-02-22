using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MotorControlEnterprise.Api.Data;

namespace MotorControlEnterprise.Api.Controllers
{
    [ApiController]
    [Route("health")]
    public class HealthController : ControllerBase
    {
        private readonly ApplicationDbContext _db;

        public HealthController(ApplicationDbContext db) => _db = db;

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
    }
}
