using System;

namespace MotorControlEnterprise.Api.Models
{
    public class Gateway
    {
        public int Id { get; set; }
        public int ClientId { get; set; }
        public Client? Client { get; set; }
        public string GatewayId { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string? Location { get; set; }
        public string Status { get; set; } = "active";
        public string? Metadata { get; set; }  // jsonb: { "edgeToken": "..." }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
        public DateTime? LastHeartbeatAt { get; set; }
    }
}
