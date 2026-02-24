using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MotorControlEnterprise.Api.Data;
using MotorControlEnterprise.Api.Services;

namespace MotorControlEnterprise.Api.Controllers
{
    /// <summary>
    /// Dashboard de telemetría de motores para administradores.
    /// Ruta base: /api/admin/telemetry
    /// </summary>
    [ApiController]
    [Route("api/admin/telemetry")]
    [Authorize(Roles = "admin")]
    public class AdminTelemetryController : ControllerBase
    {
        private readonly ApplicationDbContext _db;
        private readonly IMqttPublisherService _mqtt;

        public AdminTelemetryController(ApplicationDbContext db, IMqttPublisherService mqtt)
        {
            _db   = db;
            _mqtt = mqtt;
        }

        // ─── GET /api/admin/telemetry/devices ────────────────────────────────
        /// <summary>Lista todos los deviceIds con su último registro de telemetría.</summary>
        [HttpGet("devices")]
        public async Task<IActionResult> GetDevices()
        {
            var devices = await _db.MotorTelemetry
                .GroupBy(t => t.DeviceId)
                .Select(g => new
                {
                    deviceId   = g.Key,
                    lastSeen   = g.Max(t => t.Timestamp),
                    totalRows  = g.Count(),
                    lastSpeed   = g.OrderByDescending(t => t.Timestamp).Select(t => t.Speed).FirstOrDefault(),
                    lastState   = g.OrderByDescending(t => t.Timestamp).Select(t => t.State).FirstOrDefault()
                })
                .OrderByDescending(d => d.lastSeen)
                .ToListAsync();

            return Ok(devices);
        }

        // ─── GET /api/admin/telemetry/device/{deviceId} ───────────────────────
        /// <summary>Último dato de telemetría de un dispositivo específico.</summary>
        [HttpGet("device/{deviceId}")]
        public async Task<IActionResult> GetDevice(string deviceId)
        {
            var latest = await _db.MotorTelemetry
                .Where(t => t.DeviceId == deviceId)
                .OrderByDescending(t => t.Timestamp)
                .FirstOrDefaultAsync();

            if (latest == null)
                return NotFound(new { message = $"Dispositivo '{deviceId}' sin datos." });

            return Ok(latest);
        }

        // ─── GET /api/admin/telemetry/history?hours=24&deviceId=... ──────────
        /// <summary>
        /// Historial de telemetría paginado.
        /// Query params: hours (default 24), deviceId (opcional), page, pageSize.
        /// </summary>
        [HttpGet("history")]
        public async Task<IActionResult> GetHistory(
            [FromQuery] int hours      = 24,
            [FromQuery] string? deviceId = null,
            [FromQuery] int page       = 1,
            [FromQuery] int pageSize   = 100)
        {
            if (hours  < 1)   hours    = 1;
            if (hours  > 720) hours    = 720;  // max 30 días
            if (page   < 1)   page     = 1;
            if (pageSize > 500) pageSize = 500;

            var since = DateTime.UtcNow.AddHours(-hours);

            var query = _db.MotorTelemetry
                .Where(t => t.Timestamp >= since);

            if (!string.IsNullOrWhiteSpace(deviceId))
                query = query.Where(t => t.DeviceId == deviceId);

            var total = await query.CountAsync();
            var data  = await query
                .OrderByDescending(t => t.Timestamp)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToListAsync();

            return Ok(new
            {
                total,
                page,
                pageSize,
                totalPages = (int)Math.Ceiling(total / (double)pageSize),
                since,
                data
            });
        }

        // ─── GET /api/admin/telemetry/stats ───────────────────────────────────
        /// <summary>Estadísticas generales: dispositivos activos, total registros, etc.</summary>
        [HttpGet("stats")]
        public async Task<IActionResult> GetStats()
        {
            var since30s = DateTime.UtcNow.AddSeconds(-30);
            var since24h = DateTime.UtcNow.AddHours(-24);

            var totalRecords    = await _db.MotorTelemetry.CountAsync();
            var totalDevices    = await _db.MotorTelemetry.Select(t => t.DeviceId).Distinct().CountAsync();
            var activeDevices   = await _db.MotorTelemetry
                .Where(t => t.Timestamp >= since30s)
                .Select(t => t.DeviceId).Distinct().CountAsync();
            var recordsLast24h  = await _db.MotorTelemetry.Where(t => t.Timestamp >= since24h).CountAsync();

            return Ok(new
            {
                totalRecords,
                totalDevices,
                activeDevices,
                recordsLast24h,
                mqttConnected = _mqtt.IsConnected,
                timestamp     = DateTime.UtcNow
            });
        }

        // ─── GET /api/admin/telemetry/live ────────────────────────────────────
        /// <summary>
        /// Estado actual de todos los dispositivos (último registro por device).
        /// Útil para un dashboard en tiempo real.
        /// </summary>
        [HttpGet("live")]
        public async Task<IActionResult> GetLive()
        {
            // Subconsulta: último timestamp por device
            var latest = await _db.MotorTelemetry
                .GroupBy(t => t.DeviceId)
                .Select(g => g.OrderByDescending(t => t.Timestamp).First())
                .ToListAsync();

            var since30s = DateTime.UtcNow.AddSeconds(-30);
            var result = latest.Select(t => new
            {
                t.DeviceId,
                t.Speed,
                t.Current,
                t.Voltage,
                t.State,
                t.Timestamp,
                isActive = t.Timestamp >= since30s,   // compatibilidad
                isOnline = t.Timestamp >= since30s,   // campo esperado por DeviceLive
                online   = t.Timestamp >= since30s    // alias alternativo
            });

            return Ok(result);
        }
    }
}
