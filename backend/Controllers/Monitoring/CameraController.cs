using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MotorControlEnterprise.Api.Data;
using MotorControlEnterprise.Api.Models;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text.Json;

namespace MotorControlEnterprise.Api.Controllers
{
    [ApiController]
    [Route("api/cameras")]
    [Authorize]
    public class CameraController : ControllerBase
    {
        private readonly ApplicationDbContext _db;

        public CameraController(ApplicationDbContext db) => _db = db;

        // DTO para crear/actualizar cámaras (lo que el frontend envía)
        public record CameraUpsertDto(
            string Name,
            string? Location,
            string? RtspUrl,
            int? ClientId,
            bool Ptz = false
        );

        // Extrae la URL RTSP del campo Streams (jsonb { "rtsp": "...", "hls": "..." })
        private static string? ExtractRtspUrl(string? streams)
        {
            if (streams == null) return null;
            try
            {
                var doc = JsonDocument.Parse(streams);
                return doc.RootElement.TryGetProperty("rtsp", out var el) ? el.GetString() : null;
            }
            catch { return null; }
        }

        // Construye el JSON de Streams a partir de una URL RTSP
        private static string BuildStreams(string rtspUrl)
            => JsonSerializer.Serialize(new { rtsp = rtspUrl });

        // GET api/cameras — admin ve todas, usuario solo las suyas
        [HttpGet]
        public async Task<IActionResult> GetAll()
        {
            var role = User.FindFirstValue(ClaimTypes.Role);
            var userIdStr = User.FindFirstValue(JwtRegisteredClaimNames.Sub);
            _ = int.TryParse(userIdStr, out var userId);

            var query = _db.Cameras.Include(c => c.Client).AsQueryable();

            // Si no es admin, filtrar por userId
            if (role != "admin")
                query = query.Where(c => c.UserId == userId);

            var cameras = await query
                .OrderByDescending(c => c.CreatedAt)
                .ToListAsync();

            return Ok(cameras.Select(c => new
            {
                c.Id, c.Name, c.Location, c.Status,
                c.CameraId, c.CameraKey, c.Ptz,
                c.LastSeen, c.ClientId, c.Streams, c.CreatedAt,
                GatewayId = c.Client != null ? c.Client.GatewayId : null,
                RtspUrl = ExtractRtspUrl(c.Streams),
                Client = c.Client == null ? null : new { c.Client.Id, c.Client.Name, c.Client.GatewayId }
            }));
        }

        // GET api/cameras/{id}
        [HttpGet("{id:int}")]
        public async Task<IActionResult> GetById(int id)
        {
            var camera = await _db.Cameras
                .Include(c => c.Client)
                .FirstOrDefaultAsync(c => c.Id == id);

            if (camera == null) return NotFound();

            return Ok(new
            {
                camera.Id, camera.Name, camera.Location, camera.Status,
                camera.CameraId, camera.CameraKey, camera.Ptz,
                camera.LastSeen, camera.ClientId, camera.Streams, camera.CreatedAt,
                GatewayId = camera.Client != null ? camera.Client.GatewayId : null,
                RtspUrl = ExtractRtspUrl(camera.Streams),
                Client = camera.Client == null ? null : new { camera.Client.Id, camera.Client.Name, camera.Client.GatewayId }
            });
        }

        // GET api/cameras/{id}/status
        [HttpGet("{id:int}/status")]
        public async Task<IActionResult> GetStatus(int id)
        {
            var camera = await _db.Cameras.FindAsync(id);
            if (camera == null) return NotFound();

            var isOnline = camera.LastSeen.HasValue &&
                           (DateTime.UtcNow - camera.LastSeen.Value).TotalSeconds < 90;

            return Ok(new {
                camera.Id,
                camera.Status,
                IsOnline = isOnline,
                camera.LastSeen,
                camera.Streams,
                RtspUrl = ExtractRtspUrl(camera.Streams)
            });
        }

        // POST api/cameras
        [HttpPost]
        [Authorize(Roles = "admin")]
        public async Task<IActionResult> Create([FromBody] CameraUpsertDto dto)
        {
            var userIdStr = User.FindFirstValue(JwtRegisteredClaimNames.Sub);
            _ = int.TryParse(userIdStr, out var userId);

            var camera = new Camera
            {
                Name      = dto.Name,
                Location  = dto.Location,
                Ptz       = dto.Ptz,
                ClientId  = dto.ClientId,
                UserId    = userId,
                Streams   = dto.RtspUrl != null ? BuildStreams(dto.RtspUrl) : null,
                Status    = "active",
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            _db.Cameras.Add(camera);
            await _db.SaveChangesAsync();

            return CreatedAtAction(nameof(GetById), new { id = camera.Id }, new
            {
                camera.Id, camera.Name, camera.Location, camera.Status,
                camera.Ptz, camera.ClientId, camera.Streams, camera.CreatedAt,
                RtspUrl = ExtractRtspUrl(camera.Streams)
            });
        }

        // PUT api/cameras/{id}
        [HttpPut("{id:int}")]
        [Authorize(Roles = "admin")]
        public async Task<IActionResult> Update(int id, [FromBody] CameraUpsertDto dto)
        {
            var camera = await _db.Cameras.FindAsync(id);
            if (camera == null) return NotFound();

            camera.Name      = dto.Name;
            camera.Location  = dto.Location;
            camera.Ptz       = dto.Ptz;
            camera.ClientId  = dto.ClientId;
            camera.UpdatedAt = DateTime.UtcNow;

            if (dto.RtspUrl != null)
                camera.Streams = BuildStreams(dto.RtspUrl);

            await _db.SaveChangesAsync();

            return Ok(new
            {
                camera.Id, camera.Name, camera.Location, camera.Status,
                camera.Ptz, camera.ClientId, camera.Streams, camera.CreatedAt,
                RtspUrl = ExtractRtspUrl(camera.Streams)
            });
        }

        // DELETE api/cameras/{id}
        [HttpDelete("{id:int}")]
        [Authorize(Roles = "admin")]
        public async Task<IActionResult> Delete(int id)
        {
            var camera = await _db.Cameras.FindAsync(id);
            if (camera == null) return NotFound();

            _db.Cameras.Remove(camera);
            await _db.SaveChangesAsync();
            return NoContent();
        }

        // GET api/cameras/{id}/recordings
        [HttpGet("{id:int}/recordings")]
        public async Task<IActionResult> GetRecordings(int id, [FromQuery] int limit = 20, [FromQuery] int offset = 0)
        {
            var recordings = await _db.Recordings
                .Where(r => r.CameraId == id)
                .OrderByDescending(r => r.EndedAt)
                .Skip(offset)
                .Take(limit)
                .ToListAsync();

            var total = await _db.Recordings.CountAsync(r => r.CameraId == id);

            return Ok(new { total, recordings });
        }
    }
}
