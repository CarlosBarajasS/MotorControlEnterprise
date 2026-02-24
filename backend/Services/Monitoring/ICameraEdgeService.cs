namespace MotorControlEnterprise.Api.Services
{
    /// <summary>
    /// Patrón request-response sobre MQTT para comunicarse con edge gateways.
    /// Publica un comando y espera la respuesta en un topic dedicado por requestId.
    /// </summary>
    public interface ICameraEdgeService
    {
        /// <summary>
        /// Envía un comando al edge gateway y espera su respuesta.
        /// Publica en: cmd/{gatewayId}/{channel}
        /// Espera respuesta en: response/{gatewayId}/{requestId}
        /// </summary>
        Task<string> RequestEdgeAsync(
            string gatewayId,
            string channel,
            string action,
            object? parameters = null,
            int timeoutMs = 10000,
            CancellationToken ct = default);

        /// <summary>
        /// Llamado por MqttIntegrationService cuando llega un mensaje en response/+/+
        /// </summary>
        void HandleResponse(string requestId, string payload);
    }
}
