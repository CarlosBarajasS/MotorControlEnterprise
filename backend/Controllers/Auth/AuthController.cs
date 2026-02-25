using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using MotorControlEnterprise.Api.Data;
using MotorControlEnterprise.Api.Models;
using MotorControlEnterprise.Api.Services;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;

namespace MotorControlEnterprise.Api.Controllers
{
    [ApiController]
    [Route("api/admin/auth")]
    public class AuthController : ControllerBase
    {
        private readonly ApplicationDbContext _context;
        private readonly IConfiguration _config;
        private readonly IEmailService _emailService;
        private readonly ILogger<AuthController> _logger;

        public AuthController(ApplicationDbContext context, IConfiguration config,
            IEmailService emailService, ILogger<AuthController> logger)
        {
            _context      = context;
            _config       = config;
            _emailService = emailService;
            _logger       = logger;
        }

        public record LoginRequest(string Email, string Password);
        public record CreateUserRequest(string Email, string Password, string? Name, string Role = "client");
        public record InviteUserRequest(string Email, string? Name, string Role = "client");
        public record UserStatusRequest(bool IsActive);

        [HttpPost("login")]
        public async Task<IActionResult> Login([FromBody] LoginRequest request)
        {
            var user = await _context.Users.FirstOrDefaultAsync(u => u.Email == request.Email);

            if (user == null || !user.IsActive || !BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
                return Unauthorized(new { message = "Credenciales inválidas o usuario inactivo" });

            user.LastLogin = DateTime.UtcNow;
            await _context.SaveChangesAsync();

            var token = GenerateJwtToken(user);

            return Ok(new {
                token,
                mustChangePassword = user.MustChangePassword,
                user = new { user.Id, user.Email, user.Name, user.Role }
            });
        }

        [HttpGet("verify")]
        [Authorize]
        public IActionResult Verify()
        {
            var id    = User.FindFirstValue(JwtRegisteredClaimNames.Sub);
            var email = User.FindFirstValue(JwtRegisteredClaimNames.Email);
            var role  = User.FindFirstValue(ClaimTypes.Role);
            var name  = User.FindFirstValue("name");
            return Ok(new { id, email, name, role });
        }

        [HttpGet("users")]
        [Authorize(Roles = "admin")]
        public async Task<IActionResult> GetUsers()
        {
            var users = await _context.Users
                .OrderBy(u => u.Role)
                .ThenBy(u => u.Name)
                .Select(u => new {
                    u.Id, u.Email, u.Name, u.Role,
                    u.IsActive, u.CreatedAt, u.LastLogin
                })
                .ToListAsync();

            return Ok(users);
        }

        [HttpPost("users")]
        [Authorize(Roles = "admin")]
        public async Task<IActionResult> CreateUser([FromBody] CreateUserRequest request)
        {
            if (await _context.Users.AnyAsync(u => u.Email == request.Email))
                return Conflict(new { message = "El email ya está registrado" });

            var user = new User
            {
                Email        = request.Email,
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password),
                Name         = request.Name,
                Role         = request.Role,
                IsActive     = true
            };

            _context.Users.Add(user);
            await _context.SaveChangesAsync();

            return CreatedAtAction(nameof(Verify), new { user.Id, user.Email, user.Name, user.Role });
        }

        // ─── POST /api/admin/auth/users/invite ───────────────────────────────────
        /// <summary>
        /// Crea un usuario con contraseña temporal y envía email de invitación.
        /// No requiere password en el body — se genera automáticamente.
        /// </summary>
        [HttpPost("users/invite")]
        [Authorize(Roles = "admin")]
        public async Task<IActionResult> InviteUser([FromBody] InviteUserRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.Email))
                return BadRequest(new { message = "El email es obligatorio" });

            if (await _context.Users.AnyAsync(u => u.Email == request.Email))
                return Conflict(new { message = "El email ya está registrado" });

            // Contraseña temporal: 12 chars alfanuméricos seguros
            var tempPassword = Convert.ToBase64String(RandomNumberGenerator.GetBytes(9))
                .Replace("+", "x").Replace("/", "y").Replace("=", "z")
                .Substring(0, 12);

            var displayName = request.Name ?? request.Email.Split('@')[0];

            var user = new User
            {
                Email               = request.Email,
                Name                = displayName,
                Role                = request.Role,
                PasswordHash        = BCrypt.Net.BCrypt.HashPassword(tempPassword),
                IsActive            = true,
                MustChangePassword  = true
            };

            _context.Users.Add(user);
            await _context.SaveChangesAsync();

            // Email de invitación — enlaza al portal admin (/login), best-effort
            try
            {
                await _emailService.SendUserInviteAsync(user.Email, displayName, tempPassword, "/login");
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "No se pudo enviar email de invitación a {Email} — usuario creado igual", user.Email);
            }

            return Ok(new { user.Id, user.Email, user.Name, user.Role,
                message = "Usuario creado. Invitación enviada por email." });
        }

        // ─── POST /api/admin/auth/users/{id}/resend-invite ───────────────────────
        /// <summary>Genera nueva contraseña temporal y reenvía el email de invitación.</summary>
        [HttpPost("users/{id:int}/resend-invite")]
        [Authorize(Roles = "admin")]
        public async Task<IActionResult> ResendInvite(int id)
        {
            var user = await _context.Users.FindAsync(id);
            if (user == null) return NotFound(new { message = "Usuario no encontrado" });

            var tempPassword = Convert.ToBase64String(RandomNumberGenerator.GetBytes(9))
                .Replace("+", "x").Replace("/", "y").Replace("=", "z")
                .Substring(0, 12);

            user.PasswordHash       = BCrypt.Net.BCrypt.HashPassword(tempPassword);
            user.MustChangePassword = true;
            await _context.SaveChangesAsync();

            try
            {
                await _emailService.SendUserInviteAsync(user.Email, user.Name ?? user.Email, tempPassword, "/login");
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "No se pudo reenviar invitación a {Email}", user.Email);
                return Ok(new { message = "Contraseña restablecida pero el email no pudo enviarse.", tempPassword });
            }

            return Ok(new { message = $"Invitación reenviada a {user.Email}" });
        }

        [HttpPatch("users/{id:int}/status")]
        [Authorize(Roles = "admin")]
        public async Task<IActionResult> ToggleUserStatus(int id, [FromBody] UserStatusRequest req)
        {
            var user = await _context.Users.FindAsync(id);
            if (user == null) return NotFound();

            // No permitir desactivarse a sí mismo
            var requesterId = User.FindFirstValue(JwtRegisteredClaimNames.Sub);
            if (requesterId == id.ToString())
                return BadRequest(new { message = "No puedes desactivar tu propia cuenta" });

            user.IsActive = req.IsActive;
            await _context.SaveChangesAsync();

            return Ok(new { user.Id, user.Email, user.IsActive });
        }

        [HttpDelete("users/{id:int}")]
        [Authorize(Roles = "admin")]
        public async Task<IActionResult> DeleteUser(int id)
        {
            var user = await _context.Users.FindAsync(id);
            if (user == null) return NotFound();

            // No permitir eliminarse a sí mismo
            var requesterId = User.FindFirstValue(JwtRegisteredClaimNames.Sub);
            if (requesterId == id.ToString())
                return BadRequest(new { message = "No puedes eliminar tu propia cuenta" });

            _context.Users.Remove(user);
            await _context.SaveChangesAsync();
            return NoContent();
        }

        private string GenerateJwtToken(User user)
        {
            var jwtKey      = _config["Jwt:Key"]!;
            var securityKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey));
            var credentials = new SigningCredentials(securityKey, SecurityAlgorithms.HmacSha256);
            var expiresHours = int.TryParse(_config["Jwt:ExpiresHours"], out var h) ? h : 24;

            var claims = new[]
            {
                new Claim(JwtRegisteredClaimNames.Sub,   user.Id.ToString()),
                new Claim(JwtRegisteredClaimNames.Email, user.Email),
                new Claim(ClaimTypes.Role,               user.Role),
                new Claim("role",                        user.Role),
                new Claim("name",                        user.Name ?? ""),
                new Claim(JwtRegisteredClaimNames.Jti,   Guid.NewGuid().ToString())
            };

            var token = new JwtSecurityToken(
                issuer:            _config["Jwt:Issuer"],
                audience:          _config["Jwt:Audience"],
                claims:            claims,
                expires:           DateTime.UtcNow.AddHours(expiresHours),
                signingCredentials: credentials);

            return new JwtSecurityTokenHandler().WriteToken(token);
        }
    }
}
