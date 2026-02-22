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
        private IMqttClient? _mqttClient;

        public MqttIntegrationService(
            ILogger<MqttIntegrationService> logger,
            IServiceProvider serviceProvider,
            IConfiguration config)
        {
            _logger = logger;
            _serviceProvider = serviceProvider;
            _config = config;
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
                            camera.LastSeen = DateTime.UtcNow;
                            try
                            {
                                var doc = JsonDocument.Parse(payload);
                                if (doc.RootElement.TryGetProperty("status", out var el))
                                    camera.Status = el.GetString() ?? camera.Status;
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
                        var cameraKey = parts[2];
                        var camera = db.Cameras.FirstOrDefault(c => c.CameraKey == cameraKey);
                        if (camera != null)
                        {
                            camera.Streams  = payload;
                            camera.LastSeen = DateTime.UtcNow;
                            await db.SaveChangesAsync();
                            _logger.LogInformation("Streams actualizados para cámara {CameraKey}.", cameraKey);
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
