using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MotorControlEnterprise.Api.Models
{
    public class AuditLog
    {
        public int Id { get; set; }

        public int UserId { get; set; }
        public User User { get; set; } = null!;

        [Required, MaxLength(50)]
        public string Action { get; set; } = null!;

        [Required, MaxLength(30)]
        public string EntityType { get; set; } = null!;

        public int? EntityId { get; set; }

        [Column(TypeName = "jsonb")]
        public string? Details { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
