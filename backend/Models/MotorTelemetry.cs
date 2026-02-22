using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MotorControlEnterprise.Api.Models
{
    [Table("motor_telemetry")]
    public class MotorTelemetry
    {
        [Key]
        public int Id { get; set; }

        [Required]
        [Column("device_id")]
        [MaxLength(100)]
        public string DeviceId { get; set; } = string.Empty;

        public int? Speed { get; set; } = 0;

        public float? Current { get; set; } = 0.0f;

        public float? Voltage { get; set; } = 0.0f;

        [MaxLength(50)]
        public string? State { get; set; } = "unknown";

        [Required]
        public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    }
}
