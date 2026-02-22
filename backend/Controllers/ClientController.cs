using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MotorControlEnterprise.Api.Data;
using MotorControlEnterprise.Api.Models;

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
                .Select(c => new {
                    c.Id, c.Name, c.BusinessType, c.Rfc,
                    c.City, c.State, c.Country,
                    c.ContactName, c.ContactPhone, c.ContactEmail,
                    c.GatewayId, c.Status, c.CloudStorageActive,
                    c.CreatedAt,
                    CameraCount = c.Id  // placeholder — joined below
                })
                .ToListAsync();

            return Ok(clients);
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

            // Soft-delete: marcar como inactivo en lugar de borrar
            client.Status    = "inactive";
            client.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();

            return NoContent();
        }

        public record StatusRequest(string Status);
    }
}
