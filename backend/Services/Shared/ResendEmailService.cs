using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace MotorControlEnterprise.Api.Services
{
    public class ResendEmailService : IEmailService
    {
        private readonly IHttpClientFactory _httpFactory;
        private readonly IConfiguration _config;
        private readonly ILogger<ResendEmailService> _logger;

        public ResendEmailService(
            IHttpClientFactory httpFactory,
            IConfiguration config,
            ILogger<ResendEmailService> logger)
        {
            _httpFactory = httpFactory;
            _config      = config;
            _logger      = logger;
        }

        public async Task SendCameraAlertAsync(string cameraName, string gatewayId, string eventType, string? detail = null)
        {
            var to = _config["Email:AdminAlertEmail"];
            if (string.IsNullOrWhiteSpace(to))
            {
                _logger.LogDebug("Email:AdminAlertEmail no configurado — alerta omitida.");
                return;
            }

            var emoji   = eventType == "offline" ? "🔴" : "🟢";
            var subject = $"{emoji} Cámara {eventType}: {cameraName}";
            var html    = $@"
<div style='font-family:system-ui,sans-serif;max-width:500px'>
  <h2 style='color:{(eventType == "offline" ? "#ef4444" : "#10b981")}'>{emoji} Cámara {eventType}</h2>
  <table style='width:100%;border-collapse:collapse'>
    <tr><td style='padding:6px 0;color:#667085'>Cámara</td><td><strong>{cameraName}</strong></td></tr>
    <tr><td style='padding:6px 0;color:#667085'>Gateway</td><td>{gatewayId}</td></tr>
    <tr><td style='padding:6px 0;color:#667085'>Evento</td><td>{eventType}</td></tr>
    {(detail != null ? $"<tr><td style='padding:6px 0;color:#667085'>Detalle</td><td>{detail}</td></tr>" : "")}
    <tr><td style='padding:6px 0;color:#667085'>Fecha</td><td>{DateTime.UtcNow:yyyy-MM-dd HH:mm} UTC</td></tr>
  </table>
  <p style='margin-top:16px;color:#667085;font-size:12px'>MotorControl Enterprise</p>
</div>";

            await SendAsync(to, subject, html);
        }

        public async Task SendTestEmailAsync(string to)
        {
            var subject = "✅ Test de email — MotorControl Enterprise";
            var html    = @"
<div style='font-family:system-ui,sans-serif;max-width:500px'>
  <h2 style='color:#2563eb'>✅ Email funcionando</h2>
  <p>La configuración de Resend.dev está correcta en MotorControl Enterprise.</p>
  <p style='color:#667085;font-size:12px'>Enviado desde MotorControl Enterprise</p>
</div>";

            await SendAsync(to, subject, html);
        }

        public async Task SendUserInviteAsync(string to, string name, string tempPassword, string loginPath = "/client/login")
        {
            var baseUrl  = _config["App:FrontendUrl"] ?? "http://177.247.175.4:8080";
            var loginUrl = $"{baseUrl.TrimEnd('/')}{loginPath}";
            var subject  = "🔐 Acceso a tu portal de monitoreo — NIRM GROUP";
            var html     = $@"
<div style='font-family:system-ui,sans-serif;max-width:500px;color:#0b1220'>
  <h2 style='color:#2563eb;margin-bottom:8px'>🔐 Bienvenido a tu portal de monitoreo</h2>
  <p>Hola <strong>{name}</strong>, el instalador ha configurado tu acceso al portal de cámaras NIRM GROUP.</p>
  <p style='margin-top:20px'>Tus credenciales de acceso inicial:</p>
  <table style='width:100%;border-collapse:collapse;margin:12px 0;background:#f8fafc;border-radius:8px;padding:12px'>
    <tr><td style='padding:6px 12px;color:#667085;font-size:13px'>Email</td><td style='padding:6px 12px'><strong>{to}</strong></td></tr>
    <tr><td style='padding:6px 12px;color:#667085;font-size:13px'>Contraseña temporal</td><td style='padding:6px 12px'><code style='background:#e2e8f0;padding:3px 8px;border-radius:4px;font-size:14px'>{tempPassword}</code></td></tr>
  </table>
  <a href='{loginUrl}' style='display:inline-block;background:#2563eb;color:#fff;padding:11px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:8px'>
    Entrar al portal →
  </a>
  <p style='margin-top:20px;color:#ef4444;font-size:13px;font-weight:600'>⚠️ Se te pedirá cambiar tu contraseña en el primer inicio de sesión.</p>
  <p style='color:#667085;font-size:12px'>Si no solicitaste este acceso, ignora este mensaje.</p>
  <p style='color:#94a3b8;font-size:11px;margin-top:16px'>NIRM GROUP · Sistema de Videovigilancia</p>
</div>";

            await SendAsync(to, subject, html);
        }

        public async Task SendAlertEmailAsync(string subject, string title, string message, string priority, string[] recipients)
        {
            var priorityColor = priority switch {
                "P1" => "#ef4444",
                "P2" => "#f97316",
                "P3" => "#eab308",
                _    => "#6b7280"
            };

            var html = $"""
                <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
                  <div style="background:{priorityColor};padding:12px 20px;border-radius:8px 8px 0 0">
                    <span style="color:#fff;font-weight:700;font-size:14px">[{priority}] NIRM GROUP — Sistema de Alertas</span>
                  </div>
                  <div style="background:#f9fafb;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
                    <h2 style="margin:0 0 12px;color:#111827;font-size:18px">{title}</h2>
                    <p style="color:#374151;margin:0 0 20px">{message}</p>
                    <p style="color:#9ca3af;font-size:12px;margin:0">{DateTime.UtcNow:yyyy-MM-dd HH:mm} UTC</p>
                  </div>
                </div>
                """;

            foreach (var recipient in recipients)
            {
                await SendAsync(recipient, subject, html);
            }
        }


        public async Task<bool> SendWelcomePasswordAsync(string to, string clientName, string tempPassword)
        {
            try
            {
                var subject = $"Bienvenido a NIRMGROUP — Acceso para {clientName}";
                var html    = $@"<h2>Tu acceso está listo</h2>
<p>Hola,</p>
<p>Tu cuenta para el portal de monitoreo de <strong>{clientName}</strong> ha sido creada.</p>
<p><strong>Email:</strong> {to}<br/>
<strong>Contraseña temporal:</strong> <code style=""font-size:18px"">{tempPassword}</code></p>
<p>Ingresa en <a href=""https://nirmgroup.net/login"">nirmgroup.net/login</a> y cambia tu contraseña.</p>
<p>— Equipo NIRMGROUP</p>";

                await SendAsync(to, subject, html);
                return true;
            }
            catch
            {
                return false;
            }
        }

        private async Task SendAsync(string to, string subject, string html)
        {
            var apiKey = _config["Email:ResendApiKey"];
            if (string.IsNullOrWhiteSpace(apiKey))
            {
                _logger.LogWarning("Email:ResendApiKey no configurado — email no enviado.");
                return;
            }

            var from     = _config["Email:From"]     ?? "MotorControl Enterprise <noreply@motorcontrol.app>";
            var fromName = _config["Email:FromName"] ?? "MotorControl Enterprise";

            var payload = JsonSerializer.Serialize(new
            {
                from    = from,
                to      = new[] { to },
                subject,
                html
            });

            using var client = _httpFactory.CreateClient();
            client.DefaultRequestHeaders.Authorization =
                new AuthenticationHeaderValue("Bearer", apiKey);

            var response = await client.PostAsync(
                "https://api.resend.com/emails",
                new StringContent(payload, Encoding.UTF8, "application/json"));

            if (response.IsSuccessStatusCode)
                _logger.LogInformation("Email enviado a {To}: {Subject}", to, subject);
            else
            {
                var body = await response.Content.ReadAsStringAsync();
                _logger.LogError("Error enviando email: {Status} — {Body}", response.StatusCode, body);
            }
        }
    }
}
