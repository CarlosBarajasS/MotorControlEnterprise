namespace MotorControlEnterprise.Api.Services
{
    public interface IMqttPublisherService
    {
        /// <summary>Publica un mensaje MQTT. Retorna false si el cliente no está conectado.</summary>
        Task<bool> PublishAsync(string topic, string payload, CancellationToken ct = default);
        bool IsConnected { get; }
    }
}
