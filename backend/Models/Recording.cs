using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MotorControlEnterprise.Api.Models
{
    [Table("recordings")]
    public class Recording
    {
        [Key]
        public int Id { get; set; }

        [Required]
        [Column("user_id")]
        public int UserId { get; set; }
        public User? User { get; set; }

        [Required]
        [Column("camera_id")]
        public int CameraId { get; set; }
        public Camera? Camera { get; set; }

        [Required]
        [MaxLength(500)]
        public string Path { get; set; } = string.Empty;

        [Column("size_mb")]
        public float SizeMb { get; set; } = 0;

        [Column("started_at")]
        public DateTime StartedAt { get; set; } = DateTime.UtcNow;

        [Column("ended_at")]
        public DateTime EndedAt { get; set; } = DateTime.UtcNow;

        [Column("created_at")]
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        [Column("updated_at")]
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    }
}
