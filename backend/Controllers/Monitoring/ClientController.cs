using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MotorControlEnterprise.Api.Data;
using MotorControlEnterprise.Api.Models;
using System.ComponentModel.DataAnnotations;
using System.Security.Cryptography;
using MotorControlEnterprise.Api.Services;

namespace MotorControlEnterprise.Api.Controllers
{
    [ApiController]
    [Route("api/clients")]
    [Authorize(Roles = "admin")]
    public class ClientController : ControllerBase
    {
        private readonly ApplicationDbContext _db;
        private readonly IEmailService _email;

        public ClientController(ApplicationDbContext db, IEmailService email)
        {
            _db    = db;
            _email = email;
        }

        // GET api/clients
        [HttpGet]
        public async Task<IActionResult> GetAll()
        {
            var clients = await _db.Clients
                .Include(c => c.User)
                .Include(c => c.Gateways)
                .Where(c => c.DeletedAt == null)
                .OrderBy(c => c.Name)
                .ToListAsync();

            // Conteo real de cámaras por cliente
            var cameraCountMap = await _db.Cameras
                .Where(c => c.ClientId != null)
                .GroupBy(c => c.ClientId!.Value)
                .Select(g => new { ClientId = g.Key, Count = g.Count() })
                .ToDictionaryAsync(x => x.ClientId, x => x.Count);

            return Ok(clients.Select(c => new {
                c.Id, c.Name, c.BusinessType, c.Rfc,
                c.City, c.State, c.Country,
                c.ContactName, c.ContactPhone, c.ContactEmail,
                c.GatewayId, c.Status, c.CloudStorageActive,
                c.LocalStorageType, c.NvrIp, c.NvrPort, c.NvrBrand,
                c.CreatedAt,
                CameraCount = cameraCountMap.GetValueOrDefault(c.Id, 0),
                UserId    = c.UserId,
                UserEmail = c.User != null ? c.User.Email : null,
                UserName  = c.User != null ? c.User.Name  : null,
                UserActive = c.User != null ? c.User.IsActive : (bool?)null
            }));
        }

        // GET api/clients/{id}
        [HttpGet("{id:int}")]
        public async Task<IActionResult> GetById(int id)
        {
            var client = await _db.Clients
                .Include(c => c.User)
                .FirstOrDefaultAsync(c => c.Id == id);

            if (client == null) return NotFound();

            var cameras = await _db.Cameras
                .Where(c => c.ClientId == id)
                .Select(c => new { c.Id, c.Name, c.Status, c.LastSeen, c.CameraId, c.Metadata })
                .ToListAsync();

            return Ok(new { client, cameras });
        }

        // POST api/clients
        [HttpPost]
        public async Task<IActionResult> Create([FromBody] CreateClientRequest req)
        {
            if (string.IsNullOrWhiteSpace(req.Name))
                return BadRequest(new { message = "El nombre del cliente es obligatorio" });

            if (await _db.Clients.AnyAsync(c => c.Name == req.Name))
                return Conflict(new { message = "Ya existe un cliente con ese nombre" });

            // Validar email de acceso si se proporcionó explícitamente
            var accessEmail = !string.IsNullOrWhiteSpace(req.UserEmail)
                ? req.UserEmail.Trim().ToLowerInvariant()
                : req.ContactEmail?.Trim().ToLowerInvariant();

            if (!string.IsNullOrEmpty(accessEmail) &&
                await _db.Users.AnyAsync(u => u.Email == accessEmail))
                return Conflict(new { message = "El email de acceso ya está registrado en el sistema" });

            var client = new Client
            {
                Name              = req.Name,
                BusinessType      = req.BusinessType,
                Rfc               = req.Rfc,
                City              = req.City,
                State             = req.State,
                Country           = req.Country ?? "México",
                ContactName       = req.ContactName,
                ContactPhone      = req.ContactPhone,
                ContactEmail      = req.ContactEmail,
                CloudStorageActive = req.CloudStorageActive,
                Status            = "active",
                CreatedAt         = DateTime.UtcNow,
                UpdatedAt         = DateTime.UtcNow
            };

            _db.Clients.Add(client);
            await _db.SaveChangesAsync();

            // Crear cuenta de acceso si hay email disponible
            string? createdUserEmail = null;
            bool emailSent = false;

            if (!string.IsNullOrEmpty(accessEmail))
            {
                var tempPassword = Convert.ToBase64String(RandomNumberGenerator.GetBytes(9))
                    .Replace("+", "x").Replace("/", "y").Replace("=", "z")
                    .Substring(0, 12);

                var displayName = !string.IsNullOrWhiteSpace(req.UserName)
                    ? req.UserName.Trim()
                    : req.ContactName ?? req.Name;

                var user = new User
                {
                    Email              = accessEmail,
                    PasswordHash       = BCrypt.Net.BCrypt.HashPassword(tempPassword),
                    Name               = displayName,
                    Role               = "client",
                    IsActive           = true,
                    MustChangePassword = true,
                    CreatedAt          = DateTime.UtcNow,
                    UpdatedAt          = DateTime.UtcNow
                };

                _db.Users.Add(user);
                await _db.SaveChangesAsync();

                client.UserId    = user.Id;
                client.UpdatedAt = DateTime.UtcNow;
                await _db.SaveChangesAsync();

                createdUserEmail = user.Email;
                emailSent = await _email.SendWelcomePasswordAsync(user.Email, client.Name, tempPassword);
            }

            return CreatedAtAction(nameof(GetById), new { id = client.Id }, new
            {
                client.Id, client.Name, client.Status,
                accessCreated = createdUserEmail != null,
                accessEmail   = createdUserEmail,
                emailSent
            });
        }

        // PUT api/clients/{id}
        [HttpPut("{id:int}")]
        public async Task<IActionResult> Update(int id, [FromBody] Client updated)
        {
            var client = await _db.Clients.FindAsync(id);
            if (client == null) return NotFound();

            client.Name                = updated.Name;
            client.BusinessType        = updated.BusinessType;
            client.Rfc                 = updated.Rfc;
            client.Address             = updated.Address;
            client.City                = updated.City;
            client.State               = updated.State;
            client.PostalCode          = updated.PostalCode;
            client.Country             = updated.Country;
            client.ContactName         = updated.ContactName;
            client.ContactPhone        = updated.ContactPhone;
            client.ContactEmail        = updated.ContactEmail;
            client.CloudStorageActive  = updated.CloudStorageActive;
            client.LocalStorageType    = updated.LocalStorageType;
            client.NvrIp               = updated.NvrIp;
            client.NvrPort             = updated.NvrPort;
            client.NvrUser             = updated.NvrUser;
            if (!string.IsNullOrWhiteSpace(updated.NvrPassword))
                client.NvrPassword     = updated.NvrPassword;
            client.NvrBrand            = updated.NvrBrand;
            client.Metadata            = updated.Metadata;
            client.UpdatedAt           = DateTime.UtcNow;

            await _db.SaveChangesAsync();
            return Ok(client);
        }

        // PATCH api/clients/{id}/status
        [HttpPatch("{id:int}/status")]
        public async Task<IActionResult> UpdateStatus(int id, [FromBody] StatusRequest req)
        {
            var client = await _db.Clients.FindAsync(id);
            if (client == null) return NotFound();

            client.Status    = req.Status;
            client.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();

            return Ok(new { client.Id, client.Status });
        }

        // DELETE api/clients/{id}
        [HttpDelete("{id:int}")]
        public async Task<IActionResult> Delete(int id)
        {
            var client = await _db.Clients.FindAsync(id);
            if (client == null) return NotFound();

            client.DeletedAt = DateTime.UtcNow;
            client.Status    = "inactive";
            client.UpdatedAt = DateTime.UtcNow;

            var cameras = await _db.Cameras
                .Where(c => c.ClientId == id && c.Status != "inactive")
                .ToListAsync();

            foreach (var cam in cameras)
            {
                cam.Status    = "inactive";
                cam.UpdatedAt = DateTime.UtcNow;
            }

            await _db.SaveChangesAsync();
            return NoContent();
        }

        // GET api/clients/trash
        [HttpGet("trash")]
        public async Task<IActionResult> GetTrash()
        {
            var deleted = await _db.Clients
                .Include(c => c.User)
                .Where(c => c.DeletedAt != null)
                .OrderByDescending(c => c.DeletedAt)
                .ToListAsync();

            return Ok(deleted.Select(c => new {
                c.Id, c.Name, c.GatewayId, c.BusinessType,
                c.ContactName, c.City, c.DeletedAt,
                DaysUntilPurge = Math.Max(0, 30 - (int)(DateTime.UtcNow - c.DeletedAt!.Value).TotalDays),
                PermanentDeleteDate = c.DeletedAt!.Value.AddDays(30)
            }));
        }

        // PATCH api/clients/{id}/restore
        [HttpPatch("{id:int}/restore")]
        public async Task<IActionResult> Restore(int id)
        {
            var client = await _db.Clients.FindAsync(id);
            if (client == null) return NotFound();
            if (client.DeletedAt == null) return BadRequest(new { message = "El cliente no está eliminado." });

            client.DeletedAt = null;
            client.Status    = "active";
            client.UpdatedAt = DateTime.UtcNow;

            var cameras = await _db.Cameras
                .Where(c => c.ClientId == id && c.Status == "inactive")
                .ToListAsync();

            foreach (var cam in cameras)
            {
                cam.Status    = "offline";
                cam.UpdatedAt = DateTime.UtcNow;
            }

            await _db.SaveChangesAsync();
            return Ok(new { client.Id, client.Name, client.Status, client.DeletedAt });
        }

        // DELETE api/clients/{id}/permanent
        [HttpDelete("{id:int}/permanent")]
        public async Task<IActionResult> PermanentDelete(int id)
        {
            var client = await _db.Clients
                .Include(c => c.User)
                .FirstOrDefaultAsync(c => c.Id == id);

            if (client == null) return NotFound();
            if (client.DeletedAt == null) return BadRequest(new { message = "Solo se pueden eliminar permanentemente clientes en la papelera." });

            var cameras = await _db.Cameras.Where(c => c.ClientId == id).ToListAsync();
            _db.Cameras.RemoveRange(cameras);

            if (client.User != null)
            {
                client.User.IsActive  = false;
                client.User.UpdatedAt = DateTime.UtcNow;
            }

            _db.Clients.Remove(client);
            await _db.SaveChangesAsync();

            return NoContent();
        }

        // PATCH api/clients/{id}/cloud-storage
        [HttpPatch("{id:int}/cloud-storage")]
        public async Task<IActionResult> ToggleCloudStorage(int id, [FromBody] CloudStorageRequest req)
        {
            var client = await _db.Clients.FindAsync(id);
            if (client == null) return NotFound();

            client.CloudStorageActive    = req.Active;
            client.CloudStorageEnabledAt = req.Active ? DateTime.UtcNow : client.CloudStorageEnabledAt;
            client.UpdatedAt             = DateTime.UtcNow;
            await _db.SaveChangesAsync();

            return Ok(new { client.Id, client.Name, client.CloudStorageActive, client.CloudStorageEnabledAt });
        }

        // GET api/clients/stats
        [HttpGet("stats")]
        public async Task<IActionResult> GetStats()
        {
            var total     = await _db.Clients.CountAsync(c => c.DeletedAt == null);
            var active    = await _db.Clients.CountAsync(c => c.Status == "active"    && c.DeletedAt == null);
            var inactive  = await _db.Clients.CountAsync(c => c.Status == "inactive"  && c.DeletedAt == null);
            var suspended = await _db.Clients.CountAsync(c => c.Status == "suspended" && c.DeletedAt == null);
            var withCloud = await _db.Clients.CountAsync(c => c.CloudStorageActive    && c.DeletedAt == null);
            var totalCam  = await _db.Cameras.CountAsync(c => !c.IsRecordingOnly);
            var activeCam = await _db.Cameras.CountAsync(c => c.Status == "active" && !c.IsRecordingOnly);

            var byType = await _db.Clients
                .Where(c => c.BusinessType != null)
                .GroupBy(c => c.BusinessType!)
                .Select(g => new { businessType = g.Key, count = g.Count() })
                .ToListAsync();

            return Ok(new
            {
                clients = new { total, active, inactive, suspended, withCloudStorage = withCloud },
                cameras = new { total = totalCam, active = activeCam },
                byBusinessType = byType
            });
        }

        // POST api/clients/{id}/create-user — crea cuenta de acceso para el cliente
        [HttpPost("{id:int}/create-user")]
        public async Task<IActionResult> CreateUser(int id, [FromBody] CreateUserRequest req)
        {
            var client = await _db.Clients.FindAsync(id);
            if (client == null) return NotFound();

            if (client.UserId != null)
                return Conflict(new { message = "Este cliente ya tiene una cuenta de acceso vinculada." });

            if (await _db.Users.AnyAsync(u => u.Email == req.Email.Trim().ToLowerInvariant()))
                return Conflict(new { message = "El email ya está registrado en el sistema." });

            var plainPassword = req.Password;
            var user = new User
            {
                Email              = req.Email.Trim().ToLowerInvariant(),
                PasswordHash       = BCrypt.Net.BCrypt.HashPassword(plainPassword),
                Name               = req.Name ?? client.ContactName ?? client.Name,
                Role               = "client",
                IsActive           = true,
                MustChangePassword = true,
                CreatedAt          = DateTime.UtcNow,
                UpdatedAt          = DateTime.UtcNow
            };

            _db.Users.Add(user);
            await _db.SaveChangesAsync();

            client.UserId    = user.Id;
            client.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();

            // Enviar credenciales por email
            bool emailSent = false;
            if (!string.IsNullOrEmpty(user.Email) && !string.IsNullOrEmpty(plainPassword))
            {
                emailSent = await _email.SendWelcomePasswordAsync(
                    user.Email, client.Name, plainPassword);
            }

            return Ok(new { user.Id, user.Email, user.Name, user.Role, user.IsActive, user.MustChangePassword,
                emailSent,
                tempPassword = emailSent ? null : plainPassword });
        }

        // DELETE api/clients/{id}/user — desvincula (y desactiva) la cuenta del cliente
        [HttpDelete("{id:int}/user")]
        public async Task<IActionResult> DeleteUser(int id)
        {
            var client = await _db.Clients.Include(c => c.User).FirstOrDefaultAsync(c => c.Id == id);
            if (client == null) return NotFound();

            if (client.UserId == null)
                return BadRequest(new { message = "Este cliente no tiene cuenta de acceso vinculada." });

            if (client.User != null)
            {
                client.User.IsActive  = false;
                client.User.UpdatedAt = DateTime.UtcNow;
            }

            client.UserId    = null;
            client.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();

            return Ok(new { message = "Acceso revocado correctamente." });
        }

        // ── Sub-usuarios ──────────────────────────────────────────────────────────

        // GET api/clients/{clientId}/sub-users
        [HttpGet("{clientId:int}/sub-users")]
        public async Task<IActionResult> ListSubUsers(int clientId)
        {
            if (!await _db.Clients.AnyAsync(c => c.Id == clientId))
                return NotFound();

            var users = await _db.Users
                .AsNoTracking()
                .Where(u => u.ClientId == clientId)
                .Select(u => new { u.Id, u.Email, u.Name, u.IsActive, u.MustChangePassword, u.CreatedAt })
                .ToListAsync();

            return Ok(users);
        }

        // POST api/clients/{clientId}/sub-users
        [HttpPost("{clientId:int}/sub-users")]
        public async Task<IActionResult> CreateSubUser(int clientId, [FromBody] CreateSubUserRequest req)
        {
            if (!await _db.Clients.AnyAsync(c => c.Id == clientId))
                return NotFound();

            var email = req.Email.Trim().ToLowerInvariant();

            if (await _db.Users.AnyAsync(u => u.ClientId == clientId && u.Email == email))
                return Conflict(new { message = "Ya existe un usuario con ese email en este cliente." });

            if (await _db.Users.AnyAsync(u => u.ClientId == null && u.Email == email))
                return Conflict(new { message = "El email ya está registrado como usuario principal del sistema." });

            var user = new User
            {
                Email              = email,
                PasswordHash       = BCrypt.Net.BCrypt.HashPassword(req.Password),
                Name               = req.Name,
                Role               = "client",
                ClientId           = clientId,
                IsActive           = true,
                MustChangePassword = req.MustChangePassword ?? true,
                CreatedAt          = DateTime.UtcNow,
                UpdatedAt          = DateTime.UtcNow
            };

            _db.Users.Add(user);
            await _db.SaveChangesAsync();

            return CreatedAtAction(nameof(ListSubUsers), new { clientId },
                new { user.Id, user.Email, user.Name, user.IsActive, user.MustChangePassword });
        }

        // DELETE api/clients/{clientId}/sub-users/{userId}
        [HttpDelete("{clientId:int}/sub-users/{userId:int}")]
        public async Task<IActionResult> DeleteSubUser(int clientId, int userId)
        {
            var client = await _db.Clients.FindAsync(clientId);
            if (client == null) return NotFound();

            if (client.UserId == userId)
                return BadRequest(new { message = "No se puede eliminar el usuario principal del cliente." });

            var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == userId && u.ClientId == clientId);
            if (user == null) return NotFound();

            _db.Users.Remove(user);
            await _db.SaveChangesAsync();
            return NoContent();
        }

        // PATCH api/clients/{clientId}/sub-users/{userId}/status
        [HttpPatch("{clientId:int}/sub-users/{userId:int}/status")]
        public async Task<IActionResult> UpdateSubUserStatus(int clientId, int userId, [FromBody] SubUserStatusRequest req)
        {
            var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == userId && u.ClientId == clientId);
            if (user == null) return NotFound();

            user.IsActive  = req.IsActive;
            user.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();

            return Ok(new { user.Id, user.IsActive });
        }

        // ─────────────────────────────────────────────────────────────────────────

        public record StatusRequest(string Status);
        public record CloudStorageRequest(bool Active);

        public record CreateClientRequest(
            [Required][StringLength(200, MinimumLength = 1)] string Name,
            string? BusinessType,
            string? Rfc,
            string? City,
            string? State,
            string? Country,
            string? ContactName,
            string? ContactPhone,
            string? ContactEmail,
            bool    CloudStorageActive = false,
            // Campos opcionales de acceso — si se omiten se usa ContactEmail/ContactName como fallback
            [EmailAddress] string? UserEmail = null,
            string? UserName = null
        );

        public record CreateUserRequest(
            [Required] string Email,
            [Required] string Password,
            string? Name
        );

        public record CreateSubUserRequest(
            [Required][EmailAddress] string Email,
            [Required] string Password,
            string? Name,
            bool? MustChangePassword
        );

        public record SubUserStatusRequest(bool IsActive);
    }
}
