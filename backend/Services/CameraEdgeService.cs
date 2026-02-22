using System.Collections.Concurrent;
using System.Text.Json;

namespace MotorControlEnterprise.Api.Services
{
    /// <summary>
    /// Implementación del patrón request-response sobre MQTT.
    /// Los controllers inyectan esta clase para comunicarse con edge gateways.
    /// </summary>
    public class CameraEdgeService : ICameraEdgeService
    {
        private readonly IMqttPublisherService _mqtt;
        private readonly ILogger<CameraEdgeService> _logger;

        // requestId → TaskCompletionSource que espera la respuesta
        private readonly ConcurrentDictionary<string, TaskCompletionSource<string>> _pending = new();

        public CameraEdgeService(IMqttPublisherService mqtt, ILogger<CameraEdgeService> logger)
        {
            _mqtt   = mqtt;
            _logger = logger;
        }

        public async Task<string> RequestEdgeAsync(
            string gatewayId,
            string channel,
            string action,
            object? parameters = null,
            int timeoutMs = 10000,
            CancellationToken ct = default)
        {
            var requestId = Guid.NewGuid().ToString("N");
            var topic     = $"cmd/{gatewayId}/{channel}";

            var payload = JsonSerializer.Serialize(new
            {
                requestId,
                action,
                parameters
            });

            var tcs = new TaskCompletionSource<string>(TaskCreationOptions.RunContinuationsAsynchronously);
            _pending[requestId] = tcs;

            try
            {
                var sent = await _mqtt.PublishAsync(topic, payload, ct);
                if (!sent)
                {
                    _pending.TryRemove(requestId, out _);
                    throw new InvalidOperationException("Broker MQTT no disponible.");
                }

                using var timeoutCts = new CancellationTokenSource(timeoutMs);
                using var linked     = CancellationTokenSource.CreateLinkedTokenSource(ct, timeoutCts.Token);

                linked.Token.Register(() =>
                {
                    if (_pending.TryRemove(requestId, out var t))
                        t.TrySetCanceled();
                });

                return await tcs.Task;
            }
            catch (OperationCanceledException)
            {
                _pending.TryRemove(requestId, out _);
                throw new TimeoutException($"Edge gateway '{gatewayId}' no respondió en {timeoutMs}ms.");
            }
        }

        public void HandleResponse(string requestId, string payload)
        {
            if (_pending.TryRemove(requestId, out var tcs))
            {
                tcs.TrySetResult(payload);
                _logger.LogDebug("Response recibida para requestId {RequestId}.", requestId);
            }
            else
            {
                _logger.LogWarning("Response huérfana para requestId {RequestId} (ya expiró o no existía).", requestId);
            }
        }
    }
}
