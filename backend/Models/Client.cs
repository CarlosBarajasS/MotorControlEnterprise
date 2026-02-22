using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MotorControlEnterprise.Api.Models
{
    public class Client
    {
        [Key]
        public int Id { get; set; }

        [Required]
        [MaxLength(255)]
        public string Name { get; set; } = string.Empty;

        [Column("business_type")]
        [MaxLength(100)]
        public string? BusinessType { get; set; }

        [MaxLength(50)]
        public string? Rfc { get; set; }

        public string? Address { get; set; }

        [MaxLength(100)]
        public string? City { get; set; }

        [MaxLength(100)]
        public string? State { get; set; }

        [Column("postal_code")]
        [MaxLength(10)]
        public string? PostalCode { get; set; }

        [Required]
        [MaxLength(50)]
        public string Country { get; set; } = "México";

        [Column("contact_name")]
        [MaxLength(255)]
        public string? ContactName { get; set; }

        [Column("contact_phone")]
        [MaxLength(20)]
        public string? ContactPhone { get; set; }

        [Column("contact_email")]
        [MaxLength(255)]
        public string? ContactEmail { get; set; }

        [Column("gateway_id")]
        [MaxLength(150)]
        public string? GatewayId { get; set; }

        [Column("user_id")]
        public int? UserId { get; set; }
        public User? User { get; set; }

        [Required]
        public string Status { get; set; } = "active";

        [Column("cloud_storage_active")]
        public bool CloudStorageActive { get; set; } = false;

        [Column("cloud_storage_enabled_at")]
        public DateTime? CloudStorageEnabledAt { get; set; }

        [Column(TypeName = "jsonb")]
        public string? Metadata { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    }
}
