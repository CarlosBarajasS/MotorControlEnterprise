using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MotorControlEnterprise.Api.Data;
using MotorControlEnterprise.Api.Models;
using MotorControlEnterprise.Api.Services;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace MotorControlEnterprise.Api.Controllers
{
    [ApiController]
    [Route("api/admin/clients")]
    [Authorize(Roles = "admin")]
    public class WizardController : ControllerBase
    {
        private readonly ApplicationDbContext _db;
        private readonly IConfiguration _config;
        private readonly IMqttPublisherService _mqtt;

        public WizardController(ApplicationDbContext db, IConfiguration config, IMqttPublisherService mqtt)
        {
            _db    = db;
            _config = config;
            _mqtt  = mqtt;
        }

        /// <summary>
        /// GET api/admin/clients/{id}/edge-config
        /// Genera los archivos de configuración (.env, docker-compose.yml, mediamtx.yml)
        /// para desplegar el edge gateway en el sitio del cliente.
        /// </summary>
        [HttpGet("{id:int}/edge-config")]
        public async Task<IActionResult> GetEdgeConfig(int id)
        {
            var client = await _db.Clients.FindAsync(id);
            if (client == null) return NotFound();

            // Asegurar que el cliente tenga un gatewayId
            var gatewayId = client.GatewayId;
            if (string.IsNullOrWhiteSpace(gatewayId))
            {
                gatewayId        = $"gateway-{client.Id}";
                client.GatewayId = gatewayId;
                client.UpdatedAt = DateTime.UtcNow;
                await _db.SaveChangesAsync();
            }

            // Generate edge token if not yet present
            var edgeToken = ExtractEdgeToken(client.Metadata);
            if (string.IsNullOrEmpty(edgeToken))
            {
                edgeToken = Guid.NewGuid().ToString("N"); // 32-char hex, no hyphens
                var meta = string.IsNullOrEmpty(client.Metadata)
                    ? new Dictionary<string, object>()
                    : (JsonSerializer.Deserialize<Dictionary<string, object>>(client.Metadata)
                       ?? new Dictionary<string, object>());
                meta["edgeToken"] = edgeToken;
                client.Metadata  = JsonSerializer.Serialize(meta);
                client.UpdatedAt = DateTime.UtcNow;
                await _db.SaveChangesAsync();
            }

            // Cámaras registradas para este cliente
            var cameras = await _db.Cameras
                .Where(c => c.ClientId == id)
                .OrderBy(c => c.Name)
                .ToListAsync();

            // IP/puerto PÚBLICOS del servidor central (para edge gateways remotos)
            var mqttHost    = _config["EdgeDefaults:MqttPublicHost"]    ?? "177.247.175.4";
            var mqttPort    = _config["EdgeDefaults:MqttPublicPort"]    ?? "1885";
            var mqttUser    = _config["EdgeDefaults:MqttEdgeUser"]      ?? "edge-client";
            var mqttPass    = _config["EdgeDefaults:MqttEdgePass"]      ?? "CHANGE_THIS";
            var centralRtsp = _config["EdgeDefaults:CentralRtspHost"]   ?? "177.247.175.4";
            var centralPort = _config["EdgeDefaults:CentralRtspPort"]   ?? "8556";
            var pushUser    = _config["EdgeDefaults:MediamtxPushUser"]  ?? "edge-relay";
            var pushPass    = _config["EdgeDefaults:MediamtxPushPass"]  ?? "relay-secret-changeme";
            var centralApi  = _config["EdgeDefaults:CentralApiUrl"]     ?? $"http://{mqttHost}/api";

            var location = string.Join(", ",
                new[] { client.City, client.State }.Where(s => !string.IsNullOrWhiteSpace(s)));
            if (string.IsNullOrEmpty(location)) location = "Sin ubicación";

            return Ok(new
            {
                gatewayId,
                mqttHost,
                mqttPort,
                mqttUser,
                centralRtspHost = centralRtsp,
                centralRtspPort = centralPort,
                env             = BuildEnv(client, gatewayId, mqttHost, mqttPort, mqttUser, mqttPass, centralApi, location, edgeToken),
                dockerCompose   = BuildDockerCompose(centralRtsp, centralPort, pushUser, pushPass),
                mediamtxYml     = BuildMediamtxYml(cameras, gatewayId),
                localStorageType = client.LocalStorageType ?? "nvr"
            });
        }

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

        private static string? ExtractRtspFromStreams(string? streams)
        {
            if (streams == null) return null;
            try
            {
                var doc = JsonDocument.Parse(streams);
                return doc.RootElement.TryGetProperty("rtsp", out var el) ? el.GetString() : null;
            }
            catch { return null; }
        }

        private static string BuildEnv(
            Client client,  string gatewayId,
            string mqttHost, string mqttPort,
            string mqttUser, string mqttPass,
            string centralApi, string location,
            string edgeToken)
        {
            var sb = new StringBuilder();
            sb.AppendLine("# ===================================================");
            sb.AppendLine("# CONFIGURACIÓN DEL EDGE GATEWAY — generada por MotorControl Enterprise");
            sb.AppendLine("# ===================================================");
            sb.AppendLine();
            sb.AppendLine($"CLIENT_ID={gatewayId}");
            sb.AppendLine($"GATEWAY_NAME={client.Name}");
            sb.AppendLine($"LOCATION={location}");
            sb.AppendLine("# IMPORTANTE: reemplaza con la IP pública o LAN accesible del gateway");
            sb.AppendLine("GATEWAY_PUBLIC_IP=TU_IP_AQUI");
            sb.AppendLine();
            sb.AppendLine("# ===================================================");
            sb.AppendLine("# SERVIDOR CENTRAL - MQTT");
            sb.AppendLine("# ===================================================");
            sb.AppendLine();
            sb.AppendLine($"MQTT_HOST={mqttHost}");
            sb.AppendLine($"MQTT_PORT={mqttPort}");
            sb.AppendLine($"MQTT_USERNAME={mqttUser}");
            sb.AppendLine($"MQTT_PASSWORD={mqttPass}");
            sb.AppendLine("HEARTBEAT_INTERVAL_MS=30000");
            sb.AppendLine();
            sb.AppendLine("# ===================================================");
            sb.AppendLine("# MEDIAMTX (interno a Docker — no cambiar)");
            sb.AppendLine("# ===================================================");
            sb.AppendLine();
            sb.AppendLine("MEDIAMTX_API_URL=http://mediamtx:9997");
            sb.AppendLine();
            sb.AppendLine("# ===================================================");
            sb.AppendLine("# SERVIDOR HTTP DEL EDGE");
            sb.AppendLine("# ===================================================");
            sb.AppendLine();
            sb.AppendLine("PORT=8090");
            sb.AppendLine("TZ=America/Mexico_City");
            sb.AppendLine();
            sb.AppendLine("# ===================================================");
            sb.AppendLine("# BACKEND CENTRAL (REST API)");
            sb.AppendLine("# ===================================================");
            sb.AppendLine();
            sb.AppendLine($"CENTRAL_API_URL={centralApi}");
            sb.AppendLine($"CENTRAL_API_TOKEN={edgeToken}");

            // NVR/DVR local — solo si el cliente tiene configuración NVR
            var storageType = client.LocalStorageType ?? "nvr";
            if (storageType != "none")
            {
                sb.AppendLine();
                sb.AppendLine("# ===================================================");
                sb.AppendLine($"# ALMACENAMIENTO LOCAL — {storageType.ToUpper()}");
                sb.AppendLine("# ===================================================");
                sb.AppendLine();
                sb.AppendLine($"NVR_TYPE={storageType}");
                sb.AppendLine($"NVR_IP={client.NvrIp ?? "192.168.1.64"}");
                sb.AppendLine($"NVR_PORT={client.NvrPort ?? 80}");
                sb.AppendLine($"NVR_USER={client.NvrUser ?? "admin"}");
                sb.AppendLine($"NVR_PASSWORD={client.NvrPassword ?? ""}");
                sb.AppendLine($"NVR_BRAND={client.NvrBrand ?? "hikvision"}");
                sb.AppendLine("# NVR_CHANNELS=1,2,3,4  # canales a consultar (opcional)");
            }

            return sb.ToString();
        }

        private static string BuildDockerCompose(
            string centralRtsp, string centralPort,
            string pushUser, string pushPass)
        {
            return
$@"services:
  mediamtx:
    image: bluenviron/mediamtx:latest-ffmpeg
    container_name: edge-mediamtx
    restart: unless-stopped
    ports:
      - ""8554:8554""   # RTSP
      - ""8888:8888""   # HLS
      - ""8889:8889""   # WebRTC HTTP
      - ""8189:8189/udp"" # WebRTC ICE/UDP
      - ""9997:9997""   # API MediaMTX
    environment:
      - MEDIAMTX_USERNAME=edge
      - MEDIAMTX_PASSWORD=edge123
      - MEDIAMTX_PUSH_USER={pushUser}
      - MEDIAMTX_PUSH_PASS={pushPass}
      - CENTRAL_RTSP_HOST={centralRtsp}
      - CENTRAL_RTSP_PORT={centralPort}
      - GATEWAY_CLIENT_ID=${{CLIENT_ID}}
      - TZ=America/Mexico_City
    volumes:
      - ./mediamtx/mediamtx.yml:/mediamtx.yml:ro
      - ./data/recordings:/recordings
      - /usr/share/zoneinfo/America/Mexico_City:/usr/share/zoneinfo/America/Mexico_City:ro
    networks:
      - edge-net

  edge-agent:
    build: ./edge-agent
    container_name: edge-agent
    restart: unless-stopped
    volumes:
      - ./data/recordings:/recordings:ro
    env_file:
      - .env
    environment:
      - TZ=${{TZ:-America/Mexico_City}}
    depends_on:
      - mediamtx
    networks:
      - edge-net
    healthcheck:
      test: [""CMD"", ""wget"", ""-qO-"", ""http://localhost:8090/health""]
      interval: 30s
      timeout: 10s
      retries: 4
      start_period: 60s

networks:
  edge-net:
    driver: bridge
";
        }

        private static string BuildMediamtxYml(List<Camera> cameras, string gatewayId)
        {
            var sb = new StringBuilder();
            sb.AppendLine($"# MediaMTX config — gateway: {gatewayId}");
            sb.AppendLine("# Generado por MotorControl Enterprise");
            sb.AppendLine();
            sb.AppendLine("logLevel: info");
            sb.AppendLine();
            sb.AppendLine("api: yes");
            sb.AppendLine("apiAddress: 0.0.0.0:9997");
            sb.AppendLine();
            sb.AppendLine("authInternalUsers:");
            sb.AppendLine("  - user: edge");
            sb.AppendLine("    pass: edge123");
            sb.AppendLine("    permissions:");
            sb.AppendLine("      - action: api");
            sb.AppendLine("      - action: read");
            sb.AppendLine();
            sb.AppendLine("rtspAuthMethods: [basic]");
            sb.AppendLine("rtspAddress: :8554");
            sb.AppendLine("hlsAddress: :8888");
            sb.AppendLine("webrtcAddress: :8889");
            sb.AppendLine();
            sb.AppendLine("pathDefaults:");
            sb.AppendLine("  record: yes");
            sb.AppendLine("  recordPath: /recordings/%path/%Y-%m-%d/%H-%M-%S");
            sb.AppendLine("  recordFormat: fmp4");
            sb.AppendLine("  recordSegmentDuration: 15m");
            // The ${} here will be substituted by docker-compose at runtime
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
            sb.AppendLine("  # edge-agent calls POST /v3/config/paths/add/{name} after ONVIF discovery");
            sb.AppendLine("  all_others: ~");
            return sb.ToString();
        }

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

            // Mark cameras as "discovering" (prevents stale "pending" in UI)
            foreach (var cam in cameras)
            {
                var meta = ParseMetaDict(cam.Metadata);
                var disc = ExtractDiscovery(cam.Metadata);
                // Only set discovering if not already discovered
                if (disc?.status != "discovered")
                {
                    meta["discovery"] = new { status = "discovering" };
                    cam.Metadata  = JsonSerializer.Serialize(meta);
                    cam.UpdatedAt = DateTime.UtcNow;
                }
            }
            await _db.SaveChangesAsync();

            // Build and publish MQTT payload
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
                        cameraKey = c.CameraKey,
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
    }
}
