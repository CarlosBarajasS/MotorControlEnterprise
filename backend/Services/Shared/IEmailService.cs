namespace MotorControlEnterprise.Api.Services
{
    public interface IEmailService
    {
        Task SendCameraAlertAsync(string cameraName, string gatewayId, string eventType, string? detail = null);
        Task SendTestEmailAsync(string to);
        Task SendUserInviteAsync(string to, string name, string tempPassword, string loginPath = "/client/login");
    }
}
