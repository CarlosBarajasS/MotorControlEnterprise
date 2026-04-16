using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MotorControlEnterprise.Api.Models
{
    public enum AlertEntityType { Camera, Gateway, Storage }
    public enum AlertType { Offline, Online, GatewayDown, GatewayUp, StorageHigh, StorageCritical, RecordingDown, RecordingUp, CameraRegistered }
    public enum AlertPriority { P1 = 1, P2 = 2, P3 = 3, P4 = 4 }
    public enum AlertStatus { Active, Acknowledged, Resolved }

    public class Alert
    {
        [Key]
        public int Id { get; set; }

        [Required][MaxLength(300)]
        public string Fingerprint { get; set; } = string.Empty;

        public AlertEntityType EntityType { get; set; }

        [Required][MaxLength(200)]
        public string EntityId { get; set; } = string.Empty;

        public AlertType AlertType { get; set; }

        public AlertPriority Priority { get; set; }

        public AlertStatus Status { get; set; } = AlertStatus.Active;

        [Required][MaxLength(255)]
        public string Title { get; set; } = string.Empty;

        [Required]
        public string Message { get; set; } = string.Empty;

        [Column("client_id")]
        public int? ClientId { get; set; }
        public Client? Client { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime LastTriggeredAt { get; set; } = DateTime.UtcNow;

        [Column("acknowledged_at")]
        public DateTime? AcknowledgedAt { get; set; }

        [Column("acknowledged_by")][MaxLength(255)]
        public string? AcknowledgedBy { get; set; }

        [Column("resolved_at")]
        public DateTime? ResolvedAt { get; set; }
    }
}
