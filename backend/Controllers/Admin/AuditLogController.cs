using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MotorControlEnterprise.Api.Data;

namespace MotorControlEnterprise.Api.Controllers
{
    [ApiController]
    [Route("api/admin/audit-log")]
    [Authorize(Roles = "admin")]
    public class AuditLogController : ControllerBase
    {
        private readonly ApplicationDbContext _db;

        public AuditLogController(ApplicationDbContext db) => _db = db;

        [HttpGet]
        public async Task<IActionResult> GetAll(
            [FromQuery] int?      userId     = null,
            [FromQuery] string?   action     = null,
            [FromQuery] string?   entityType = null,
            [FromQuery] DateTime? from       = null,
            [FromQuery] DateTime? to         = null,
            [FromQuery] int       page       = 1,
            [FromQuery] int       pageSize   = 50)
        {
            if (page < 1) page = 1;
            if (pageSize < 1 || pageSize > 200) pageSize = 50;

            var query = _db.AuditLogs
                .Include(a => a.User)
                .AsQueryable();

            if (userId.HasValue)
                query = query.Where(a => a.UserId == userId.Value);
            if (!string.IsNullOrEmpty(action))
                query = query.Where(a => a.Action == action);
            if (!string.IsNullOrEmpty(entityType))
                query = query.Where(a => a.EntityType == entityType);
            if (from.HasValue)
                query = query.Where(a => a.CreatedAt >= from.Value);
            if (to.HasValue)
                query = query.Where(a => a.CreatedAt <= to.Value);

            var total = await query.CountAsync();

            var items = await query
                .OrderByDescending(a => a.CreatedAt)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .Select(a => new {
                    a.Id,
                    a.Action,
                    a.EntityType,
                    a.EntityId,
                    a.Details,
                    a.CreatedAt,
                    User = new { a.User.Id, a.User.Name, a.User.Email, a.User.Role }
                })
                .ToListAsync();

            return Ok(new { items, total, page, pageSize });
        }
    }
}
