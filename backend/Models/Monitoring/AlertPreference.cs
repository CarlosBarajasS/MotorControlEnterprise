using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MotorControlEnterprise.Api.Models
{
    public class AlertPreference
    {
        [Key]
        [Column("client_id")]
        public int ClientId { get; set; }
        public Client? Client { get; set; }

        [Column("in_app_enabled")]
        public bool InAppEnabled { get; set; } = true;

        [Column("email_enabled")]
        public bool EmailEnabled { get; set; } = true;

        /// <summary>
        /// Max numeric priority value to deliver. Default 3 = P1+P2+P3 but NOT P4.
        /// Comparison: alert.Priority (int) &lt;= MinPriority → deliver.
        /// </summary>
        [Column("min_priority")]
        public int MinPriority { get; set; } = 3;
    }
}
