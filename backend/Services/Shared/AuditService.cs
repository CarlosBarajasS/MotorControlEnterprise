using MotorControlEnterprise.Api.Data;
using MotorControlEnterprise.Api.Models;
using System.Text.Json;

namespace MotorControlEnterprise.Api.Services
{
    public class AuditService
    {
        private readonly ApplicationDbContext _db;

        public AuditService(ApplicationDbContext db) => _db = db;

        public async Task LogAsync(
            int userId,
            string action,
            string entityType,
            int? entityId = null,
            object? details = null)
        {
            _db.AuditLogs.Add(new AuditLog
            {
                UserId     = userId,
                Action     = action,
                EntityType = entityType,
                EntityId   = entityId,
                Details    = details is null ? null : JsonSerializer.Serialize(details),
                CreatedAt  = DateTime.UtcNow
            });
            await _db.SaveChangesAsync();
        }
    }
}
