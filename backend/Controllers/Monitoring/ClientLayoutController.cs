using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MotorControlEnterprise.Api.Data;
using MotorControlEnterprise.Api.Models;

namespace MotorControlEnterprise.Api.Controllers
{
    [ApiController]
    [Route("api/client/layouts")]
    [Authorize(Roles = "client")]
    public class ClientLayoutController : ControllerBase
    {
        private readonly ApplicationDbContext _db;

        public ClientLayoutController(ApplicationDbContext db)
        {
            _db = db;
        }

        private async Task<Client?> GetClientAsync()
        {
            if (!int.TryParse(User.FindFirstValue(JwtRegisteredClaimNames.Sub), out var userId))
                return null;
            return await _db.Clients.FirstOrDefaultAsync(c => c.UserId == userId);
        }

        // GET /api/client/layouts
        [HttpGet]
        public async Task<IActionResult> GetLayouts()
        {
            var client = await GetClientAsync();
            if (client is null) return Unauthorized();

            var layouts = await _db.ClientLayouts
                .AsNoTracking()
                .Where(l => l.ClientId == client.Id)
                .OrderBy(l => l.CreatedAt)
                .Select(l => new {
                    l.Id, l.Name, l.IsDefault, l.CreatedAt, l.UpdatedAt,
                    Config = l.Config
                })
                .ToListAsync();

            return Ok(layouts);
        }

        // POST /api/client/layouts
        [HttpPost]
        public async Task<IActionResult> CreateLayout([FromBody] CreateLayoutRequest req)
        {
            var client = await GetClientAsync();
            if (client is null) return Unauthorized();

            var count = await _db.ClientLayouts.CountAsync(l => l.ClientId == client.Id);
            if (count >= 20)
                return BadRequest(new { error = "Máximo 20 layouts permitidos" });

            if (req.IsDefault)
            {
                await _db.ClientLayouts
                    .Where(l => l.ClientId == client.Id && l.IsDefault)
                    .ExecuteUpdateAsync(s => s.SetProperty(l => l.IsDefault, false));
            }

            var layout = new ClientLayout
            {
                ClientId = client.Id,
                Name = req.Name,
                Config = req.Config ?? "{}",
                IsDefault = req.IsDefault,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            _db.ClientLayouts.Add(layout);
            await _db.SaveChangesAsync();

            return CreatedAtAction(nameof(GetLayouts), new { id = layout.Id }, new {
                layout.Id, layout.Name, layout.IsDefault, layout.Config,
                layout.CreatedAt, layout.UpdatedAt
            });
        }

        // PUT /api/client/layouts/:id
        [HttpPut("{id:int}")]
        public async Task<IActionResult> UpdateLayout(int id, [FromBody] UpdateLayoutRequest req)
        {
            var client = await GetClientAsync();
            if (client is null) return Unauthorized();

            var layout = await _db.ClientLayouts
                .FirstOrDefaultAsync(l => l.Id == id && l.ClientId == client.Id);
            if (layout is null) return NotFound(new { error = "Layout no encontrado" });

            if (req.IsDefault == true)
            {
                await _db.ClientLayouts
                    .Where(l => l.ClientId == client.Id && l.IsDefault && l.Id != id)
                    .ExecuteUpdateAsync(s => s.SetProperty(l => l.IsDefault, false));
            }

            if (req.Name is not null) layout.Name = req.Name;
            if (req.Config is not null) layout.Config = req.Config;
            if (req.IsDefault.HasValue) layout.IsDefault = req.IsDefault.Value;
            layout.UpdatedAt = DateTime.UtcNow;

            await _db.SaveChangesAsync();

            return Ok(new {
                layout.Id, layout.Name, layout.IsDefault, layout.Config,
                layout.CreatedAt, layout.UpdatedAt
            });
        }

        // DELETE /api/client/layouts/:id
        [HttpDelete("{id:int}")]
        public async Task<IActionResult> DeleteLayout(int id)
        {
            var client = await GetClientAsync();
            if (client is null) return Unauthorized();

            var layout = await _db.ClientLayouts
                .FirstOrDefaultAsync(l => l.Id == id && l.ClientId == client.Id);
            if (layout is null) return NotFound(new { error = "Layout no encontrado" });

            bool wasDefault = layout.IsDefault;
            _db.ClientLayouts.Remove(layout);
            await _db.SaveChangesAsync();

            if (wasDefault)
            {
                var next = await _db.ClientLayouts
                    .Where(l => l.ClientId == client.Id)
                    .OrderBy(l => l.CreatedAt)
                    .FirstOrDefaultAsync();
                if (next is not null)
                {
                    next.IsDefault = true;
                    await _db.SaveChangesAsync();
                }
            }

            return NoContent();
        }
    }

    public record CreateLayoutRequest(
        [property: System.ComponentModel.DataAnnotations.Required]
        [property: System.ComponentModel.DataAnnotations.StringLength(80, MinimumLength = 1)]
        string Name,
        string? Config,
        bool IsDefault);

    public record UpdateLayoutRequest(
        [property: System.ComponentModel.DataAnnotations.StringLength(80, MinimumLength = 1)]
        string? Name,
        string? Config,
        bool? IsDefault);
}
