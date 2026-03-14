# ONVIF Auto-Discovery Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Any ONVIF-compatible camera gets discovered and configured automatically from the wizard — the installer only needs IP, ONVIF port, username, and password.

**Architecture:** The Raspberry Pi acts as the ONVIF discovery agent (it's on the same LAN as cameras). The central server sends MQTT commands to the Pi; the Pi runs ONVIF queries and reports discovered RTSP URLs back via REST API. The wizard polls for discovery status in real time.

**Tech Stack:** ASP.NET Core 8 (C#), Angular 17 standalone, Node.js edge-agent, MediaMTX REST API, MQTT (MQTTnet 5.1), PostgreSQL JSONB, `onvif` npm package.

**Repos:**
- `C:\dev\MotorControlEnterprise` — backend + frontend
- `C:\dev\motorcontrol-edge-template` — Node.js edge-agent on Raspberry Pi

**Spec:** `docs/superpowers/specs/2026-03-13-onvif-auto-discovery-design.md`

---

## Chunk 1: Quick Fixes

These are safe, independent fixes that improve the existing system immediately.

### Task 1: Fix mediamtx.yml ffmpeg relay template

The current template uses `-re` (causes `bitrate=N/A`, data never reaches central) and lacks `-rtsp_transport tcp` (UDP blocked by cloud firewall). Also remove hardcoded camera paths — the edge-agent will add them dynamically.

**Files:**
- Modify: `backend/Controllers/Monitoring/WizardController.cs:249-280`

- [ ] **Step 1: Update `BuildMediamtxYml` in WizardController.cs**

Replace the `pathDefaults` runOnReady block and the `paths:` section:

```csharp
// Replace lines 250-280 of WizardController.cs
sb.AppendLine("pathDefaults:");
sb.AppendLine("  record: yes");
sb.AppendLine("  recordPath: /recordings/%path/%Y-%m-%d/%H-%M-%S");
sb.AppendLine("  recordFormat: fmp4");
sb.AppendLine("  recordSegmentDuration: 15m");
sb.AppendLine("  runOnReady: >-");
sb.AppendLine("    ffmpeg");
sb.AppendLine("    -rtsp_transport tcp");
sb.AppendLine("    -i rtsp://${MEDIAMTX_USERNAME}:${MEDIAMTX_PASSWORD}@127.0.0.1:8554/$MTX_PATH");
sb.AppendLine("    -c copy -f rtsp -rtsp_transport tcp");
sb.AppendLine("    rtsp://${MEDIAMTX_PUSH_USER}:${MEDIAMTX_PUSH_PASS}@${CENTRAL_RTSP_HOST}:${CENTRAL_RTSP_PORT}/${GATEWAY_CLIENT_ID}/$MTX_PATH");
sb.AppendLine("  runOnReadyRestart: yes");
sb.AppendLine();
sb.AppendLine("paths:");
sb.AppendLine("  # Paths managed dynamically by edge-agent via MediaMTX REST API");
sb.AppendLine("  all_others: ~");
// Remove the entire cameras loop and placeholder — no more hardcoded paths
```

The full `BuildMediamtxYml` method now ends at `all_others: ~`. Delete lines 258-280 (the cameras loop and placeholder).

- [ ] **Step 2: Verify the generated yml looks correct**

In the Swagger UI or via curl (after running locally), call `GET /api/admin/clients/1/edge-config` and check that `mediamtxYml` in the response contains `-rtsp_transport tcp` and only `all_others: ~` in paths (no camera entries).

- [ ] **Step 3: Commit**

```bash
cd C:/dev/MotorControlEnterprise
git add backend/Controllers/Monitoring/WizardController.cs
git commit -m "fix(stream): use -rtsp_transport tcp in edge mediamtx template

Removes -re flag (caused bitrate=N/A silence) and forces TCP transport
to bypass UDP port restrictions in cloud provider firewalls.
Removes hardcoded camera paths — edge-agent adds them dynamically."
```

---

### Task 2: Fix `.env` download filename on Windows

Windows browsers silently block downloads of files starting with `.`. Rename to `edge-gateway.env` and update deployment instructions.

**Files:**
- Modify: `frontend/src/app/components/wizard/wizard.component.ts:297-299`
- Modify: `frontend/src/app/components/wizard/wizard.component.html` (Step 4 deploy instructions)

- [ ] **Step 1: Fix filename in `downloadFile()`**

In `wizard.component.ts`, change:
```typescript
// Before (line 299):
filename = '.env';

// After:
filename = 'edge-gateway.env';
```

- [ ] **Step 2: Update Step 4 deploy instructions in template**

Find the deploy commands in `wizard.component.html` (Step 4) and update to include the rename step. Look for the `docker compose up` command block and add:

```html
<!-- Add before docker compose up -d -->
<code>mv edge-gateway.env .env</code>
<code>docker compose up -d</code>
<code>docker logs edge-agent -f</code>
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/components/wizard/wizard.component.ts
git add frontend/src/app/components/wizard/wizard.component.html
git commit -m "fix(wizard): rename .env download to edge-gateway.env for Windows compat"
```

---

### Task 3: Generate edge token in WizardController and include in .env

The edge-agent needs `CENTRAL_API_TOKEN` to authenticate with the new `/api/edge/` endpoints. Generate a UUID v4 token on first call to `GetEdgeConfig`, store it in `Client.Metadata`, and include it in the `.env`.

**Files:**
- Modify: `backend/Controllers/Monitoring/WizardController.cs`

- [ ] **Step 1: Add token generation logic in `GetEdgeConfig`**

After loading `client` and resolving `gatewayId`, add:

```csharp
// Generate edge token if not yet present
var edgeToken = ExtractEdgeToken(client.Metadata);
if (string.IsNullOrEmpty(edgeToken))
{
    edgeToken = Guid.NewGuid().ToString("N"); // 32-char hex, no hyphens
    var meta = string.IsNullOrEmpty(client.Metadata)
        ? new System.Collections.Generic.Dictionary<string, object>()
        : JsonSerializer.Deserialize<System.Collections.Generic.Dictionary<string, object>>(client.Metadata)!;
    meta["edgeToken"] = edgeToken;
    client.Metadata  = JsonSerializer.Serialize(meta);
    client.UpdatedAt = DateTime.UtcNow;
    await _db.SaveChangesAsync();
}
```

- [ ] **Step 2: Add `ExtractEdgeToken` helper**

```csharp
private static string? ExtractEdgeToken(string? metadata)
{
    if (string.IsNullOrEmpty(metadata)) return null;
    try
    {
        var doc = JsonDocument.Parse(metadata);
        return doc.RootElement.TryGetProperty("edgeToken", out var el)
            ? el.GetString() : null;
    }
    catch { return null; }
}
```

- [ ] **Step 3: Pass token to `BuildEnv`**

Update `BuildEnv` signature and call site:
```csharp
// In GetEdgeConfig, update the call:
env = BuildEnv(client, gatewayId, mqttHost, mqttPort, mqttUser, mqttPass, centralApi, location, edgeToken),

// In BuildEnv signature, add parameter:
private static string BuildEnv(
    Client client, string gatewayId,
    string mqttHost, string mqttPort,
    string mqttUser, string mqttPass,
    string centralApi, string location,
    string edgeToken)   // ← new
```

- [ ] **Step 4: Replace empty `CENTRAL_API_TOKEN=` line in `BuildEnv`**

Change line:
```csharp
// Before:
sb.AppendLine("CENTRAL_API_TOKEN=");

// After:
sb.AppendLine($"CENTRAL_API_TOKEN={edgeToken}");
```

- [ ] **Step 5: Verify token appears in generated .env**

Call `GET /api/admin/clients/1/edge-config` and confirm `env` field contains `CENTRAL_API_TOKEN=` followed by a 32-character hex string. Calling the same endpoint twice should return the same token.

- [ ] **Step 6: Commit**

```bash
git add backend/Controllers/Monitoring/WizardController.cs
git commit -m "feat(wizard): generate edge token and include in .env as CENTRAL_API_TOKEN

Edge-agent uses this token to authenticate with /api/edge/ endpoints.
Token generated once, stored in Client.Metadata, reused on subsequent calls."
```

---

## Chunk 2: Backend Endpoints

### Task 4: Add `EdgeTokenAuthMiddleware`

Validates `X-Edge-Token` header for all `/api/edge/` routes.

**Files:**
- Create: `backend/Middleware/EdgeTokenAuthMiddleware.cs`
- Modify: `backend/Program.cs`

- [ ] **Step 1: Create the middleware**

```csharp
// backend/Middleware/EdgeTokenAuthMiddleware.cs
using Microsoft.EntityFrameworkCore;
using MotorControlEnterprise.Api.Data;
using System.Text.Json;

namespace MotorControlEnterprise.Api.Middleware
{
    public class EdgeTokenAuthMiddleware
    {
        private readonly RequestDelegate _next;

        public EdgeTokenAuthMiddleware(RequestDelegate next) => _next = next;

        public async Task InvokeAsync(HttpContext context, ApplicationDbContext db)
        {
            // Only apply to /api/edge/ routes
            if (!context.Request.Path.StartsWithSegments("/api/edge"))
            {
                await _next(context);
                return;
            }

            var token = context.Request.Headers["X-Edge-Token"].FirstOrDefault();
            if (string.IsNullOrEmpty(token))
            {
                context.Response.StatusCode = 401;
                await context.Response.WriteAsJsonAsync(new { message = "X-Edge-Token required" });
                return;
            }

            // Find client with matching edgeToken in Metadata JSONB
            var client = await db.Clients
                .Where(c => EF.Functions.JsonContains(c.Metadata!, $"{{\"edgeToken\":\"{token}\"}}"))
                .FirstOrDefaultAsync();

            if (client == null)
            {
                context.Response.StatusCode = 401;
                await context.Response.WriteAsJsonAsync(new { message = "Invalid edge token" });
                return;
            }

            // Store client in HttpContext for controllers to use
            context.Items["EdgeClient"] = client;
            await _next(context);
        }
    }
}
```

- [ ] **Step 2: Register middleware in `Program.cs`**

Add after `app.UseAuthentication()`:
```csharp
app.UseMiddleware<MotorControlEnterprise.Api.Middleware.EdgeTokenAuthMiddleware>();
```

- [ ] **Step 3: Commit**

```bash
git add backend/Middleware/EdgeTokenAuthMiddleware.cs backend/Program.cs
git commit -m "feat(edge): add EdgeTokenAuthMiddleware for /api/edge/ routes"
```

---

### Task 5: Update `CameraController` and `CameraUpsertDto` for ONVIF fields

Camera creation now accepts ONVIF credentials instead of requiring a complete RTSP URL. Sets `discovery.status = "pending"` and auto-computes `centralHls`.

**Files:**
- Modify: `backend/Controllers/Monitoring/CameraController.cs`

- [ ] **Step 1: Expand `CameraUpsertDto`**

```csharp
public record CameraUpsertDto(
    string Name,
    string? Location,
    string? RtspUrl,       // kept for backward compat — null when using ONVIF
    int? ClientId,
    bool Ptz = false,
    bool IsRecordingOnly = false,
    string? CameraId = null,
    // ONVIF credentials (new)
    int? OnvifPort = 8000,
    string? OnvifUser = null,
    string? OnvifPass = null
);
```

- [ ] **Step 2: Update `Create` to set CameraKey, Streams with centralHls, and Metadata**

Replace the camera initialization block (lines 200-213):

```csharp
[HttpPost]
[Authorize(Roles = "admin")]
public async Task<IActionResult> Create([FromBody] CameraUpsertDto dto)
{
    var userIdStr = User.FindFirstValue(JwtRegisteredClaimNames.Sub);
    _ = int.TryParse(userIdStr, out var userId);

    // Compute cameraKey from cameraId or name (used as mediamtx path + centralHls)
    var rawKey   = (dto.CameraId ?? dto.Name).ToLower();
    var cameraKey = System.Text.RegularExpressions.Regex.Replace(rawKey, @"[^a-z0-9\-]", "-")
                        .Trim('-');

    // Determine streams JSON
    string streams;
    if (!string.IsNullOrEmpty(dto.RtspUrl))
    {
        // Legacy path: RTSP URL provided directly
        streams = BuildStreams(dto.RtspUrl, null, null);
    }
    else
    {
        // ONVIF path: RTSP URL not yet known — Pi will discover it
        string? centralHls = null;
        if (dto.ClientId.HasValue)
        {
            var client = await _db.Clients.FindAsync(dto.ClientId.Value);
            if (client?.GatewayId != null)
                centralHls = $"http://central-mediamtx:8888/{client.GatewayId}/{cameraKey}/index.m3u8";
        }
        streams = BuildStreams("pending_onvif_discovery", centralHls, null);
    }

    // Build metadata with ONVIF credentials and initial discovery status
    var metadata = BuildCameraMetadata(dto.OnvifPort, dto.OnvifUser, dto.OnvifPass, "pending");

    var camera = new Camera
    {
        Name            = dto.Name,
        Location        = dto.Location,
        Ptz             = dto.Ptz,
        IsRecordingOnly = dto.IsRecordingOnly,
        CameraId        = dto.CameraId,
        CameraKey       = cameraKey,
        ClientId        = dto.ClientId,
        UserId          = userId,
        Streams         = streams,
        Metadata        = metadata,
        Status          = "active",
        CreatedAt       = DateTime.UtcNow,
        UpdatedAt       = DateTime.UtcNow
    };

    _db.Cameras.Add(camera);
    await _db.SaveChangesAsync();

    return CreatedAtAction(nameof(GetById), new { id = camera.Id }, new
    {
        camera.Id, camera.Name, camera.Location, camera.Status,
        camera.CameraKey, camera.Ptz, camera.IsRecordingOnly,
        camera.ClientId, camera.Streams, camera.Metadata, camera.CreatedAt,
        RtspUrl = ExtractRtspUrl(camera.Streams)
    });
}
```

- [ ] **Step 3: Add `BuildStreams` overload and `BuildCameraMetadata` helpers**

```csharp
private static string BuildStreams(string rtsp, string? centralHls, string? centralRtsp)
{
    var obj = new System.Collections.Generic.Dictionary<string, string?> { ["rtsp"] = rtsp };
    if (!string.IsNullOrEmpty(centralHls))    obj["centralHls"]  = centralHls;
    if (!string.IsNullOrEmpty(centralRtsp))   obj["centralRtsp"] = centralRtsp;
    return JsonSerializer.Serialize(obj);
}

// Keep old overload for backward compat
private static string BuildStreams(string rtspUrl)
    => BuildStreams(rtspUrl, null, null);

private static string BuildCameraMetadata(int? onvifPort, string? onvifUser, string? onvifPass, string discoveryStatus)
{
    return JsonSerializer.Serialize(new
    {
        onvif = new { port = onvifPort ?? 8000, user = onvifUser, pass = onvifPass },
        discovery = new { status = discoveryStatus }
    });
}
```

- [ ] **Step 4: Test camera creation with ONVIF fields**

```bash
# Test via curl (run from server or local with backend running)
curl -s -X POST http://localhost:8080/api/cameras \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"name":"Cuarto","cameraId":"cuarto","clientId":1,"onvifPort":8000,"onvifUser":"admin","onvifPass":"admin123"}' \
  | jq '{id, cameraKey: .cameraKey, streams: .Streams, metadata: .Metadata}'
```

Expected: `cameraKey="cuarto"`, `Streams` has `centralHls` and `rtsp="pending_onvif_discovery"`, `Metadata` has `onvif` and `discovery.status="pending"`.

- [ ] **Step 5: Commit**

```bash
git add backend/Controllers/Monitoring/CameraController.cs
git commit -m "feat(camera): accept ONVIF credentials, auto-set centralHls and discovery status

Camera creation now works with ONVIF credentials instead of requiring
a full RTSP URL. centralHls is computed immediately from gatewayId+cameraKey.
Legacy rtspUrl path still works for existing integrations."
```

---

### Task 6: Create `EdgeCameraController` — endpoints for the Pi

**Files:**
- Create: `backend/Controllers/Edge/EdgeCameraController.cs`

- [ ] **Step 1: Create the controller**

```csharp
// backend/Controllers/Edge/EdgeCameraController.cs
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
                    ip = ExtractIpFromStreams(c.Streams),
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
                status      = dto.Status, // "discovered" or "onvif_failed"
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

        private static string? ExtractIpFromStreams(string? streams)
        {
            if (string.IsNullOrEmpty(streams)) return null;
            try
            {
                var doc = JsonDocument.Parse(streams);
                if (!doc.RootElement.TryGetProperty("rtsp", out var el)) return null;
                var rtsp = el.GetString();
                if (string.IsNullOrEmpty(rtsp)) return null;
                // Extract host from rtsp://user:pass@host:port/path
                var uri = new Uri(rtsp);
                return uri.Host;
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
```

- [ ] **Step 2: Verify middleware applies to EdgeCameraController**

The middleware checks `path.StartsWithSegments("/api/edge")`. Since the route is `api/edge/{gatewayId}`, it will be protected. Confirm no JWT `[Authorize]` attribute is needed (the middleware handles auth).

- [ ] **Step 3: Commit**

```bash
git add backend/Controllers/Edge/EdgeCameraController.cs
git commit -m "feat(edge): add EdgeCameraController for Pi-to-server communication

GET /api/edge/{id}/cameras — returns cameras with ONVIF credentials
POST /api/edge/{id}/cameras/{cameraId}/streams — Pi reports discovered streams
POST /api/edge/{id}/heartbeat — updates gateway online timestamp"
```

---

### Task 7: Add discovery trigger and status endpoints to `WizardController`

**Files:**
- Modify: `backend/Controllers/Monitoring/WizardController.cs`
- Modify: `backend/Services/Infrastructure/IMqttPublisherService.cs` (inject in WizardController)

- [ ] **Step 1: Add `IMqttPublisherService` injection to `WizardController`**

```csharp
// Update constructor:
private readonly IMqttPublisherService _mqtt;

public WizardController(ApplicationDbContext db, IConfiguration config, IMqttPublisherService mqtt)
{
    _db    = db;
    _config = config;
    _mqtt  = mqtt;
}
```

- [ ] **Step 2: Add `TriggerDiscovery` endpoint**

```csharp
// POST /api/admin/clients/{id}/trigger-discovery
[HttpPost("{id:int}/trigger-discovery")]
public async Task<IActionResult> TriggerDiscovery(int id, [FromQuery] int? cameraId = null)
{
    var client = await _db.Clients.FindAsync(id);
    if (client == null) return NotFound();
    if (string.IsNullOrEmpty(client.GatewayId))
        return BadRequest(new { message = "Client has no gateway configured." });

    // Load cameras to discover (all, or specific one)
    var query = _db.Cameras.Where(c => c.ClientId == id);
    if (cameraId.HasValue) query = query.Where(c => c.Id == cameraId.Value);
    var cameras = await query.ToListAsync();

    if (!cameras.Any())
        return BadRequest(new { message = "No cameras found for this client." });

    // Mark all as "discovering" so UI doesn't show stale "pending"
    foreach (var cam in cameras)
    {
        var meta = ParseMetaDict(cam.Metadata);
        if (meta.TryGetValue("discovery", out var disc) && disc != null)
        {
            var discJson = JsonSerializer.Serialize(disc);
            var discDoc  = JsonDocument.Parse(discJson).RootElement;
            var status   = discDoc.TryGetProperty("status", out var s) ? s.GetString() : "pending";
            // Only set discovering if not already discovered
            if (status != "discovered")
            {
                meta["discovery"] = new { status = "discovering" };
                cam.Metadata  = JsonSerializer.Serialize(meta);
                cam.UpdatedAt = DateTime.UtcNow;
            }
        }
        else
        {
            meta["discovery"] = new { status = "discovering" };
            cam.Metadata  = JsonSerializer.Serialize(meta);
            cam.UpdatedAt = DateTime.UtcNow;
        }
    }
    await _db.SaveChangesAsync();

    // Build MQTT payload for Pi
    var requestId = Guid.NewGuid().ToString("N");
    var payload = JsonSerializer.Serialize(new
    {
        requestId,
        cameras = cameras.Select(c =>
        {
            var onvif = ExtractOnvifFromMeta(c.Metadata);
            return new
            {
                id        = c.Id,
                ip        = ExtractIpFromStreams(c.Streams),
                onvifPort = onvif?.port ?? 8000,
                user      = onvif?.user,
                pass      = onvif?.pass
            };
        })
    });

    var topic = $"gateway/{client.GatewayId}/cmd/discover-onvif";
    await _mqtt.PublishAsync(topic, payload);

    return Ok(new { requestId, cameraCount = cameras.Count, gatewayId = client.GatewayId });
}
```

- [ ] **Step 3: Add `DiscoveryStatus` endpoint**

```csharp
// GET /api/admin/clients/{id}/discovery-status
[HttpGet("{id:int}/discovery-status")]
public async Task<IActionResult> DiscoveryStatus(int id)
{
    var client = await _db.Clients.FindAsync(id);
    if (client == null) return NotFound();

    // Check gateway online: lastHeartbeatAt within 60 seconds
    var lastHb = ExtractLastHeartbeat(client.Metadata);
    var gatewayOnline = lastHb.HasValue &&
                        (DateTime.UtcNow - lastHb.Value).TotalSeconds < 60;

    var cameras = await _db.Cameras
        .Where(c => c.ClientId == id)
        .OrderBy(c => c.Name)
        .ToListAsync();

    var cameraStatuses = cameras.Select(c =>
    {
        var disc = ExtractDiscovery(c.Metadata);
        return new
        {
            c.Id,
            c.Name,
            c.CameraKey,
            status     = disc?.status ?? "pending",
            brand      = disc?.brand,
            model      = disc?.model,
            resolution = disc?.resolution,
            fps        = disc?.fps
        };
    });

    return Ok(new { gatewayOnline, cameras = cameraStatuses });
}
```

- [ ] **Step 4: Add private helpers to WizardController**

```csharp
private static Dictionary<string, object?> ParseMetaDict(string? json)
{
    if (string.IsNullOrEmpty(json)) return new();
    try { return JsonSerializer.Deserialize<Dictionary<string, object?>>(json) ?? new(); }
    catch { return new(); }
}

private static (int port, string? user, string? pass)? ExtractOnvifFromMeta(string? metadata)
{
    if (string.IsNullOrEmpty(metadata)) return null;
    try
    {
        var doc = JsonDocument.Parse(metadata);
        if (!doc.RootElement.TryGetProperty("onvif", out var o)) return null;
        return (o.TryGetProperty("port", out var p) ? p.GetInt32() : 8000,
                o.TryGetProperty("user", out var u) ? u.GetString() : null,
                o.TryGetProperty("pass", out var pw) ? pw.GetString() : null);
    }
    catch { return null; }
}

private static string? ExtractIpFromStreams(string? streams)
{
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

private static DateTime? ExtractLastHeartbeat(string? metadata)
{
    if (string.IsNullOrEmpty(metadata)) return null;
    try
    {
        var doc = JsonDocument.Parse(metadata);
        if (!doc.RootElement.TryGetProperty("lastHeartbeatAt", out var el)) return null;
        return DateTime.TryParse(el.GetString(), out var dt) ? dt : null;
    }
    catch { return null; }
}

private static (string? status, string? brand, string? model, string? resolution, int? fps)?
    ExtractDiscovery(string? metadata)
{
    if (string.IsNullOrEmpty(metadata)) return null;
    try
    {
        var doc = JsonDocument.Parse(metadata);
        if (!doc.RootElement.TryGetProperty("discovery", out var d)) return null;
        return (
            d.TryGetProperty("status",     out var s)  ? s.GetString()  : null,
            d.TryGetProperty("brand",      out var b)  ? b.GetString()  : null,
            d.TryGetProperty("model",      out var m)  ? m.GetString()  : null,
            d.TryGetProperty("resolution", out var r)  ? r.GetString()  : null,
            d.TryGetProperty("fps",        out var f)  ? f.GetInt32()   : null
        );
    }
    catch { return null; }
}
```

- [ ] **Step 5: Commit**

```bash
git add backend/Controllers/Monitoring/WizardController.cs
git commit -m "feat(wizard): add trigger-discovery and discovery-status endpoints

POST /api/admin/clients/{id}/trigger-discovery — sets cameras to discovering
  and publishes gateway/{id}/cmd/discover-onvif via MQTT
GET /api/admin/clients/{id}/discovery-status — polls per-camera discovery state"
```

---

## Chunk 3: Edge-agent ONVIF

### Task 8: Install `onvif` package and create `OnvifDiscoveryService.js`

**Files:**
- Modify: `C:\dev\motorcontrol-edge-template\edge-agent\package.json`
- Create: `C:\dev\motorcontrol-edge-template\edge-agent\services\OnvifDiscoveryService.js`

- [ ] **Step 1: Install the `onvif` npm package**

```bash
cd C:/dev/motorcontrol-edge-template/edge-agent
npm install onvif
```

Expected: `onvif` appears in `package.json` dependencies.

- [ ] **Step 2: Create `OnvifDiscoveryService.js`**

```javascript
// edge-agent/services/OnvifDiscoveryService.js
'use strict';

const { Cam } = require('onvif');

// Ports to try when ONVIF port is unknown or fails
const FALLBACK_PORTS = [80, 8000, 8080, 2020];

class OnvifDiscoveryService {
  /**
   * Discover a single camera via ONVIF.
   * @param {string} ip
   * @param {number} port  - configured ONVIF port (tried first)
   * @param {string} user
   * @param {string} pass
   * @returns {Promise<object>} discovery result
   */
  async scan(ip, port, user, pass) {
    const portsToTry = [port, ...FALLBACK_PORTS.filter(p => p !== port)];

    for (const tryPort of portsToTry) {
      try {
        const result = await this._tryPort(ip, tryPort, user, pass);
        console.log(`[ONVIF] ✅ ${ip}:${tryPort} — ${result.brand} ${result.model}`);
        return result;
      } catch (err) {
        console.log(`[ONVIF] ⚠️  ${ip}:${tryPort} failed: ${err.message}`);
      }
    }

    console.log(`[ONVIF] ❌ ${ip} — all ports failed: ${portsToTry.join(', ')}`);
    return { status: 'onvif_failed', ip, triedPorts: portsToTry };
  }

  /**
   * Discover all cameras in a list.
   * @param {Array<{id, ip, onvifPort, onvifUser, onvifPass}>} cameras
   * @returns {Promise<Array>}
   */
  async discoverAll(cameras) {
    const results = [];
    for (const cam of cameras) {
      const result = await this.scan(
        cam.ip || cam.onvifIp,
        cam.onvifPort || 8000,
        cam.onvifUser || 'admin',
        cam.onvifPass || ''
      );
      results.push({ cameraId: cam.id, ...result });
    }
    return results;
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  _tryPort(ip, port, user, pass) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Connection timeout on ${ip}:${port}`));
      }, 8000);

      const cam = new Cam({ hostname: ip, port, username: user, password: pass }, async (err) => {
        clearTimeout(timeout);
        if (err) return reject(err);

        try {
          const info    = await this._getDeviceInfo(cam);
          const profiles = await this._getProfiles(cam);

          // Get stream URI for each profile
          const profilesWithUri = [];
          for (const profile of profiles) {
            try {
              const uri = await this._getStreamUri(cam, profile.token);
              profilesWithUri.push({
                token:      profile.token,
                name:       profile.name,
                rtspUrl:    uri,
                resolution: profile.videoEncoderConfiguration
                  ? `${profile.videoEncoderConfiguration.resolution?.width}x${profile.videoEncoderConfiguration.resolution?.height}`
                  : null,
                fps:        profile.videoEncoderConfiguration?.rateControl?.frameRateLimit ?? null,
                codec:      profile.videoEncoderConfiguration?.encoding ?? 'H264',
              });
            } catch (e) {
              console.warn(`[ONVIF] Could not get stream URI for profile ${profile.token}:`, e.message);
            }
          }

          if (profilesWithUri.length === 0) {
            return reject(new Error('No stream URIs found in any profile'));
          }

          // Determine main stream (highest resolution) and sub stream (lowest)
          const sorted    = [...profilesWithUri].sort((a, b) => this._pixels(b) - this._pixels(a));
          const mainStream = sorted[0]?.rtspUrl ?? null;
          const subStream  = sorted.length > 1 ? sorted[sorted.length - 1]?.rtspUrl : null;
          const mainProfile = sorted[0];

          resolve({
            status:     'discovered',
            brand:      info.manufacturer ?? 'Unknown',
            model:      info.model ?? 'Unknown',
            firmware:   info.firmwareVersion ?? null,
            resolution: mainProfile?.resolution ?? null,
            fps:        mainProfile?.fps ?? null,
            profiles:   profilesWithUri,
            mainStream,
            subStream,
          });
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  _getDeviceInfo(cam) {
    return new Promise((resolve, reject) => {
      cam.getDeviceInformation((err, info) => err ? reject(err) : resolve(info));
    });
  }

  _getProfiles(cam) {
    return new Promise((resolve, reject) => {
      cam.getProfiles((err, profiles) => err ? reject(err) : resolve(profiles || []));
    });
  }

  _getStreamUri(cam, profileToken) {
    return new Promise((resolve, reject) => {
      cam.getStreamUri(
        { protocol: 'RTSP', profileToken },
        (err, stream) => {
          if (err) return reject(err);
          resolve(stream?.uri ?? null);
        }
      );
    });
  }

  _pixels(profile) {
    if (!profile?.resolution) return 0;
    const [w, h] = profile.resolution.split('x').map(Number);
    return (w || 0) * (h || 0);
  }
}

module.exports = new OnvifDiscoveryService();
```

- [ ] **Step 3: Test the service manually against the Steren camera**

```bash
cd C:/dev/motorcontrol-edge-template/edge-agent
node -e "require('./services/OnvifDiscoveryService').scan('192.168.100.45', 8000, 'admin', 'admin123').then(r => console.log(JSON.stringify(r, null, 2)))"
```

Expected output:
```json
{
  "status": "discovered",
  "brand": "...",
  "model": "...",
  "mainStream": "rtsp://192.168.100.45:5543/...",
  "subStream": null,
  "profiles": [...]
}
```

- [ ] **Step 4: Commit**

```bash
cd C:/dev/motorcontrol-edge-template
git add edge-agent/package.json edge-agent/package-lock.json edge-agent/services/OnvifDiscoveryService.js
git commit -m "feat(onvif): add OnvifDiscoveryService with multi-port fallback

Supports Hikvision, Dahua, Axis, Steren/Happytimesoft, Reolink and any
ONVIF-compatible camera. Tries configured port then [80,8000,8080,2020]."
```

---

### Task 9: Edge-agent startup — auto-discover cameras and configure MediaMTX

On startup, fetch cameras from central API, run ONVIF, add paths to local MediaMTX, report back.

**Files:**
- Modify: `C:\dev\motorcontrol-edge-template\edge-agent\server.js`
- Modify: `C:\dev\motorcontrol-edge-template\edge-agent\services\MediamtxManagerService.js`

- [ ] **Step 1: Update `MediamtxManagerService.addPath` to support `sourceProtocol: tcp`**

In `MediamtxManagerService.js`, update the `addPath` call body:

```javascript
// In addPath(), change the POST body to:
await axios.post(url, {
  source: rtspSource,
  sourceOnDemand: false,
  sourceProtocol: 'tcp',   // ← add this
  record: false,
}, { ... });
```

Also add an overload that handles permanent paths (no auto-remove TTL):
```javascript
async addPermanentPath(pathName, rtspSource) {
  const url = `${MEDIAMTX_API_URL}/v3/config/paths/add/${pathName}`;
  try {
    await axios.post(url, {
      source: rtspSource,
      sourceOnDemand: false,
      sourceProtocol: 'tcp',
      record: true,   // permanent paths should record
    }, {
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      timeout: 5000,
    });
    console.log(`[MediamtxMgr] ✅ Permanent path added: ${pathName}`);
  } catch (err) {
    // 409 = path already exists — that's fine
    if (err.response?.status === 409) {
      console.log(`[MediamtxMgr] ℹ️  Path already exists: ${pathName}`);
      return;
    }
    const msg = err.response ? JSON.stringify(err.response.data) : err.message;
    throw new Error(`Failed to add mediamtx path "${pathName}": ${msg}`);
  }
}
```

- [ ] **Step 2: Create `startupDiscovery` function in `server.js`**

Add to `server.js` after the services instantiation block (before `init()`):

```javascript
const onvifDiscovery = require('./services/OnvifDiscoveryService');
const axios = require('axios');

const CENTRAL_API_URL   = process.env.CENTRAL_API_URL || 'http://177.247.175.4/api';
const CENTRAL_API_TOKEN = process.env.CENTRAL_API_TOKEN || '';

async function runStartupDiscovery() {
  if (!CENTRAL_API_TOKEN) {
    console.log('[Discovery] No CENTRAL_API_TOKEN — skipping ONVIF startup discovery');
    return;
  }

  console.log('[Discovery] 🔍 Starting ONVIF camera discovery...');

  let cameras;
  try {
    const res = await axios.get(
      `${CENTRAL_API_URL}/edge/${CLIENT_ID}/cameras`,
      { headers: { 'X-Edge-Token': CENTRAL_API_TOKEN }, timeout: 10000 }
    );
    cameras = res.data;
    console.log(`[Discovery] Found ${cameras.length} camera(s) to discover`);
  } catch (err) {
    console.warn('[Discovery] Could not fetch cameras from central API:', err.message);
    return;
  }

  for (const cam of cameras) {
    if (!cam.ip) {
      console.log(`[Discovery] ⚠️  Camera ${cam.name} has no IP — skipping`);
      continue;
    }

    console.log(`[Discovery] Scanning ${cam.name} at ${cam.ip}:${cam.onvifPort}...`);
    const result = await onvifDiscovery.scan(cam.ip, cam.onvifPort, cam.onvifUser, cam.onvifPass);

    if (result.status === 'discovered' && result.mainStream) {
      // Add main stream path to MediaMTX
      try {
        await mediamtxManager.addPermanentPath(cam.cameraKey, result.mainStream);
        console.log(`[Discovery] ✅ ${cam.name}: path ${cam.cameraKey} added to MediaMTX`);
      } catch (err) {
        console.warn(`[Discovery] Failed to add MediaMTX path for ${cam.name}:`, err.message);
      }

      // Add sub-stream path if available
      if (result.subStream && cam.cameraKey) {
        const lowKey = `${cam.cameraKey}-low`;
        try {
          await mediamtxManager.addPermanentPath(lowKey, result.subStream);
          console.log(`[Discovery] ✅ ${cam.name}-low: path ${lowKey} added to MediaMTX`);
        } catch (err) {
          console.warn(`[Discovery] Failed to add sub-stream path:`, err.message);
        }
      }
    }

    // Report result to central API
    try {
      await axios.post(
        `${CENTRAL_API_URL}/edge/${CLIENT_ID}/cameras/${cam.id}/streams`,
        {
          rtsp:       result.mainStream ?? null,
          status:     result.status,
          brand:      result.brand    ?? null,
          model:      result.model    ?? null,
          resolution: result.resolution ?? null,
          fps:        result.fps      ?? null,
        },
        { headers: { 'X-Edge-Token': CENTRAL_API_TOKEN }, timeout: 10000 }
      );
      console.log(`[Discovery] 📡 Reported ${cam.name} (${result.status}) to central`);
    } catch (err) {
      console.warn(`[Discovery] Failed to report ${cam.name} to central:`, err.message);
    }
  }

  console.log('[Discovery] ✅ Startup discovery complete');
}
```

- [ ] **Step 3: Call `runStartupDiscovery` in `init()` before camera monitoring**

In the `init()` function, add after MQTT connects:

```javascript
// After: await new Promise(resolve => setTimeout(resolve, 2000));
// Before: cameraMonitor.startMonitoring();

// Run ONVIF startup discovery (non-blocking — failures don't crash gateway)
runStartupDiscovery().catch(err =>
  console.warn('[Discovery] Startup discovery error:', err.message)
);
```

- [ ] **Step 4: Send heartbeat to central REST API (for gateway online tracking)**

In `sendHeartbeat()`, add a REST call after the MQTT publish:

```javascript
async function sendHeartbeat() {
  // ... existing MQTT heartbeat code ...

  // Also notify central REST API so wizard can detect gateway online
  if (CENTRAL_API_TOKEN) {
    axios.post(
      `${CENTRAL_API_URL}/edge/${CLIENT_ID}/heartbeat`,
      {},
      { headers: { 'X-Edge-Token': CENTRAL_API_TOKEN }, timeout: 5000 }
    ).catch(() => {}); // Fire and forget — MQTT is the primary channel
  }
}
```

- [ ] **Step 5: Test the startup discovery end-to-end**

```bash
# On the Pi:
cd ~/edge-gateway
docker compose down && docker compose up -d
docker logs edge-agent -f
```

Expected log sequence:
```
🚀 Edge Gateway Starting...
[Discovery] 🔍 Starting ONVIF camera discovery...
[Discovery] Found 2 camera(s) to discover
[Discovery] Scanning Cuarto at 192.168.100.45:8000...
[ONVIF] ✅ 192.168.100.45:8000 — Steren CCTV-238
[MediamtxMgr] ✅ Permanent path added: cuarto
[Discovery] 📡 Reported Cuarto (discovered) to central
✅ Edge Gateway running on port 8090
```

- [ ] **Step 6: Commit**

```bash
cd C:/dev/motorcontrol-edge-template
git add edge-agent/server.js edge-agent/services/MediamtxManagerService.js
git commit -m "feat(discovery): run ONVIF auto-discovery on gateway startup

On docker compose up, edge-agent fetches cameras from central API,
discovers RTSP URLs via ONVIF, adds paths to local MediaMTX, and
reports results back. Falls back gracefully if ONVIF unavailable."
```

---

### Task 10: Edge-agent MQTT command handler for on-demand discovery

**Files:**
- Modify: `C:\dev\motorcontrol-edge-template\edge-agent\server.js`

- [ ] **Step 1: Add MQTT handler for `gateway/{CLIENT_ID}/cmd/discover-onvif`**

In `server.js`, after the existing MQTT handlers, add:

```javascript
// ── ONVIF discovery command (from wizard or admin) ──────────────────────────
mqttService.onMessage(`gateway/${CLIENT_ID}/cmd/discover-onvif`, async (topic, message) => {
  const { requestId, cameras: camerasToDiscover } = message;
  console.log(`[Discovery] 📡 MQTT discover-onvif command received (${camerasToDiscover?.length} cameras)`);

  if (!camerasToDiscover?.length) return;

  for (const cam of camerasToDiscover) {
    if (!cam.ip) continue;

    console.log(`[Discovery] Scanning camera ${cam.id} at ${cam.ip}:${cam.onvifPort}...`);
    const result = await onvifDiscovery.scan(cam.ip, cam.onvifPort, cam.user, cam.pass);

    if (result.status === 'discovered' && result.mainStream) {
      // Update or add path in MediaMTX
      const cameraKey = cam.cameraKey || `camera-${cam.id}`;
      try {
        await mediamtxManager.addPermanentPath(cameraKey, result.mainStream);
        if (result.subStream) {
          await mediamtxManager.addPermanentPath(`${cameraKey}-low`, result.subStream);
        }
      } catch (err) {
        console.warn(`[Discovery] MediaMTX path update failed for camera ${cam.id}:`, err.message);
      }
    }

    // Report result to central REST API
    if (CENTRAL_API_TOKEN) {
      try {
        await axios.post(
          `${CENTRAL_API_URL}/edge/${CLIENT_ID}/cameras/${cam.id}/streams`,
          {
            rtsp:       result.mainStream ?? null,
            status:     result.status,
            brand:      result.brand    ?? null,
            model:      result.model    ?? null,
            resolution: result.resolution ?? null,
            fps:        result.fps      ?? null,
          },
          { headers: { 'X-Edge-Token': CENTRAL_API_TOKEN }, timeout: 10000 }
        );
      } catch (err) {
        console.warn(`[Discovery] Failed to report camera ${cam.id}:`, err.message);
      }
    }
  }

  console.log(`[Discovery] ✅ MQTT discovery complete (requestId: ${requestId})`);
});
```

- [ ] **Step 2: Commit**

```bash
cd C:/dev/motorcontrol-edge-template
git add edge-agent/server.js
git commit -m "feat(discovery): add MQTT handler for on-demand gateway/cmd/discover-onvif

Enables wizard and admin UI to trigger ONVIF re-scan without restarting
the gateway. Used for password changes and adding new cameras post-deploy."
```

---

## Chunk 4: Wizard UI

### Task 11: Update Step 2 — ONVIF form fields

Replace RTSP fields with ONVIF credential fields.

**Files:**
- Modify: `frontend/src/app/components/wizard/wizard.component.ts`
- Modify: `frontend/src/app/components/wizard/wizard.component.html`

- [ ] **Step 1: Update camera state initial value in `wizard.component.ts`**

```typescript
// Before (line 55):
cameras = signal<any[]>([{ id: 'cam1', ip: '', user: 'admin', password: '', rtspPath: '/Streaming/Channels/101' }]);

// After:
cameras = signal<any[]>([{ id: 'cam1', ip: '', onvifPort: 8000, onvifUser: 'admin', onvifPass: '' }]);
```

- [ ] **Step 2: Update `addCamera()` default object**

```typescript
// Before (line 186):
addCamera() {
  this.cameras.update(c => [...c, { id: 'cam' + (c.length + 1), ip: '', user: 'admin', password: '', rtspPath: '/Streaming/Channels/101' }]);
}

// After:
addCamera() {
  this.cameras.update(c => [...c, { id: 'cam' + (c.length + 1), ip: '', onvifPort: 8000, onvifUser: 'admin', onvifPass: '' }]);
}
```

- [ ] **Step 3: Update `validateStep2()`**

```typescript
// Replace entire validateStep2() (lines 193-205):
validateStep2(): boolean {
  if (this.cameras().length === 0) {
    this.showAlert(2, 'error', 'Agrega al menos una cámara');
    return false;
  }
  for (const cam of this.cameras()) {
    if (!cam.id?.trim() || !cam.ip?.trim() || !cam.onvifUser?.trim()) {
      this.showAlert(2, 'error', 'Completa el nombre, IP y usuario ONVIF de todas las cámaras');
      return false;
    }
    // Default port to 8000 if blank
    if (!cam.onvifPort) cam.onvifPort = 8000;
  }
  return true;
}
```

- [ ] **Step 4: Update `createCamerasInApi()` to send ONVIF fields**

```typescript
// Replace the rtspUrl and fetch body inside createCamerasInApi():
async createCamerasInApi() {
  const token = localStorage.getItem('motor_control_token');
  for (const cam of this.cameras()) {
    try {
      // Live camera
      const liveRes = await fetch(`${this.API_URL}/cameras`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({
          name: cam.id,
          cameraId: cam.id,
          location: this.clientData.location,
          onvifPort: cam.onvifPort || 8000,
          onvifUser: cam.onvifUser,
          onvifPass: cam.onvifPass,
          ptz: false,
          isRecordingOnly: false,
          clientId: this.clientId()
        })
      });
      if (!liveRes.ok) console.warn('Error creating live camera:', cam.id);
    } catch (e) {
      console.warn('Error creating live camera:', cam.id, e);
    }

    // Recording-only camera (cloud storage)
    if (this.clientData.cloudStorageActive) {
      try {
        await fetch(`${this.API_URL}/cameras`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({
            name: `${cam.id}-low`,
            cameraId: `${cam.id}-low`,
            location: this.clientData.location,
            onvifPort: cam.onvifPort || 8000,
            onvifUser: cam.onvifUser,
            onvifPass: cam.onvifPass,
            ptz: false,
            isRecordingOnly: true,
            clientId: this.clientId()
          })
        });
      } catch (e) {
        console.warn('Error creating recording camera:', cam.id, e);
      }
    }
  }
}
```

- [ ] **Step 5: Update Step 2 HTML form**

In `wizard.component.html`, find the Step 2 camera form and replace the three old fields (`user`, `password`, `rtspPath`) with:

```html
<!-- ONVIF Port -->
<div class="form-group">
  <label>Puerto ONVIF</label>
  <input type="number" [(ngModel)]="cam.onvifPort" placeholder="8000"
         class="form-input" style="width:100px">
  <span class="field-hint">Común: 80, 8000, 8080, 2020</span>
</div>

<!-- ONVIF User -->
<div class="form-group">
  <label>Usuario ONVIF <span class="required">*</span></label>
  <input type="text" [(ngModel)]="cam.onvifUser" placeholder="admin"
         class="form-input" autocomplete="off">
</div>

<!-- ONVIF Password -->
<div class="form-group">
  <label>Contraseña ONVIF</label>
  <input type="password" [(ngModel)]="cam.onvifPass" placeholder="••••••••"
         class="form-input" autocomplete="new-password">
</div>

<p class="field-hint" style="margin-top:0.5rem; color: var(--muted)">
  ℹ️ El Pi descubrirá el stream RTSP automáticamente al desplegarse.
</p>
```

- [ ] **Step 6: Commit**

```bash
cd C:/dev/MotorControlEnterprise
git add frontend/src/app/components/wizard/
git commit -m "feat(wizard): replace RTSP fields with ONVIF credentials in Step 2

Installer now enters ONVIF port/user/pass instead of manual RTSP paths.
Pi auto-discovers the RTSP URL on first startup via ONVIF."
```

---

### Task 12: Add Step 4 live discovery status panel

**Files:**
- Modify: `frontend/src/app/components/wizard/wizard.component.ts`
- Modify: `frontend/src/app/components/wizard/wizard.component.html`

- [ ] **Step 1: Add discovery state signals and methods to component**

```typescript
// Add to wizard.component.ts class:

// Discovery state
discoveryStatus = signal<any>(null);
private discoveryPollInterval: any = null;
private discoveryStartTime = 0;
private readonly DISCOVERY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// Called when entering Step 4
startDiscoveryPolling() {
  this.discoveryStartTime = Date.now();
  this.pollDiscoveryOnce(); // immediate first call
  this.discoveryPollInterval = setInterval(() => {
    const elapsed = Date.now() - this.discoveryStartTime;
    if (elapsed > this.DISCOVERY_TIMEOUT_MS) {
      this.stopDiscoveryPolling();
      this.showAlert(4, 'error', 'Tiempo de espera agotado. Verifica que el Pi esté encendido y conectado.');
      return;
    }
    this.pollDiscoveryOnce();
  }, 3000);
}

stopDiscoveryPolling() {
  if (this.discoveryPollInterval) {
    clearInterval(this.discoveryPollInterval);
    this.discoveryPollInterval = null;
  }
}

private async pollDiscoveryOnce() {
  if (!this.clientId()) return;
  try {
    const res = await fetch(
      `${this.API_URL}/admin/clients/${this.clientId()}/discovery-status`,
      { headers: { 'Authorization': 'Bearer ' + localStorage.getItem('motor_control_token') } }
    );
    if (!res.ok) return;
    const data = await res.json();
    this.discoveryStatus.set(data);

    // Stop polling when all cameras reach terminal state
    const allTerminal = data.cameras?.every((c: any) =>
      ['discovered', 'onvif_failed', 'manual'].includes(c.status)
    );
    if (allTerminal && data.cameras?.length > 0) {
      this.stopDiscoveryPolling();
    }
  } catch { /* ignore polling errors */ }
}

get canContinueFromStep4(): boolean {
  const status = this.discoveryStatus();
  if (!status?.gatewayOnline) return false;
  return status?.cameras?.every((c: any) =>
    ['discovered', 'onvif_failed', 'manual'].includes(c.status)
  ) ?? false;
}

async retryDiscovery(cameraId?: number) {
  if (!this.clientId()) return;
  const url = cameraId
    ? `${this.API_URL}/admin/clients/${this.clientId()}/trigger-discovery?cameraId=${cameraId}`
    : `${this.API_URL}/admin/clients/${this.clientId()}/trigger-discovery`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + localStorage.getItem('motor_control_token') }
  });
  // Resume polling if stopped
  if (!this.discoveryPollInterval) {
    this.startDiscoveryPolling();
  }
}

async saveManualRtsp(cameraId: number, rtspUrl: string) {
  if (!rtspUrl.startsWith('rtsp://')) return;
  await fetch(`${this.API_URL}/cameras/${cameraId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + localStorage.getItem('motor_control_token')
    },
    body: JSON.stringify({ rtspUrl, status: 'manual' })
  });
  await this.pollDiscoveryOnce();
}

manualRtspInputs: { [key: number]: string } = {};
```

- [ ] **Step 2: Trigger polling when entering Step 4**

In `nextStep()`, after the Step 2 block, add:
```typescript
// When moving from Step 3 to Step 4, start polling
if (this.currentStep() === 3) {
  // Start polling as we enter step 4
  setTimeout(() => this.startDiscoveryPolling(), 500);
}
```

Also clean up on Step 4 exit — in `nextStep()` when leaving step 4:
```typescript
if (this.currentStep() === 4) {
  this.stopDiscoveryPolling();
}
```

- [ ] **Step 3: Add Step 4 discovery status HTML panel**

In `wizard.component.html`, find Step 4 and add below the deployment instructions:

```html
<!-- Discovery Status Panel (Step 4) -->
@if (currentStep() === 4) {
  <div class="discovery-panel">
    <h3>Estado del descubrimiento</h3>

    <!-- Gateway status -->
    <div class="gateway-status">
      @if (!discoveryStatus()?.gatewayOnline) {
        <span class="status-dot pending"></span>
        <span>Esperando conexión del gateway...</span>
      } @else {
        <span class="status-dot online"></span>
        <span>Gateway conectado</span>
      }
    </div>

    <!-- Per-camera status -->
    @if (discoveryStatus()?.cameras?.length > 0) {
      <div class="camera-list">
        @for (cam of discoveryStatus().cameras; track cam.id) {
          <div class="camera-item" [class.failed]="cam.status === 'onvif_failed'">
            <div class="camera-header">
              <span class="camera-icon">📷</span>
              <strong>{{ cam.name }}</strong>
              @switch (cam.status) {
                @case ('pending') {
                  <span class="badge pending">⬜ Pendiente</span>
                }
                @case ('discovering') {
                  <span class="badge discovering">🟡 Descubriendo...</span>
                }
                @case ('discovered') {
                  <span class="badge discovered">
                    ✅ {{ cam.brand }} {{ cam.model }}
                    @if (cam.resolution) { · {{ cam.resolution }} }
                    @if (cam.fps) { · {{ cam.fps }}fps }
                  </span>
                }
                @case ('manual') {
                  <span class="badge manual">✏️ URL manual</span>
                }
                @case ('onvif_failed') {
                  <span class="badge failed">⚠️ ONVIF no respondió</span>
                }
              }
            </div>

            <!-- ONVIF failure guide -->
            @if (cam.status === 'onvif_failed') {
              <div class="failure-guide">
                <div class="guide-option">
                  <strong>Opción 1 — Activar ONVIF en la cámara</strong>
                  <p>Busca en la app o interfaz web de la cámara:<br>
                    <em>Configuración → Red → ONVIF → Activar</em>
                  </p>
                  <button class="btn-secondary" (click)="retryDiscovery(cam.id)">
                    🔄 Reintentar descubrimiento
                  </button>
                </div>

                <div class="guide-option">
                  <strong>Opción 2 — URL RTSP manual</strong>
                  <table class="rtsp-cheatsheet">
                    <tr><td>Hikvision</td><td><code>/Streaming/Channels/101</code></td></tr>
                    <tr><td>Dahua</td><td><code>/cam/realmonitor?channel=1&subtype=0</code></td></tr>
                    <tr><td>Reolink</td><td><code>/h264Preview_01_main</code></td></tr>
                    <tr><td>TP-Link Tapo</td><td><code>/stream1</code></td></tr>
                    <tr><td>Axis</td><td><code>/axis-media/media.amp</code></td></tr>
                  </table>
                  <div class="manual-input-row">
                    <input type="text"
                           [(ngModel)]="manualRtspInputs[cam.id]"
                           placeholder="rtsp://admin:pass@192.168.1.100:554/..."
                           class="form-input manual-rtsp">
                    <button class="btn-primary"
                            (click)="saveManualRtsp(cam.id, manualRtspInputs[cam.id])">
                      Guardar
                    </button>
                  </div>
                </div>

                <div class="guide-option">
                  <strong>Opción 3 — Diagnóstico desde el Pi (avanzado)</strong>
                  <pre class="code-block">docker exec edge-agent node -e \
  "require('./services/OnvifDiscoveryService')
    .scan('{{ cam.ip || '192.168.x.x' }}', 8000, 'admin', 'CONTRASEÑA')
    .then(r => console.log(JSON.stringify(r, null, 2)))"</pre>
                </div>
              </div>
            }
          </div>
        }
      </div>
    }
  </div>

  <!-- Continue button — only enabled when all cameras terminal -->
  <button class="btn-primary" [disabled]="!canContinueFromStep4"
          (click)="nextStep()">
    Continuar →
  </button>
}
```

- [ ] **Step 4: Add minimal SCSS for discovery panel**

In `wizard.component.scss`, add:

```scss
.discovery-panel {
  background: var(--surface);
  border: 1px solid var(--outline);
  border-radius: 8px;
  padding: 1.5rem;
  margin-top: 1.5rem;

  h3 { margin: 0 0 1rem; }
}

.gateway-status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
  font-size: 0.9rem;
}

.status-dot {
  width: 10px; height: 10px;
  border-radius: 50%;
  &.pending { background: var(--muted); }
  &.online  { background: var(--green); }
}

.camera-item {
  padding: 0.75rem;
  border: 1px solid var(--outline);
  border-radius: 6px;
  margin-bottom: 0.75rem;

  &.failed { border-color: var(--red); }
}

.camera-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.badge {
  font-size: 0.8rem;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  &.discovered { color: var(--green); }
  &.discovering { color: var(--teal); }
  &.failed { color: var(--red); }
  &.manual { color: var(--accent); }
}

.failure-guide {
  margin-top: 1rem;
  border-top: 1px solid var(--outline);
  padding-top: 0.75rem;
}

.guide-option {
  margin-bottom: 1rem;
  strong { display: block; margin-bottom: 0.3rem; }
}

.rtsp-cheatsheet {
  font-size: 0.8rem;
  margin: 0.5rem 0;
  td { padding: 2px 8px 2px 0; }
  code { color: var(--teal); }
}

.manual-input-row {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.5rem;
  .manual-rtsp { flex: 1; }
}

.code-block {
  background: rgba(0,0,0,0.2);
  padding: 0.75rem;
  border-radius: 4px;
  font-size: 0.75rem;
  white-space: pre-wrap;
  word-break: break-all;
}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/components/wizard/
git commit -m "feat(wizard): add live ONVIF discovery panel in Step 4

Shows gateway online status and per-camera discovery state in real time.
Includes integrated failure guide with RTSP cheatsheet, retry button,
manual URL input, and copy-paste diagnostic command for each failed camera."
```

---

## Chunk 5: Post-Wizard Re-scan

### Task 13: Add "Re-escanear ONVIF" button to client camera cards

**Files:**
- Modify: `frontend/src/app/components/clients/` (client detail component — find the file that shows cameras per client)

- [ ] **Step 1: Find the client detail component**

```bash
ls C:/dev/MotorControlEnterprise/frontend/src/app/components/clients/
```

Look for a component that displays camera cards for a specific client.

- [ ] **Step 2: Add discovery badge to each camera card**

In the camera card template, add below the camera name:

```html
@if (cam.Metadata) {
  @let disc = parseDiscovery(cam.Metadata);
  <span class="discovery-badge" [class]="disc.status">
    @switch (disc.status) {
      @case ('discovered') { ✅ {{ disc.brand }} {{ disc.model }} · {{ disc.resolution }} }
      @case ('onvif_failed') { ⚠️ ONVIF fallido }
      @case ('manual') { ✏️ Manual }
      @default { ⏳ Pendiente }
    }
  </span>
}
```

- [ ] **Step 3: Add re-scan method and context menu**

In the component `.ts` file:

```typescript
async reScanOnvif(clientId: number, cameraId: number) {
  await fetch(`/api/admin/clients/${clientId}/trigger-discovery?cameraId=${cameraId}`, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + localStorage.getItem('motor_control_token') }
  });
  // Reload camera list after 3s to show updated status
  setTimeout(() => this.loadCameras(), 3000);
}

parseDiscovery(metadata: string): any {
  try {
    const m = JSON.parse(metadata);
    return m.discovery || { status: 'pending' };
  } catch { return { status: 'pending' }; }
}
```

Add a `[⋯]` dropdown or button per camera:
```html
<button class="btn-ghost btn-sm" (click)="reScanOnvif(client.id, cam.Id)">
  🔄 Re-escanear ONVIF
</button>
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/components/clients/
git commit -m "feat(clients): add ONVIF re-scan button and discovery badge to camera cards

Allows re-triggering ONVIF discovery from the client detail page.
Useful when ONVIF password changes, camera is replaced, or UUID regenerates."
```

---

## Final Verification

- [ ] **End-to-end test with new client:**
  1. Open wizard → create new client
  2. Step 2: enter camera with ONVIF credentials (no RTSP path)
  3. Step 3: download files — verify `.env` has `CENTRAL_API_TOKEN` and mediamtx.yml has `-rtsp_transport tcp` with no camera paths
  4. Deploy to Pi: `mv edge-gateway.env .env && docker compose up -d`
  5. Step 4: watch gateway turn 🟢 and camera turn ✅ with brand/model info
  6. Confirm stream plays in camera viewer

- [ ] **Test re-scan from client page:**
  1. Change ONVIF password on camera
  2. Go to `/admin/clients/{id}` → camera shows ⚠️ ONVIF fallido
  3. Click Re-escanear ONVIF
  4. After ~10s, badge updates to ✅ with new UUID resolved

- [ ] **Test ONVIF failure flow:**
  1. Enter wrong ONVIF port (e.g. 9999)
  2. Verify Step 4 shows ⚠️ and expands failure guide automatically
  3. Use manual RTSP URL fallback — stream should play

- [ ] **Verify existing gateway unaffected:**
  1. Check edge-gateway-raspberry streams still work
  2. Its mediamtx.yml was not touched — no changes needed
