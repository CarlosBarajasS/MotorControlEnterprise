using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using MotorControlEnterprise.Api.Data;
using MQTTnet;
using System.Buffers;
using System.Text;
using System.Text.Json;

namespace MotorControlEnterprise.Api.Services
{
    public class MqttIntegrationService : BackgroundService
    {
        private readonly ILogger<MqttIntegrationService> _logger;
        private readonly IServiceProvider _serviceProvider;
        private readonly IConfiguration _config;
        private readonly ICameraEdgeService _edgeService;
        private IMqttClient? _mqttClient;

        public MqttIntegrationService(
            ILogger<MqttIntegrationService> logger,
            IServiceProvider serviceProvider,
            IConfiguration config,
            ICameraEdgeService edgeService)
        {
            _logger       = logger;
            _serviceProvider = serviceProvider;
            _config       = config;
            _edgeService  = edgeService;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            var host     = _config["Mqtt:Host"] ?? "localhost";
            var port     = int.TryParse(_config["Mqtt:Port"], out var p) ? p : 1885;
            var clientId = $"{_config["Mqtt:ClientId"] ?? "EnterpriseServer"}_{Guid.NewGuid():N}";

            _mqttClient = new MqttClientFactory().CreateMqttClient();

            _mqttClient.ApplicationMessageReceivedAsync += HandleMessageAsync;
            _mqttClient.DisconnectedAsync += async _ =>
            {
                _logger.LogWarning("MQTT desconectado. Reconectando en 5s...");
                await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
                if (!stoppingToken.IsCancellationRequested)
                    await ConnectAsync(host, port, clientId, stoppingToken);
            };

            await ConnectAsync(host, port, clientId, stoppingToken);

            await Task.Delay(Timeout.Infinite, stoppingToken);
        }

        private async Task ConnectAsync(string host, int port, string clientId, CancellationToken ct)
        {
            try
            {
                var options = new MqttClientOptionsBuilder()
                    .WithTcpServer(host, port)
                    .WithClientId(clientId)
                    .WithKeepAlivePeriod(TimeSpan.FromSeconds(30))
                    .Build();

                await _mqttClient!.ConnectAsync(options, ct);

                await _mqttClient.SubscribeAsync("gateway/+/heartbeat",  cancellationToken: ct);
                await _mqttClient.SubscribeAsync("camera/+/+/status",    cancellationToken: ct);
                await _mqttClient.SubscribeAsync("camera/+/+/register",  cancellationToken: ct);
                await _mqttClient.SubscribeAsync("motor/+/telemetry",    cancellationToken: ct);
                await _mqttClient.SubscribeAsync("response/+/+",         cancellationToken: ct);

                _logger.LogInformation("MQTT conectado a {Host}:{Port}.", host, port);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error conectando al broker MQTT en {Host}:{Port}.", host, port);
            }
        }

        private async Task HandleMessageAsync(MqttApplicationMessageReceivedEventArgs e)
        {
            var topic   = e.ApplicationMessage.Topic;
            var payload = Encoding.UTF8.GetString(e.ApplicationMessage.Payload.ToArray());

            _logger.LogDebug("MQTT recibido. Topic: {Topic}", topic);

            // response/{gatewayId}/{requestId} — despachar al CameraEdgeService
            if (topic.StartsWith("response/"))
            {
                var parts = topic.Split('/');
                if (parts.Length == 3)
                    _edgeService.HandleResponse(parts[2], payload);
                return;
            }

            try
            {
                using var scope = _serviceProvider.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

                // gateway/{gatewayId}/heartbeat
                if (topic.StartsWith("gateway/") && topic.EndsWith("/heartbeat"))
                {
                    var gatewayId = topic.Split('/')[1];
                    var client = db.Clients.FirstOrDefault(c => c.GatewayId == gatewayId);
                    if (client != null)
                    {
                        client.UpdatedAt = DateTime.UtcNow;
                        await db.SaveChangesAsync();
                        _logger.LogInformation("Heartbeat actualizado para gateway {GatewayId}.", gatewayId);
                    }
                }

                // camera/{gatewayId}/{cameraKey}/status
                else if (topic.EndsWith("/status"))
                {
                    var parts = topic.Split('/');
                    if (parts.Length == 4)
                    {
                        var cameraKey = parts[2];
                        var camera = db.Cameras.FirstOrDefault(c => c.CameraKey == cameraKey);
                        if (camera != null)
                        {
                            camera.LastSeen  = DateTime.UtcNow;
                            camera.UpdatedAt = DateTime.UtcNow;
                            try
                            {
                                var doc  = JsonDocument.Parse(payload);
                                var root = doc.RootElement;

                                // Prefer 'online' boolean (edge-template format)
                                if (root.TryGetProperty("online", out var onlineEl))
                                    camera.Status = onlineEl.GetBoolean() ? "active" : "offline";
                                else if (root.TryGetProperty("status", out var statusEl))
                                    camera.Status = statusEl.GetString() ?? camera.Status;
                            }
                            catch { /* payload no es JSON válido */ }

                            await db.SaveChangesAsync();
                        }
                    }
                }

                // motor/{deviceId}/telemetry
                else if (topic.StartsWith("motor/") && topic.EndsWith("/telemetry"))
                {
                    var deviceId = topic.Split('/')[1];
                    try
                    {
                        var doc = JsonDocument.Parse(payload);
                        var root = doc.RootElement;

                        var telemetry = new MotorControlEnterprise.Api.Models.MotorTelemetry
                        {
                            DeviceId  = deviceId,
                            Speed     = root.TryGetProperty("speed",   out var s) ? s.GetInt32()    : null,
                            Current   = root.TryGetProperty("current", out var c) ? (float?)c.GetDouble() : null,
                            Voltage   = root.TryGetProperty("voltage", out var v) ? (float?)v.GetDouble() : null,
                            State     = root.TryGetProperty("state",   out var st) ? st.GetString() : "unknown",
                            Timestamp = DateTime.UtcNow
                        };

                        db.MotorTelemetry.Add(telemetry);
                        await db.SaveChangesAsync();
                        _logger.LogDebug("Telemetría guardada para dispositivo {DeviceId}.", deviceId);
                    }
                    catch (JsonException)
                    {
                        _logger.LogWarning("Telemetría con payload JSON inválido para {DeviceId}.", deviceId);
                    }
                }

                // camera/{gatewayId}/{cameraKey}/register
                else if (topic.EndsWith("/register"))
                {
                    var parts = topic.Split('/');
                    if (parts.Length == 4)
                    {
                        var gatewayId = parts[1];
                        var cameraKey = parts[2];

                        // Look up client by gatewayId to get correct userId/clientId
                        var client = db.Clients.FirstOrDefault(c => c.GatewayId == gatewayId);
                        var camera = db.Cameras.FirstOrDefault(c => c.CameraKey == cameraKey);

                        // Parse the registration payload from edge-template
                        string? camName     = null;
                        string? camIp       = null;
                        string? streamsJson = null;

                        try
                        {
                            var doc  = JsonDocument.Parse(payload);
                            var root = doc.RootElement;

                            camName = root.TryGetProperty("name", out var n) ? n.GetString() : null;
                            camIp   = root.TryGetProperty("ip",   out var ip) ? ip.GetString() : null;

                            // Normalize streams: edge sends { main, hls, webrtc }
                            // Store as { rtsp, hls, webrtc } to match ExtractRtspUrl() in CameraController
                            string? rtspUrl   = null;
                            string? hlsUrl    = null;
                            string? webrtcUrl = null;

                            if (root.TryGetProperty("streams", out var streamsEl))
                            {
                                if (streamsEl.TryGetProperty("main",   out var m)) rtspUrl   = m.GetString();
                                if (streamsEl.TryGetProperty("hls",    out var h)) hlsUrl    = h.GetString();
                                if (streamsEl.TryGetProperty("webrtc", out var w)) webrtcUrl = w.GetString();
                            }

                            // Fallback: top-level rtspUrl field
                            if (rtspUrl == null && root.TryGetProperty("rtspUrl", out var ru))
                                rtspUrl = ru.GetString();

                            streamsJson = JsonSerializer.Serialize(new
                            {
                                rtsp   = rtspUrl,
                                hls    = hlsUrl,
                                webrtc = webrtcUrl
                            });
                        }
                        catch { /* payload no es JSON válido, usar null */ }

                        if (camera != null)
                        {
                            // Update existing camera with fresh stream URLs
                            if (streamsJson != null) camera.Streams = streamsJson;
                            camera.LastSeen  = DateTime.UtcNow;
                            camera.UpdatedAt = DateTime.UtcNow;
                            await db.SaveChangesAsync();
                            _logger.LogInformation("Cámara {CameraKey} actualizada desde registro MQTT.", cameraKey);
                        }
                        else
                        {
                            // Auto-create camera from edge gateway registration
                            var newCamera = new MotorControlEnterprise.Api.Models.Camera
                            {
                                Name      = camName ?? cameraKey,
                                CameraKey = cameraKey,
                                CameraId  = cameraKey,
                                Location  = camIp,
                                ClientId  = client?.Id,
                                UserId    = client?.UserId ?? 1,  // fallback to admin (userId=1)
                                Streams   = streamsJson,
                                Status    = "active",
                                LastSeen  = DateTime.UtcNow,
                                CreatedAt = DateTime.UtcNow,
                                UpdatedAt = DateTime.UtcNow
                            };

                            db.Cameras.Add(newCamera);
                            await db.SaveChangesAsync();
                            _logger.LogInformation(
                                "Cámara {CameraKey} auto-registrada desde edge {GatewayId} (client: {ClientId}).",
                                cameraKey, gatewayId, client?.Id.ToString() ?? "desconocido");
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error procesando mensaje MQTT en topic {Topic}.", topic);
            }
        }

        public override async Task StopAsync(CancellationToken cancellationToken)
        {
            _logger.LogInformation("Deteniendo servicio MQTT...");
            if (_mqttClient?.IsConnected == true)
                await _mqttClient.DisconnectAsync(cancellationToken: cancellationToken);
            _mqttClient?.Dispose();
            await base.StopAsync(cancellationToken);
        }
    }
}
