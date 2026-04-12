using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MotorControlEnterprise.Api.Models
{
    public class Camera
    {
        [Key]
        public int Id { get; set; }

        [Required]
        [Column("user_id")]
        public int UserId { get; set; }
        public User? User { get; set; }

        [Required]
        [MaxLength(120)]
        public string Name { get; set; } = string.Empty;

        [MaxLength(120)]
        public string? Location { get; set; }

        [Required]
        public string Status { get; set; } = "active";

        [Column("camera_id")]
        [MaxLength(100)]
        public string? CameraId { get; set; }

        [Column("client_id")]
        public int? ClientId { get; set; }
        public Client? Client { get; set; }

        [Column("camera_key")]
        [MaxLength(100)]
        public string? CameraKey { get; set; }

        [Column(TypeName = "jsonb")]
        public string? Streams { get; set; }

        [Column("last_seen")]
        public DateTime? LastSeen { get; set; }

        [Column(TypeName = "jsonb")]
        public string? Metadata { get; set; }

        public bool Ptz { get; set; } = false;

        /// <summary>
        /// Si es true, la cámara se usa SOLO para grabación (NAS/cloud).
        /// No aparece en la vista de cámaras del panel de administración.
        /// </summary>
        [Column("is_recording_only")]
        public bool IsRecordingOnly { get; set; } = false;

        /// <summary>
        /// Si es true, la cámara solo es visible en /client/private.
        /// No aparece en monitor principal ni en layouts normales.
        /// </summary>
        [Column("is_client_restricted")]
        public bool IsClientRestricted { get; set; } = false;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    }
}
