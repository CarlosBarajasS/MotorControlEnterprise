using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MotorControlEnterprise.Api.Data;
using MotorControlEnterprise.Api.Models;
using System.ComponentModel.DataAnnotations;

namespace MotorControlEnterprise.Api.Controllers
{
    [ApiController]
    [Route("api/clients")]
    [Authorize(Roles = "admin")]
    public class ClientController : ControllerBase
    {
        private readonly ApplicationDbContext _db;

        public ClientController(ApplicationDbContext db) => _db = db;

        // GET api/clients
        [HttpGet]
        public async Task<IActionResult> GetAll()
        {
            var clients = await _db.Clients
                .Include(c => c.User)
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
                .Select(c => new { c.Id, c.Name, c.Status, c.LastSeen, c.CameraId })
                .ToListAsync();

            return Ok(new { client, cameras });
        }

        // POST api/clients
        [HttpPost]
        public async Task<IActionResult> Create([FromBody] Client client)
        {
            if (await _db.Clients.AnyAsync(c => c.Name == client.Name))
                return Conflict(new { message = "Ya existe un cliente con ese nombre" });

            client.CreatedAt = DateTime.UtcNow;
            client.UpdatedAt = DateTime.UtcNow;
            client.Status    = "active";

            _db.Clients.Add(client);
            await _db.SaveChangesAsync();

            return CreatedAtAction(nameof(GetById), new { id = client.Id }, client);
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

            // Soft-delete: marcar cliente y sus cámaras como inactivo
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
            var total     = await _db.Clients.CountAsync();
            var active    = await _db.Clients.CountAsync(c => c.Status == "active");
            var inactive  = await _db.Clients.CountAsync(c => c.Status == "inactive");
            var suspended = await _db.Clients.CountAsync(c => c.Status == "suspended");
            var withCloud = await _db.Clients.CountAsync(c => c.CloudStorageActive);
            var totalCam  = await _db.Cameras.CountAsync();
            var activeCam = await _db.Cameras.CountAsync(c => c.Status == "active");

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

            var user = new User
            {
                Email        = req.Email.Trim().ToLowerInvariant(),
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password),
                Name         = req.Name,
                Role         = "client",
                IsActive     = true,
                CreatedAt    = DateTime.UtcNow,
                UpdatedAt    = DateTime.UtcNow
            };

            _db.Users.Add(user);
            await _db.SaveChangesAsync();

            client.UserId    = user.Id;
            client.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();

            return Ok(new { user.Id, user.Email, user.Name, user.Role, user.IsActive });
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

        public record StatusRequest(string Status);
        public record CloudStorageRequest(bool Active);
        public record CreateUserRequest(
            [Required] string Email,
            [Required] string Password,
            string? Name
        );
    }
}
