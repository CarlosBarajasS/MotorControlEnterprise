using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MotorControlEnterprise.Api.Models
{
    [Table("client_layouts")]
    public class ClientLayout
    {
        [Key]
        public int Id { get; set; }

        [Column("client_id")]
        public int ClientId { get; set; }
        public Client? Client { get; set; }

        [Required]
        [MaxLength(80)]
        public string Name { get; set; } = string.Empty;

        [Column(TypeName = "jsonb")]
        public string Config { get; set; } = "{}";

        [Column("is_default")]
        public bool IsDefault { get; set; } = false;

        [Column("created_at")]
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        [Column("updated_at")]
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    }
}
