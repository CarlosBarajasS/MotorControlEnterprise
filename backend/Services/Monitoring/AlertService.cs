using Microsoft.EntityFrameworkCore;
using MotorControlEnterprise.Api.Data;
using MotorControlEnterprise.Api.Models;

namespace MotorControlEnterprise.Api.Services
{
    public class AlertService
    {
        private readonly ApplicationDbContext _db;
        private readonly IEmailService _email;
        private readonly IConfiguration _config;
        private readonly ILogger<AlertService> _logger;
        private static readonly TimeSpan CooldownWindow = TimeSpan.FromMinutes(5);

        public AlertService(
            ApplicationDbContext db,
            IEmailService email,
            IConfiguration config,
            ILogger<AlertService> logger)
        {
            _db     = db;
            _email  = email;
            _config = config;
            _logger = logger;
        }

        /// <summary>
        /// Create alert with full deduplication + cooldown.
        /// Step 1: skip if Active/Acknowledged alert exists for this fingerprint (update LastTriggeredAt).
        /// Step 2: skip if Resolved alert exists within cooldown window.
        /// Step 3: insert new Active alert + dispatch email.
        /// </summary>
        public async Task TryCreateAsync(
            string fingerprint,
            AlertEntityType entityType,
            string entityId,
            AlertType alertType,
            AlertPriority priority,
            string title,
            string message,
            int? clientId = null)
        {
            // Step 1: check for existing active/acknowledged
            var existing = await _db.Alerts.FirstOrDefaultAsync(a =>
                a.Fingerprint == fingerprint &&
                (a.Status == AlertStatus.Active || a.Status == AlertStatus.Acknowledged));

            if (existing != null)
            {
                existing.LastTriggeredAt = DateTime.UtcNow;
                await _db.SaveChangesAsync();
                return;
            }

            // Step 2: cooldown — check recently resolved
            var cooldownCutoff = DateTime.UtcNow - CooldownWindow;
            var recentlyResolved = await _db.Alerts.AnyAsync(a =>
                a.Fingerprint == fingerprint &&
                a.Status == AlertStatus.Resolved &&
                a.ResolvedAt > cooldownCutoff);

            if (recentlyResolved)
                return;

            // Step 3: create new alert
            var alert = new Alert
            {
                Fingerprint      = fingerprint,
                EntityType       = entityType,
                EntityId         = entityId,
                AlertType        = alertType,
                Priority         = priority,
                Status           = AlertStatus.Active,
                Title            = title,
                Message          = message,
                ClientId         = clientId,
                CreatedAt        = DateTime.UtcNow,
                LastTriggeredAt  = DateTime.UtcNow
            };
            _db.Alerts.Add(alert);
            await _db.SaveChangesAsync();

            _logger.LogWarning("Alert created: [{Priority}] {Title}", priority, title);

            // Step 4: dispatch email
            await DispatchEmailAsync(alert, clientId);
        }

        /// <summary>
        /// Auto-resolve an active alert and create a P4 recovery alert.
        /// Idempotent — no-op if already resolved or not found.
        /// </summary>
        public async Task ResolveAsync(
            string fingerprint,
            string recoveryTitle,
            string recoveryMessage,
            string recoveryEntityId,
            AlertEntityType recoveryEntityType,
            int? clientId = null)
        {
            var active = await _db.Alerts.FirstOrDefaultAsync(a =>
                a.Fingerprint == fingerprint &&
                (a.Status == AlertStatus.Active || a.Status == AlertStatus.Acknowledged));

            if (active == null) return;

            active.Status     = AlertStatus.Resolved;
            active.ResolvedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();

            _logger.LogInformation("Alert resolved: {Fingerprint}", fingerprint);

            // P4 recovery alert via TryCreateAsync (goes through full dedup)
            var recoveryFingerprint = $"{recoveryEntityType}-{recoveryEntityId}-{GetRecoveryType(active.AlertType)}";
            await TryCreateAsync(
                recoveryFingerprint,
                recoveryEntityType,
                recoveryEntityId,
                GetRecoveryType(active.AlertType),
                AlertPriority.P4,
                recoveryTitle,
                recoveryMessage,
                clientId);
        }

        /// <summary>
        /// Manually resolve an alert. Allowed for admin/installer.
        /// Returns error codes if not found or already resolved.
        /// </summary>
        public async Task<(bool success, string? error, Alert? alert)> ManualResolveAsync(int alertId, string resolvedByUsername)
        {
            var alert = await _db.Alerts.FindAsync(alertId);
            if (alert == null) return (false, "not_found", null);
            if (alert.Status == AlertStatus.Resolved) return (false, "already_resolved", null);

            alert.Status         = AlertStatus.Resolved;
            alert.ResolvedAt     = DateTime.UtcNow;
            alert.AcknowledgedBy = resolvedByUsername;
            await _db.SaveChangesAsync();

            _logger.LogInformation("Alert manually resolved: Id={AlertId} by {User}", alertId, resolvedByUsername);
            return (true, null, alert);
        }

        /// <summary>
        /// ACK an alert. Idempotent on already-ACK'd. Returns error codes if not found or resolved.
        /// </summary>
        public async Task<(bool success, string? error, Alert? alert)> AcknowledgeAsync(int alertId, string adminEmail)
        {
            var alert = await _db.Alerts.FindAsync(alertId);
            if (alert == null) return (false, "not_found", null);
            if (alert.Status == AlertStatus.Resolved) return (false, "already_resolved", null);

            // Idempotent — update AcknowledgedBy even if already ACK'd
            alert.Status          = AlertStatus.Acknowledged;
            alert.AcknowledgedAt  = alert.AcknowledgedAt ?? DateTime.UtcNow;
            alert.AcknowledgedBy  = adminEmail;

            // P4 (informational/recovery) alerts need no follow-up action.
            // Auto-resolve immediately after ACK so they leave the active drawer.
            if (alert.Priority == AlertPriority.P4)
            {
                alert.Status     = AlertStatus.Resolved;
                alert.ResolvedAt = DateTime.UtcNow;
            }

            await _db.SaveChangesAsync();

            _logger.LogInformation(
                "Alert acknowledged: Id={AlertId} by {User}{AutoResolved}",
                alertId, adminEmail,
                alert.Status == AlertStatus.Resolved ? " (auto-resolved, P4)" : string.Empty);

            return (true, null, alert);
        }

        private AlertType GetRecoveryType(AlertType original) => original switch
        {
            AlertType.GatewayDown     => AlertType.GatewayUp,
            AlertType.Offline         => AlertType.Online,
            AlertType.StorageCritical => AlertType.StorageHigh,
            AlertType.StorageHigh     => AlertType.StorageHigh,
            _                         => AlertType.Online
        };

        private async Task DispatchEmailAsync(Alert alert, int? clientId)
        {
            // P4 informative alerts → no email
            if (alert.Priority == AlertPriority.P4) return;

            var priorityLabel = alert.Priority.ToString();
            var subject = $"[{priorityLabel}] {alert.Title} — NIRM GROUP";
            var recipients = new List<string>();

            // Admin emails — mandatory for P1 and P2
            if (alert.Priority <= AlertPriority.P2)
            {
                var adminEmail = _config["Admin:AlertEmail"] ?? _config["Admin:Email"];
                if (!string.IsNullOrEmpty(adminEmail))
                    recipients.Add(adminEmail);
            }

            // Client email — preference-driven (only for non-storage alerts)
            if (clientId.HasValue)
            {
                var pref = await _db.AlertPreferences.FindAsync(clientId.Value);
                var emailEnabled = pref?.EmailEnabled ?? true;
                var minPriority  = pref?.MinPriority ?? 3;

                if (emailEnabled && (int)alert.Priority <= minPriority)
                {
                    var client = await _db.Clients
                        .Include(c => c.User)
                        .FirstOrDefaultAsync(c => c.Id == clientId.Value);
                    var clientEmail = client?.User?.Email ?? client?.ContactEmail;
                    if (!string.IsNullOrEmpty(clientEmail))
                        recipients.Add(clientEmail);
                }
            }

            if (recipients.Count == 0) return;

            try
            {
                await _email.SendAlertEmailAsync(subject, alert.Title, alert.Message, priorityLabel, recipients.ToArray());
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to send alert email for {Fingerprint}", alert.Fingerprint);
            }
        }
    }
}
