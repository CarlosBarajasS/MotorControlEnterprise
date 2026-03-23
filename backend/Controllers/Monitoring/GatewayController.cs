using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MotorControlEnterprise.Api.Data;
using MotorControlEnterprise.Api.Models;
using System.Text.Json;

namespace MotorControlEnterprise.Api.Controllers
{
    // ── DTOs ──────────────────────────────────────────────────────────────────

    public record GatewayDto(
        int Id,
        string GatewayId,
        string Name,
        string? Location,
        int ClientId,
        string ClientName,
        string Status,
        DateTime? LastHeartbeatAt,
        DateTime CreatedAt,
        int CameraCount
    );

    public record GatewayCreateDto(
        string GatewayId,
        string Name,
        string? Location,
        int ClientId,
        string EdgeToken
    );

    public record GatewayUpdateDto(
        string? Name,
        string? Location,
        string? Status
    );

    // ── Controller ────────────────────────────────────────────────────────────

    [ApiController]
    [Route("api/gateways")]
    [Authorize(Roles = "admin,installer")]
    public class GatewayController : ControllerBase
    {
        private readonly ApplicationDbContext _db;

        public GatewayController(ApplicationDbContext db)
        {
            _db = db;
        }

        // GET api/gateways[?clientId=X]
        [HttpGet]
        public async Task<IActionResult> GetAll([FromQuery] int? clientId)
        {
            var query = _db.Gateways.Include(g => g.Client).AsQueryable();

            if (clientId.HasValue)
                query = query.Where(g => g.ClientId == clientId.Value);

            var gateways = await query.OrderBy(g => g.Name).ToListAsync();

            var cameraCountMap = await _db.Cameras
                .Where(c => c.ClientId != null)
                .GroupBy(c => c.ClientId!.Value)
                .Select(g => new { ClientId = g.Key, Count = g.Count() })
                .ToDictionaryAsync(x => x.ClientId, x => x.Count);

            return Ok(gateways.Select(g => ToDto(g, cameraCountMap)));
        }

        // GET api/gateways/{id}
        [HttpGet("{id:int}")]
        public async Task<IActionResult> GetById(int id)
        {
            var gateway = await _db.Gateways
                .Include(g => g.Client)
                .FirstOrDefaultAsync(g => g.Id == id);

            if (gateway == null) return NotFound();

            var cameraCount = await _db.Cameras.CountAsync(c => c.ClientId == gateway.ClientId);
            return Ok(ToDto(gateway, new Dictionary<int, int> { { gateway.ClientId, cameraCount } }));
        }

        // POST api/gateways
        [HttpPost]
        [Authorize(Roles = "admin")]
        public async Task<IActionResult> Create([FromBody] GatewayCreateDto dto)
        {
            if (await _db.Gateways.AnyAsync(g => g.GatewayId == dto.GatewayId))
                return Conflict(new { message = $"Ya existe un gateway con el ID '{dto.GatewayId}'." });

            var clientExists = await _db.Clients.AnyAsync(c => c.Id == dto.ClientId);
            if (!clientExists)
                return BadRequest(new { message = $"El cliente con ID {dto.ClientId} no existe." });

            var gateway = new Gateway
            {
                GatewayId       = dto.GatewayId,
                Name            = dto.Name,
                Location        = dto.Location,
                ClientId        = dto.ClientId,
                Status          = "active",
                Metadata        = JsonSerializer.Serialize(new { edgeToken = dto.EdgeToken }),
                CreatedAt       = DateTime.UtcNow,
                UpdatedAt       = DateTime.UtcNow,
                LastHeartbeatAt = null
            };

            _db.Gateways.Add(gateway);
            await _db.SaveChangesAsync();

            // Reload with Client navigation property for response DTO
            await _db.Entry(gateway).Reference(g => g.Client).LoadAsync();

            var cameraCount = await _db.Cameras.CountAsync(c => c.ClientId == gateway.ClientId);
            return CreatedAtAction(
                nameof(GetById),
                new { id = gateway.Id },
                ToDto(gateway, new Dictionary<int, int> { { gateway.ClientId, cameraCount } })
            );
        }

        // PUT api/gateways/{id}
        [HttpPut("{id:int}")]
        [Authorize(Roles = "admin")]
        public async Task<IActionResult> Update(int id, [FromBody] GatewayUpdateDto dto)
        {
            var gateway = await _db.Gateways
                .Include(g => g.Client)
                .FirstOrDefaultAsync(g => g.Id == id);

            if (gateway == null) return NotFound();

            if (dto.Name     != null) gateway.Name     = dto.Name;
            if (dto.Location != null) gateway.Location = dto.Location;
            if (dto.Status   != null) gateway.Status   = dto.Status;
            gateway.UpdatedAt = DateTime.UtcNow;

            await _db.SaveChangesAsync();

            var cameraCount = await _db.Cameras.CountAsync(c => c.ClientId == gateway.ClientId);
            return Ok(ToDto(gateway, new Dictionary<int, int> { { gateway.ClientId, cameraCount } }));
        }

        // DELETE api/gateways/{id}
        [HttpDelete("{id:int}")]
        [Authorize(Roles = "admin")]
        public async Task<IActionResult> Delete(int id)
        {
            var gateway = await _db.Gateways.FindAsync(id);
            if (gateway == null) return NotFound();

            _db.Gateways.Remove(gateway);
            await _db.SaveChangesAsync();

            return NoContent();
        }

        // ── Nested route: GET api/clients/{clientId}/gateways ─────────────────

        [HttpGet("/api/clients/{clientId:int}/gateways")]
        public async Task<IActionResult> GetByClient(int clientId)
        {
            var clientExists = await _db.Clients.AnyAsync(c => c.Id == clientId);
            if (!clientExists) return NotFound(new { message = $"El cliente con ID {clientId} no existe." });

            var gateways = await _db.Gateways
                .Include(g => g.Client)
                .Where(g => g.ClientId == clientId)
                .OrderBy(g => g.Name)
                .ToListAsync();

            var cameraCount = await _db.Cameras.CountAsync(c => c.ClientId == clientId);
            var countMap    = new Dictionary<int, int> { { clientId, cameraCount } };

            return Ok(gateways.Select(g => ToDto(g, countMap)));
        }

        // ── Helper ────────────────────────────────────────────────────────────

        private static GatewayDto ToDto(Gateway g, Dictionary<int, int> cameraCountMap) =>
            new GatewayDto(
                Id:              g.Id,
                GatewayId:       g.GatewayId,
                Name:            g.Name,
                Location:        g.Location,
                ClientId:        g.ClientId,
                ClientName:      g.Client?.Name ?? string.Empty,
                Status:          g.Status,
                LastHeartbeatAt: g.LastHeartbeatAt,
                CreatedAt:       g.CreatedAt,
                CameraCount:     cameraCountMap.GetValueOrDefault(g.ClientId, 0)
            );
    }
}
