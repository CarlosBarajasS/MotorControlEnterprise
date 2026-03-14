using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MotorControlEnterprise.Api.Data;
using MotorControlEnterprise.Api.Models;
using System.Text.Json;

namespace MotorControlEnterprise.Api.Controllers
{
    /// <summary>
    /// Endpoints called by the Raspberry Pi edge-agent.
    /// Auth: X-Edge-Token header (validated by EdgeTokenAuthMiddleware).
    /// </summary>
    [ApiController]
    [Route("api/edge/{gatewayId}")]
    public class EdgeCameraController : ControllerBase
    {
        private readonly ApplicationDbContext _db;

        public EdgeCameraController(ApplicationDbContext db) => _db = db;

        private Client GetEdgeClient() => (Client)HttpContext.Items["EdgeClient"]!;

        // GET /api/edge/{gatewayId}/cameras
        // Returns cameras with ONVIF credentials for startup discovery.
        [HttpGet("cameras")]
        public async Task<IActionResult> GetCameras(string gatewayId)
        {
            var client = GetEdgeClient();
            if (client.GatewayId != gatewayId) return Forbid();

            var cameras = await _db.Cameras
                .Where(c => c.ClientId == client.Id)
                .OrderBy(c => c.Name)
                .ToListAsync();

            return Ok(cameras.Select(c =>
            {
                var onvif = ExtractOnvif(c.Metadata);
                return new
                {
                    c.Id,
                    c.Name,
                    c.CameraKey,
                    ip = ExtractCameraIp(c.Streams, c.Metadata),
                    onvifPort = onvif?.port ?? 8000,
                    onvifUser = onvif?.user,
                    onvifPass = onvif?.pass
                };
            }));
        }

        // POST /api/edge/{gatewayId}/cameras/{cameraId}/streams
        // Pi reports discovered RTSP URL and stream metadata.
        [HttpPost("cameras/{cameraId:int}/streams")]
        public async Task<IActionResult> ReportStreams(
            string gatewayId, int cameraId,
            [FromBody] StreamDiscoveryDto dto)
        {
            var client = GetEdgeClient();
            if (client.GatewayId != gatewayId) return Forbid();

            var camera = await _db.Cameras
                .FirstOrDefaultAsync(c => c.Id == cameraId && c.ClientId == client.Id);
            if (camera == null) return NotFound();

            // Update Streams — keep existing centralHls, update rtsp
            var streams = ParseStreams(camera.Streams);
            streams["rtsp"] = dto.Rtsp ?? streams.GetValueOrDefault("rtsp", "");
            camera.Streams  = JsonSerializer.Serialize(streams);

            // Update Metadata — preserve onvif credentials, update discovery
            var meta = ParseMeta(camera.Metadata);
            meta["discovery"] = new
            {
                status      = dto.Status,
                brand       = dto.Brand,
                model       = dto.Model,
                resolution  = dto.Resolution,
                fps         = dto.Fps,
                discoveredAt = DateTime.UtcNow
            };
            camera.Metadata  = JsonSerializer.Serialize(meta);
            camera.UpdatedAt = DateTime.UtcNow;

            await _db.SaveChangesAsync();
            return Ok(new { message = "streams updated", camera.Id, dto.Status });
        }

        // POST /api/edge/{gatewayId}/heartbeat
        // Updates gateway's lastHeartbeatAt for online status checks.
        [HttpPost("heartbeat")]
        public async Task<IActionResult> Heartbeat(string gatewayId)
        {
            var client = GetEdgeClient();
            if (client.GatewayId != gatewayId) return Forbid();

            var meta    = ParseMeta(client.Metadata);
            meta["lastHeartbeatAt"] = DateTime.UtcNow.ToString("o");
            client.Metadata  = JsonSerializer.Serialize(meta);
            client.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();

            return Ok(new { ok = true });
        }

        // ── Helpers ──────────────────────────────────────────────────────────

        private static (int port, string? user, string? pass)? ExtractOnvif(string? metadata)
        {
            if (string.IsNullOrEmpty(metadata)) return null;
            try
            {
                var doc = JsonDocument.Parse(metadata);
                if (!doc.RootElement.TryGetProperty("onvif", out var o)) return null;
                var port = o.TryGetProperty("port", out var p) ? p.GetInt32() : 8000;
                var user = o.TryGetProperty("user", out var u) ? u.GetString() : null;
                var pass = o.TryGetProperty("pass", out var pw) ? pw.GetString() : null;
                return (port, user, pass);
            }
            catch { return null; }
        }

        private static string? ExtractCameraIp(string? streams, string? metadata)
        {
            // Primary: read from Metadata.onvif.ip (reliable for pending cameras)
            if (!string.IsNullOrEmpty(metadata))
            {
                try
                {
                    var doc = JsonDocument.Parse(metadata);
                    if (doc.RootElement.TryGetProperty("onvif", out var o) &&
                        o.TryGetProperty("ip", out var ipEl))
                    {
                        var ip = ipEl.GetString();
                        if (!string.IsNullOrEmpty(ip)) return ip;
                    }
                }
                catch { }
            }

            // Fallback: extract host from RTSP URL (only works after discovery)
            if (string.IsNullOrEmpty(streams)) return null;
            try
            {
                var doc = JsonDocument.Parse(streams);
                if (!doc.RootElement.TryGetProperty("rtsp", out var el)) return null;
                var rtsp = el.GetString();
                if (string.IsNullOrEmpty(rtsp) || rtsp == "pending_onvif_discovery") return null;
                return new Uri(rtsp).Host;
            }
            catch { return null; }
        }

        private static Dictionary<string, object?> ParseStreams(string? json)
        {
            if (string.IsNullOrEmpty(json)) return new();
            try { return JsonSerializer.Deserialize<Dictionary<string, object?>>(json) ?? new(); }
            catch { return new(); }
        }

        private static Dictionary<string, object?> ParseMeta(string? json)
        {
            if (string.IsNullOrEmpty(json)) return new();
            try { return JsonSerializer.Deserialize<Dictionary<string, object?>>(json) ?? new(); }
            catch { return new(); }
        }
    }

    public record StreamDiscoveryDto(
        string? Rtsp,
        string Status,     // "discovered" | "onvif_failed"
        string? Brand,
        string? Model,
        string? Resolution,
        int? Fps
    );
}
