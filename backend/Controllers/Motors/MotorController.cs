using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MotorControlEnterprise.Api.Data;
using MotorControlEnterprise.Api.Services;
using System.ComponentModel.DataAnnotations;
using System.Text.Json;

namespace MotorControlEnterprise.Api.Controllers
{
    [ApiController]
    [Route("api/admin/motors")]
    [Authorize]
    public class MotorController : ControllerBase
    {
        private readonly ApplicationDbContext _db;
        private readonly IMqttPublisherService _mqtt;
        private readonly ILogger<MotorController> _logger;

        public MotorController(
            ApplicationDbContext db,
            IMqttPublisherService mqtt,
            ILogger<MotorController> logger)
        {
            _db     = db;
            _mqtt   = mqtt;
            _logger = logger;
        }

        // ─── GET /api/admin/motors ────────────────────────────────────────────
        /// <summary>Lista todos los dispositivos con su último dato de telemetría.</summary>
        [HttpGet]
        public async Task<IActionResult> GetDevices()
        {
            var devices = await _db.MotorTelemetry
                .GroupBy(t => t.DeviceId)
                .Select(g => new
                {
                    deviceId  = g.Key,
                    lastSeen  = g.Max(t => t.Timestamp),
                    lastState = g.OrderByDescending(t => t.Timestamp)
                                 .Select(t => new { t.Speed, t.Current, t.Voltage, t.State })
                                 .FirstOrDefault()
                })
                .OrderByDescending(d => d.lastSeen)
                .ToListAsync();

            return Ok(devices);
        }

        // ─── POST /api/admin/motors/{deviceId}/command ────────────────────────
        /// <summary>
        /// Envía un comando a un dispositivo motor vía MQTT.
        /// Publica en el topic: motor/{deviceId}/command
        /// </summary>
        [HttpPost("{deviceId}/command")]
        public async Task<IActionResult> SendCommand(
            string deviceId,
            [FromBody] MotorCommandRequest request)
        {
            if (string.IsNullOrWhiteSpace(deviceId))
                return BadRequest(new { error = "deviceId es requerido." });

            var topic   = $"motor/{deviceId}/command";
            var payload = JsonSerializer.Serialize(new
            {
                command   = request.Command,
                speed     = request.Speed,
                timestamp = DateTime.UtcNow
            });

            var sent = await _mqtt.PublishAsync(topic, payload);

            if (!sent)
            {
                _logger.LogWarning("Comando no enviado — broker MQTT desconectado. DeviceId: {DeviceId}", deviceId);
                return StatusCode(503, new
                {
                    error  = "Broker MQTT no disponible. Reintenta en unos segundos.",
                    topic,
                    command = request.Command
                });
            }

            _logger.LogInformation("Comando '{Command}' enviado a {DeviceId} (speed={Speed}).",
                request.Command, deviceId, request.Speed);

            return Ok(new
            {
                success = true,
                topic,
                command = request.Command,
                speed   = request.Speed
            });
        }

        // ─── GET /api/admin/motors/{deviceId}/telemetry ───────────────────────
        /// <summary>
        /// Historial paginado de telemetría de un dispositivo.
        /// Query params: page (default 1), pageSize (default 50, max 200).
        /// Opcional: from / to en formato ISO 8601 para filtrar por rango de fechas.
        /// </summary>
        [HttpGet("{deviceId}/telemetry")]
        public async Task<IActionResult> GetTelemetry(
            string deviceId,
            [FromQuery] int page      = 1,
            [FromQuery] int pageSize  = 50,
            [FromQuery] DateTime? from = null,
            [FromQuery] DateTime? to   = null)
        {
            if (page < 1)     page     = 1;
            if (pageSize < 1) pageSize = 1;
            if (pageSize > 200) pageSize = 200;

            var query = _db.MotorTelemetry
                .Where(t => t.DeviceId == deviceId);

            if (from.HasValue)
                query = query.Where(t => t.Timestamp >= from.Value.ToUniversalTime());
            if (to.HasValue)
                query = query.Where(t => t.Timestamp <= to.Value.ToUniversalTime());

            var total = await query.CountAsync();

            var data = await query
                .OrderByDescending(t => t.Timestamp)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .Select(t => new
                {
                    t.Id,
                    t.DeviceId,
                    t.Speed,
                    t.Current,
                    t.Voltage,
                    t.State,
                    t.Timestamp
                })
                .ToListAsync();

            return Ok(new
            {
                total,
                page,
                pageSize,
                totalPages = (int)Math.Ceiling(total / (double)pageSize),
                data
            });
        }

        // ─── POST /api/admin/motors/{deviceId}/arranque6p ────────────────────
        /// <summary>Arranque 6 pasos. Body: { "values": [v1,v2,v3,v4,v5,v6] } (0-255)</summary>
        [HttpPost("{deviceId}/arranque6p")]
        public async Task<IActionResult> Arranque6P(string deviceId, [FromBody] Arranque6PRequest req)
        {
            if (req.Values == null || req.Values.Length != 6)
                return BadRequest(new { error = "Se requieren exactamente 6 valores PWM." });
            if (req.Values.Any(v => v < 0 || v > 255))
                return BadRequest(new { error = "Cada valor PWM debe estar entre 0 y 255." });

            var letters = new[] { 'a', 'b', 'c', 'd', 'e', 'f' };
            var command = string.Join(",", req.Values.Select((v, i) => $"{v}{letters[i]}")) + ",";
            var sent    = await _mqtt.PublishAsync($"motor/{deviceId}/command", command);

            if (!sent) return StatusCode(503, new { error = "Broker MQTT no disponible." });

            _logger.LogInformation("Arranque6P → {DeviceId}: {Cmd}", deviceId, command);
            return Ok(new { success = true, command, topic = $"motor/{deviceId}/command" });
        }

        // ─── POST /api/admin/motors/{deviceId}/continuo ───────────────────────
        [HttpPost("{deviceId}/continuo")]
        public async Task<IActionResult> Continuo(string deviceId)
        {
            const string command = "0i,";
            var sent = await _mqtt.PublishAsync($"motor/{deviceId}/command", command);
            if (!sent) return StatusCode(503, new { error = "Broker MQTT no disponible." });
            return Ok(new { success = true, command });
        }

        // ─── POST /api/admin/motors/{deviceId}/paro ───────────────────────────
        [HttpPost("{deviceId}/paro")]
        public async Task<IActionResult> Paro(string deviceId)
        {
            const string command = "0p,";
            var sent = await _mqtt.PublishAsync($"motor/{deviceId}/command", command);
            if (!sent) return StatusCode(503, new { error = "Broker MQTT no disponible." });
            return Ok(new { success = true, command });
        }

        // ─── GET /api/admin/motors/mqtt/info ──────────────────────────────────
        [HttpGet("mqtt/info")]
        public IActionResult GetMqttInfo([FromServices] IConfiguration config)
        {
            return Ok(new
            {
                host      = config["Mqtt:Host"] ?? "mosquitto",
                port      = config["Mqtt:Port"] ?? "1885",
                connected = _mqtt.IsConnected,
                topics = new[]
                {
                    "motor/{id}/command     ← comandos al ESP32",
                    "motor/{id}/telemetry   → telemetría del ESP32",
                    "gateway/{id}/heartbeat → heartbeat del gateway",
                    "camera/{gw}/{cam}/register → auto-registro de cámaras",
                    "cmd/{gw}/{ch}          ← comandos edge (PTZ/SD)",
                    "response/{gw}/{reqId}  → respuestas del edge"
                }
            });
        }

        // ─── POST /api/admin/motors/mqtt/test ─────────────────────────────────
        [HttpPost("mqtt/test")]
        [Authorize(Roles = "admin")]
        public async Task<IActionResult> TestMqtt([FromBody] MqttTestRequest req)
        {
            if (string.IsNullOrWhiteSpace(req.Topic) || string.IsNullOrWhiteSpace(req.Message))
                return BadRequest(new { error = "topic y message son requeridos." });
            var sent = await _mqtt.PublishAsync(req.Topic, req.Message);
            return sent
                ? Ok(new { success = true, topic = req.Topic })
                : StatusCode(503, new { error = "Broker MQTT no disponible." });
        }
    }

    // ─── DTOs ─────────────────────────────────────────────────────────────────
    public class MotorCommandRequest
    {
        [Required]
        public string Command { get; set; } = string.Empty;
        public int? Speed { get; set; }
    }

    public class Arranque6PRequest
    {
        [Required]
        public int[] Values { get; set; } = Array.Empty<int>();
    }

    public class MqttTestRequest
    {
        public string Topic   { get; set; } = string.Empty;
        public string Message { get; set; } = string.Empty;
    }
}
