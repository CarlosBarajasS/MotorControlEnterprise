using MQTTnet;
using System.Text;

namespace MotorControlEnterprise.Api.Services
{
    /// <summary>
    /// Singleton que mantiene una conexión MQTT dedicada para publicar mensajes
    /// desde los controllers (comandos a edge devices, etc.).
    /// La suscripción a topics entrantes la maneja MqttIntegrationService.
    /// </summary>
    public class MqttPublisherService : IMqttPublisherService, IHostedService, IDisposable
    {
        private readonly ILogger<MqttPublisherService> _logger;
        private readonly IConfiguration _config;
        private IMqttClient? _client;
        private MqttClientOptions? _options;
        private readonly SemaphoreSlim _lock = new(1, 1);

        public bool IsConnected => _client?.IsConnected ?? false;

        public MqttPublisherService(ILogger<MqttPublisherService> logger, IConfiguration config)
        {
            _logger = logger;
            _config = config;
        }

        public async Task StartAsync(CancellationToken ct)
        {
            var host     = _config["Mqtt:Host"] ?? "localhost";
            var port     = int.TryParse(_config["Mqtt:Port"], out var p) ? p : 1885;
            var clientId = $"EnterprisePublisher_{Guid.NewGuid():N}";

            _options = new MqttClientOptionsBuilder()
                .WithTcpServer(host, port)
                .WithClientId(clientId)
                .WithKeepAlivePeriod(TimeSpan.FromSeconds(30))
                .Build();

            _client = new MqttClientFactory().CreateMqttClient();

            _client.DisconnectedAsync += async _ =>
            {
                _logger.LogWarning("MqttPublisher desconectado. Reconectando en 5s...");
                await Task.Delay(5000, CancellationToken.None);
                await TryConnectAsync(CancellationToken.None);
            };

            await TryConnectAsync(ct);
        }

        private async Task TryConnectAsync(CancellationToken ct)
        {
            try
            {
                if (_client is not null && _options is not null)
                {
                    await _client.ConnectAsync(_options, ct);
                    _logger.LogInformation("MqttPublisher conectado.");
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "MqttPublisher: error al conectar.");
            }
        }

        public async Task<bool> PublishAsync(string topic, string payload, CancellationToken ct = default)
        {
            if (_client is null || !_client.IsConnected)
            {
                _logger.LogWarning("MqttPublisher: intento de publicar sin conexión activa. Topic: {Topic}", topic);
                return false;
            }

            await _lock.WaitAsync(ct);
            try
            {
                var message = new MqttApplicationMessageBuilder()
                    .WithTopic(topic)
                    .WithPayload(Encoding.UTF8.GetBytes(payload))
                    .WithQualityOfServiceLevel(MQTTnet.Protocol.MqttQualityOfServiceLevel.AtLeastOnce)
                    .WithRetainFlag(false)
                    .Build();

                await _client.PublishAsync(message, ct);
                _logger.LogDebug("MQTT publicado → {Topic}", topic);
                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error publicando en topic {Topic}.", topic);
                return false;
            }
            finally
            {
                _lock.Release();
            }
        }

        public async Task StopAsync(CancellationToken ct)
        {
            if (_client?.IsConnected == true)
                await _client.DisconnectAsync(cancellationToken: ct);
        }

        public void Dispose()
        {
            _client?.Dispose();
            _lock.Dispose();
        }
    }
}
