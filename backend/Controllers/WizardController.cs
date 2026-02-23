using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MotorControlEnterprise.Api.Data;
using MotorControlEnterprise.Api.Models;
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

        public WizardController(ApplicationDbContext db, IConfiguration config)
        {
            _db    = db;
            _config = config;
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

            // Cámaras registradas para este cliente
            var cameras = await _db.Cameras
                .Where(c => c.ClientId == id)
                .OrderBy(c => c.Name)
                .ToListAsync();

            // Valores del servidor (appsettings / variables de entorno)
            var mqttHost     = _config["Mqtt:Host"] ?? "177.247.175.4";
            var mqttPort     = _config["Mqtt:Port"] ?? "1885";
            var centralRtsp  = _config["EdgeDefaults:CentralRtspHost"] ?? mqttHost;
            var centralPort  = _config["EdgeDefaults:CentralRtspPort"] ?? "8556";
            var pushUser     = _config["EdgeDefaults:MediamtxPushUser"] ?? "edge-relay";
            var pushPass     = _config["EdgeDefaults:MediamtxPushPass"] ?? "relay-secret-changeme";
            var centralApi   = _config["EdgeDefaults:CentralApiUrl"]   ?? $"http://{mqttHost}/api";

            // Credenciales MQTT deterministas por gatewayId
            var mqttUsername = $"client-{gatewayId}";
            var mqttPassword = DerivePassword(gatewayId);

            var location = string.Join(", ",
                new[] { client.City, client.State }.Where(s => !string.IsNullOrWhiteSpace(s)));
            if (string.IsNullOrEmpty(location)) location = "Sin ubicación";

            return Ok(new
            {
                gatewayId,
                mqttUsername,
                mqttPassword,
                mosquittoLine  = $"{mqttUsername}:{mqttPassword}",  // para agregar a password_file
                env            = BuildEnv(client, gatewayId, mqttHost, mqttPort, mqttUsername, mqttPassword, centralApi, location),
                dockerCompose  = BuildDockerCompose(centralRtsp, centralPort, pushUser, pushPass),
                mediamtxYml    = BuildMediamtxYml(cameras, gatewayId)
            });
        }

        // Contraseña de 16 chars hex derivada del gatewayId — repetible y única por cliente
        private static string DerivePassword(string gatewayId)
        {
            var bytes = SHA256.HashData(Encoding.UTF8.GetBytes("mce-mqtt-salt-" + gatewayId));
            return Convert.ToHexString(bytes)[..16].ToLower();
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
            Client client, string gatewayId,
            string mqttHost, string mqttPort,
            string mqttUser, string mqttPass,
            string centralApi, string location)
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
            sb.AppendLine("CENTRAL_API_TOKEN=");
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
            sb.AppendLine("    ffmpeg -re");
            sb.AppendLine("    -i rtsp://${MEDIAMTX_USERNAME}:${MEDIAMTX_PASSWORD}@127.0.0.1:8554/$MTX_PATH");
            sb.AppendLine("    -c copy -f rtsp");
            sb.AppendLine("    rtsp://${MEDIAMTX_PUSH_USER}:${MEDIAMTX_PUSH_PASS}@${CENTRAL_RTSP_HOST}:${CENTRAL_RTSP_PORT}/${GATEWAY_CLIENT_ID}/$MTX_PATH");
            sb.AppendLine("  runOnReadyRestart: yes");
            sb.AppendLine();
            sb.AppendLine("paths:");

            if (cameras.Count == 0)
            {
                sb.AppendLine("  # Agrega aquí las cámaras del cliente");
                sb.AppendLine("  cam-principal:");
                sb.AppendLine("    source: rtsp://USUARIO:CLAVE@IP_CAMARA:554/Streaming/Channels/101");
            }
            else
            {
                foreach (var cam in cameras)
                {
                    var rtsp     = ExtractRtspFromStreams(cam.Streams);
                    var pathName = (cam.CameraKey ?? cam.CameraId ??
                                   cam.Name.ToLower().Replace(" ", "-"))
                                  .Trim();
                    sb.AppendLine($"  {pathName}:  # {cam.Name}");
                    sb.AppendLine($"    source: {rtsp ?? "rtsp://USUARIO:CLAVE@IP_CAMARA:554/stream"}");
                }
            }

            sb.AppendLine();
            sb.AppendLine("  all_others:");
            return sb.ToString();
        }
    }
}
