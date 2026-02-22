using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using MotorControlEnterprise.Api.Data;
using MotorControlEnterprise.Api.Models;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;

namespace MotorControlEnterprise.Api.Controllers
{
    /// <summary>
    /// Autenticación para usuarios normales (clientes).
    /// Ruta base: /api/auth
    /// </summary>
    [ApiController]
    [Route("api/auth")]
    public class UserAuthController : ControllerBase
    {
        private readonly ApplicationDbContext _db;
        private readonly IConfiguration _config;

        public UserAuthController(ApplicationDbContext db, IConfiguration config)
        {
            _db     = db;
            _config = config;
        }

        public record SignupRequest(string Email, string Password, string? Name);
        public record LoginRequest(string Email, string Password);

        // ─── POST /api/auth/signup ────────────────────────────────────────────
        [HttpPost("signup")]
        public async Task<IActionResult> Signup([FromBody] SignupRequest req)
        {
            if (string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrWhiteSpace(req.Password))
                return BadRequest(new { message = "Email y contraseña son requeridos." });

            if (await _db.Users.AnyAsync(u => u.Email == req.Email))
                return Conflict(new { message = "El email ya está registrado." });

            var user = new User
            {
                Email        = req.Email.Trim().ToLowerInvariant(),
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password),
                Name         = req.Name,
                Role         = "client",
                IsActive     = true
            };

            _db.Users.Add(user);
            await _db.SaveChangesAsync();

            var token = GenerateToken(user);
            return CreatedAtAction(nameof(Verify), new { }, new
            {
                token,
                user = new { user.Id, user.Email, user.Name, user.Role }
            });
        }

        // ─── POST /api/auth/login ─────────────────────────────────────────────
        [HttpPost("login")]
        public async Task<IActionResult> Login([FromBody] LoginRequest req)
        {
            var email = req.Email.Trim().ToLowerInvariant();
            var user  = await _db.Users.FirstOrDefaultAsync(u => u.Email == email);

            if (user == null || !user.IsActive || !BCrypt.Net.BCrypt.Verify(req.Password, user.PasswordHash))
                return Unauthorized(new { message = "Credenciales inválidas o usuario inactivo." });

            user.LastLogin = DateTime.UtcNow;
            await _db.SaveChangesAsync();

            var token = GenerateToken(user);
            return Ok(new
            {
                token,
                user = new { user.Id, user.Email, user.Name, user.Role }
            });
        }

        // ─── GET /api/auth/verify ─────────────────────────────────────────────
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

        // ─── POST /api/auth/logout ────────────────────────────────────────────
        // El token es stateless (JWT), el logout lo maneja el frontend borrando el token.
        [HttpPost("logout")]
        [Authorize]
        public IActionResult Logout()
        {
            return Ok(new { message = "Sesión cerrada correctamente." });
        }

        // ─── Helper ───────────────────────────────────────────────────────────
        private string GenerateToken(User user)
        {
            var key         = _config["Jwt:Key"]!;
            var securityKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key));
            var credentials = new SigningCredentials(securityKey, SecurityAlgorithms.HmacSha256);
            var hours       = int.TryParse(_config["Jwt:ExpiresHours"], out var h) ? h : 24;

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
                issuer:             _config["Jwt:Issuer"],
                audience:           _config["Jwt:Audience"],
                claims:             claims,
                expires:            DateTime.UtcNow.AddHours(hours),
                signingCredentials: credentials);

            return new JwtSecurityTokenHandler().WriteToken(token);
        }
    }
}
