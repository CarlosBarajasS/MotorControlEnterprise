using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MotorControlEnterprise.Api.Models
{
    public class User
    {
        [Key]
        public int Id { get; set; }

        [Required]
        [MaxLength(100)]
        public string Email { get; set; } = string.Empty;

        [Required]
        [MaxLength(255)]
        public string PasswordHash { get; set; } = string.Empty;

        [MaxLength(100)]
        public string? Name { get; set; }

        [Required]
        [MaxLength(20)]
        public string Role { get; set; } = "client";

        public bool IsActive { get; set; } = true;

        /// <summary>
        /// True cuando el usuario fue creado por un instalador y debe cambiar su contraseña en el primer inicio de sesión.
        /// </summary>
        [Column("must_change_password")]
        public bool MustChangePassword { get; set; } = false;

        [Column("last_login")]
        public DateTime? LastLogin { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

        // Navigation properties
        public ICollection<Client> Clients { get; set; } = new List<Client>();
        public ICollection<Camera> Cameras { get; set; } = new List<Camera>();
    }
}
