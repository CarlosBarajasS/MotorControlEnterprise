using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MotorControlEnterprise.Api.Data;
using MotorControlEnterprise.Api.Models;

namespace MotorControlEnterprise.Api.Controllers
{
    [ApiController]
    [Route("api/cameras")]
    [Authorize]
    public class CameraController : ControllerBase
    {
        private readonly ApplicationDbContext _db;

        public CameraController(ApplicationDbContext db) => _db = db;

        // GET api/cameras
        [HttpGet]
        public async Task<IActionResult> GetAll()
        {
            var cameras = await _db.Cameras
                .Include(c => c.Client)
                .OrderByDescending(c => c.LastSeen)
                .Select(c => new {
                    c.Id, c.Name, c.Location, c.Status,
                    c.CameraId, c.CameraKey, c.Ptz,
                    c.LastSeen, c.Streams,
                    Client = c.Client == null ? null : new { c.Client.Id, c.Client.Name, c.Client.GatewayId }
                })
                .ToListAsync();

            return Ok(cameras);
        }

        // GET api/cameras/{id}
        [HttpGet("{id:int}")]
        public async Task<IActionResult> GetById(int id)
        {
            var camera = await _db.Cameras
                .Include(c => c.Client)
                .FirstOrDefaultAsync(c => c.Id == id);

            if (camera == null) return NotFound();
            return Ok(camera);
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
                camera.Streams
            });
        }

        // POST api/cameras
        [HttpPost]
        [Authorize(Roles = "admin")]
        public async Task<IActionResult> Create([FromBody] Camera camera)
        {
            camera.CreatedAt = DateTime.UtcNow;
            camera.UpdatedAt = DateTime.UtcNow;

            _db.Cameras.Add(camera);
            await _db.SaveChangesAsync();

            return CreatedAtAction(nameof(GetById), new { id = camera.Id }, camera);
        }

        // PUT api/cameras/{id}
        [HttpPut("{id:int}")]
        [Authorize(Roles = "admin")]
        public async Task<IActionResult> Update(int id, [FromBody] Camera updated)
        {
            var camera = await _db.Cameras.FindAsync(id);
            if (camera == null) return NotFound();

            camera.Name      = updated.Name;
            camera.Location  = updated.Location;
            camera.Status    = updated.Status;
            camera.Ptz       = updated.Ptz;
            camera.ClientId  = updated.ClientId;
            camera.UpdatedAt = DateTime.UtcNow;

            await _db.SaveChangesAsync();
            return Ok(camera);
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
