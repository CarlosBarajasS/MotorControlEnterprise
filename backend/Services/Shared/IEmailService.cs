namespace MotorControlEnterprise.Api.Services
{
    public interface IEmailService
    {
        Task SendCameraAlertAsync(string cameraName, string gatewayId, string eventType, string? detail = null);
        Task SendTestEmailAsync(string to);
        Task SendUserInviteAsync(string to, string name, string tempPassword, string loginPath = "/client/login");
        Task SendAlertEmailAsync(string subject, string title, string message, string priority, string[] recipients);
        Task<bool> SendWelcomePasswordAsync(string to, string clientName, string tempPassword);
    }
}
