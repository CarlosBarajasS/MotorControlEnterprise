# Platform Design Sprint — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transformar la plataforma de monitoreo agregando alertas en tiempo real, NVR mejorado y dashboard con analítica real, con visual refresh incluido en cada módulo.

**Architecture:** Backend ASP.NET Core 8 con nuevos modelos Alert y NotificationPreferences en PostgreSQL. Frontend Angular 17 con polling cada 30s para notificaciones web, layout selector con localStorage para NVR, y dashboard con endpoint cacheado 30s.

**Tech Stack:** ASP.NET Core 8, EF Core 8, PostgreSQL 15, Angular 17 standalone signals, Resend.dev (email), Twilio (WhatsApp)

---

## FASE 1 — Backend: Modelos + Migración + Endpoints de Alertas

### Task 1: Agregar modelos Alert y NotificationPreferences

**Files:**
- Create: `backend/Models/Monitoring/Alert.cs`
- Create: `backend/Models/Monitoring/NotificationPreference.cs`
- Modify: `backend/Data/ApplicationDbContext.cs`

**Step 1: Crear modelo Alert**

```csharp
// backend/Models/Monitoring/Alert.cs
namespace MotorControlEnterprise.Api.Models;

public class Alert
{
    public int Id { get; set; }
    public int ClientId { get; set; }
    public int? CameraId { get; set; }
    public int? MotorId { get; set; }

    /// <summary>Info | Warning | Critical</summary>
    public string Severity { get; set; } = "Info";

    /// <summary>camera_offline | camera_online | gateway_offline | motor_out_of_range | broadcast</summary>
    public string Type { get; set; } = "";

    public string Message { get; set; } = "";
    public DateTime? ReadAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public Client? Client { get; set; }
    public Camera? Camera { get; set; }
}
```

**Step 2: Crear modelo NotificationPreference**

```csharp
// backend/Models/Monitoring/NotificationPreference.cs
namespace MotorControlEnterprise.Api.Models;

public class NotificationPreference
{
    public int Id { get; set; }
    public int ClientId { get; set; }

    /// <summary>camera_offline | motor_out_of_range | all | broadcast</summary>
    public string AlertType { get; set; } = "all";

    public bool EmailEnabled { get; set; } = true;
    public bool WebEnabled { get; set; } = true;
    public bool WhatsAppEnabled { get; set; } = false;
    public string? WhatsAppPhone { get; set; }
    public string? NotificationEmail { get; set; }
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public Client? Client { get; set; }
}
```

**Step 3: Registrar modelos en ApplicationDbContext**

Abrir `backend/Data/ApplicationDbContext.cs` y agregar después del último DbSet:

```csharp
public DbSet<Alert> Alerts => Set<Alert>();
public DbSet<NotificationPreference> NotificationPreferences => Set<NotificationPreference>();
```

En `OnModelCreating`, agregar configuraciones:

```csharp
modelBuilder.Entity<Alert>(e =>
{
    e.HasIndex(a => a.ClientId);
    e.HasIndex(a => a.CreatedAt);
    e.HasOne(a => a.Client).WithMany().HasForeignKey(a => a.ClientId).OnDelete(DeleteBehavior.Cascade);
    e.HasOne(a => a.Camera).WithMany().HasForeignKey(a => a.CameraId).OnDelete(DeleteBehavior.SetNull);
});

modelBuilder.Entity<NotificationPreference>(e =>
{
    e.HasIndex(a => new { a.ClientId, a.AlertType }).IsUnique();
    e.HasOne(a => a.Client).WithMany().HasForeignKey(a => a.ClientId).OnDelete(DeleteBehavior.Cascade);
});
```

**Step 4: Crear migración**

```bash
cd backend
dotnet ef migrations add AddAlertsAndNotificationPreferences
dotnet ef database update
```

Verificar que la migración se creó en `backend/Migrations/` sin errores.

**Step 5: Commit**

```bash
git add backend/Models/Monitoring/Alert.cs
git add backend/Models/Monitoring/NotificationPreference.cs
git add backend/Data/ApplicationDbContext.cs
git add backend/Migrations/
git commit -m "feat(db): add Alert and NotificationPreference models with migration"
```

---

### Task 2: AlertDispatcherService — generar alertas desde eventos MQTT/cámara

**Files:**
- Create: `backend/Services/Monitoring/IAlertDispatcherService.cs`
- Create: `backend/Services/Monitoring/AlertDispatcherService.cs`
- Modify: `backend/Program.cs`

**Step 1: Crear interfaz**

```csharp
// backend/Services/Monitoring/IAlertDispatcherService.cs
namespace MotorControlEnterprise.Api.Services;

public interface IAlertDispatcherService
{
    Task DispatchAsync(int clientId, string type, string severity, string message,
        int? cameraId = null, int? motorId = null, CancellationToken ct = default);
}
```

**Step 2: Crear implementación**

```csharp
// backend/Services/Monitoring/AlertDispatcherService.cs
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using MotorControlEnterprise.Api.Data;
using MotorControlEnterprise.Api.Models;

namespace MotorControlEnterprise.Api.Services;

public class AlertDispatcherService : IAlertDispatcherService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<AlertDispatcherService> _logger;

    public AlertDispatcherService(IServiceScopeFactory scopeFactory,
        ILogger<AlertDispatcherService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger       = logger;
    }

    public async Task DispatchAsync(int clientId, string type, string severity,
        string message, int? cameraId = null, int? motorId = null,
        CancellationToken ct = default)
    {
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            var alert = new Alert
            {
                ClientId  = clientId,
                CameraId  = cameraId,
                MotorId   = motorId,
                Severity  = severity,
                Type      = type,
                Message   = message,
                CreatedAt = DateTime.UtcNow
            };

            db.Alerts.Add(alert);
            await db.SaveChangesAsync(ct);

            _logger.LogInformation("Alert dispatched: {Type} {Severity} for client {ClientId}",
                type, severity, clientId);

            // Email/WhatsApp dispatch happens in Task 9 (fase 5)
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to dispatch alert for client {ClientId}", clientId);
        }
    }
}
```

**Step 3: Registrar en Program.cs**

En `backend/Program.cs`, agregar después de los servicios existentes:

```csharp
builder.Services.AddSingleton<IAlertDispatcherService, AlertDispatcherService>();
```

**Step 4: Commit**

```bash
git add backend/Services/Monitoring/IAlertDispatcherService.cs
git add backend/Services/Monitoring/AlertDispatcherService.cs
git add backend/Program.cs
git commit -m "feat(stream): add AlertDispatcherService for generating alerts from events"
```

---

### Task 3: AlertsController — endpoints CRUD de alertas

**Files:**
- Create: `backend/Controllers/Monitoring/AlertsController.cs`

**Step 1: Crear controller**

```csharp
// backend/Controllers/Monitoring/AlertsController.cs
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MotorControlEnterprise.Api.Data;
using MotorControlEnterprise.Api.Models;
using System.Security.Claims;
using System.IdentityModel.Tokens.Jwt;

namespace MotorControlEnterprise.Api.Controllers;

[ApiController]
[Route("api/alerts")]
[Authorize]
public class AlertsController : ControllerBase
{
    private readonly ApplicationDbContext _db;

    public AlertsController(ApplicationDbContext db) => _db = db;

    private int GetCurrentUserId()
    {
        var raw = User.FindFirstValue(JwtRegisteredClaimNames.Sub)
                  ?? User.FindFirstValue(ClaimTypes.NameIdentifier);
        return int.TryParse(raw, out var id) ? id : 0;
    }

    private string GetCurrentUserRole() =>
        User.FindFirstValue(ClaimTypes.Role) ?? "client";

    // GET /api/alerts?unread=true&limit=20
    [HttpGet]
    public async Task<IActionResult> GetAlerts(
        [FromQuery] bool unread = false,
        [FromQuery] int limit = 50,
        CancellationToken ct = default)
    {
        var userId = GetCurrentUserId();
        var role   = GetCurrentUserRole();

        IQueryable<Alert> query;

        if (role == "admin" || role == "installer")
        {
            query = _db.Alerts.AsNoTracking();
        }
        else
        {
            var clientId = await _db.Clients
                .Where(c => c.UserId == userId)
                .Select(c => (int?)c.Id)
                .FirstOrDefaultAsync(ct);

            if (clientId == null)
                return Ok(new { alerts = Array.Empty<object>(), unreadCount = 0 });

            query = _db.Alerts.AsNoTracking()
                .Where(a => a.ClientId == clientId);
        }

        if (unread)
            query = query.Where(a => a.ReadAt == null);

        var alerts = await query
            .OrderByDescending(a => a.CreatedAt)
            .Take(Math.Min(limit, 100))
            .Select(a => new
            {
                a.Id, a.Severity, a.Type, a.Message, a.ReadAt, a.CreatedAt,
                a.CameraId, a.MotorId
            })
            .ToListAsync(ct);

        var unreadCount = await query.Where(a => a.ReadAt == null).CountAsync(ct);

        return Ok(new { alerts, unreadCount });
    }

    // POST /api/alerts/mark-read
    [HttpPost("mark-read")]
    public async Task<IActionResult> MarkRead(
        [FromBody] MarkReadDto dto, CancellationToken ct)
    {
        if (dto.Ids == null || dto.Ids.Length == 0)
            return BadRequest(new { message = "No IDs provided." });

        var userId = GetCurrentUserId();
        var role   = GetCurrentUserRole();

        var query = _db.Alerts.Where(a => dto.Ids.Contains(a.Id));

        if (role != "admin" && role != "installer")
        {
            var clientId = await _db.Clients
                .Where(c => c.UserId == userId)
                .Select(c => (int?)c.Id)
                .FirstOrDefaultAsync(ct);

            if (clientId == null) return Forbid();
            query = query.Where(a => a.ClientId == clientId);
        }

        await query.Where(a => a.ReadAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(a => a.ReadAt, DateTime.UtcNow), ct);

        return Ok(new { message = "Marked as read." });
    }

    // POST /api/alerts/broadcast  [admin only]
    [HttpPost("broadcast")]
    [Authorize(Roles = "admin,installer")]
    public async Task<IActionResult> Broadcast(
        [FromBody] BroadcastDto dto, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(dto.Message))
            return BadRequest(new { message = "Message is required." });

        var clientIds = await _db.Clients
            .Where(c => c.Status == "active")
            .Select(c => c.Id)
            .ToListAsync(ct);

        var now    = DateTime.UtcNow;
        var alerts = clientIds.Select(cid => new Alert
        {
            ClientId  = cid,
            Severity  = "Critical",
            Type      = "broadcast",
            Message   = dto.Message.Trim(),
            CreatedAt = now
        });

        _db.Alerts.AddRange(alerts);
        await _db.SaveChangesAsync(ct);

        return Ok(new { message = $"Broadcast sent to {clientIds.Count} clients." });
    }
}

public record MarkReadDto(int[] Ids);
public record BroadcastDto(string Message);
```

**Step 2: Verificar compilación**

```bash
cd backend
dotnet build
```

Esperado: Build succeeded, 0 errors.

**Step 3: Commit**

```bash
git add backend/Controllers/Monitoring/AlertsController.cs
git commit -m "feat(api): add AlertsController with get, mark-read, and broadcast endpoints"
```

---

### Task 4: NotificationPreferencesController

**Files:**
- Create: `backend/Controllers/Monitoring/NotificationPreferencesController.cs`

**Step 1: Crear controller**

```csharp
// backend/Controllers/Monitoring/NotificationPreferencesController.cs
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MotorControlEnterprise.Api.Data;
using MotorControlEnterprise.Api.Models;
using System.Security.Claims;
using System.IdentityModel.Tokens.Jwt;

namespace MotorControlEnterprise.Api.Controllers;

[ApiController]
[Route("api/notification-preferences")]
[Authorize]
public class NotificationPreferencesController : ControllerBase
{
    private readonly ApplicationDbContext _db;

    public NotificationPreferencesController(ApplicationDbContext db) => _db = db;

    private async Task<int?> GetClientIdAsync(CancellationToken ct)
    {
        var raw    = User.FindFirstValue(JwtRegisteredClaimNames.Sub)
                    ?? User.FindFirstValue(ClaimTypes.NameIdentifier);
        var userId = int.TryParse(raw, out var id) ? id : 0;
        return await _db.Clients
            .Where(c => c.UserId == userId)
            .Select(c => (int?)c.Id)
            .FirstOrDefaultAsync(ct);
    }

    // GET /api/notification-preferences
    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken ct)
    {
        var clientId = await GetClientIdAsync(ct);
        if (clientId == null) return NotFound();

        var prefs = await _db.NotificationPreferences
            .AsNoTracking()
            .Where(p => p.ClientId == clientId)
            .ToListAsync(ct);

        return Ok(prefs);
    }

    // PUT /api/notification-preferences
    [HttpPut]
    public async Task<IActionResult> Upsert(
        [FromBody] UpsertPrefsDto dto, CancellationToken ct)
    {
        var clientId = await GetClientIdAsync(ct);
        if (clientId == null) return NotFound();

        var existing = await _db.NotificationPreferences
            .Where(p => p.ClientId == clientId && p.AlertType == dto.AlertType)
            .FirstOrDefaultAsync(ct);

        if (existing == null)
        {
            existing = new NotificationPreference { ClientId = clientId.Value };
            _db.NotificationPreferences.Add(existing);
        }

        existing.AlertType      = dto.AlertType;
        existing.EmailEnabled   = dto.EmailEnabled;
        existing.WebEnabled     = dto.WebEnabled;
        existing.WhatsAppEnabled = dto.WhatsAppEnabled;
        existing.WhatsAppPhone  = dto.WhatsAppPhone?.Trim();
        existing.NotificationEmail = dto.NotificationEmail?.Trim();
        existing.UpdatedAt      = DateTime.UtcNow;

        await _db.SaveChangesAsync(ct);
        return Ok(existing);
    }

    // GET /api/notification-preferences/admin/{clientId}  [admin: read-only]
    [HttpGet("admin/{clientId:int}")]
    [Authorize(Roles = "admin,installer")]
    public async Task<IActionResult> GetForClient(int clientId, CancellationToken ct)
    {
        var exists = await _db.Clients.AnyAsync(c => c.Id == clientId, ct);
        if (!exists) return NotFound();

        var prefs = await _db.NotificationPreferences
            .AsNoTracking()
            .Where(p => p.ClientId == clientId)
            .Select(p => new
            {
                p.AlertType,
                p.EmailEnabled,
                p.WebEnabled,
                p.WhatsAppEnabled,
                hasWhatsApp = p.WhatsAppPhone != null,
                p.UpdatedAt
            })
            .ToListAsync(ct);

        return Ok(prefs);
    }
}

public record UpsertPrefsDto(
    string AlertType,
    bool EmailEnabled,
    bool WebEnabled,
    bool WhatsAppEnabled,
    string? WhatsAppPhone,
    string? NotificationEmail
);
```

**Step 2: Verificar compilación y commit**

```bash
cd backend
dotnet build
git add backend/Controllers/Monitoring/NotificationPreferencesController.cs
git commit -m "feat(api): add NotificationPreferencesController with client-owned preferences"
```

---

### Task 5: DashboardController — métricas operacionales y de negocio

**Files:**
- Create: `backend/Controllers/Monitoring/DashboardController.cs`
- Modify: `backend/Program.cs` (agregar IMemoryCache si no está)

**Step 1: Verificar si IMemoryCache está registrado**

Buscar en `backend/Program.cs`:
```bash
grep -n "AddMemoryCache" backend/Program.cs
```
Si no aparece, agregar en Program.cs:
```csharp
builder.Services.AddMemoryCache();
```

**Step 2: Crear DashboardController**

```csharp
// backend/Controllers/Monitoring/DashboardController.cs
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using MotorControlEnterprise.Api.Data;

namespace MotorControlEnterprise.Api.Controllers;

[ApiController]
[Route("api/dashboard")]
[Authorize(Roles = "admin,installer")]
public class DashboardController : ControllerBase
{
    private readonly ApplicationDbContext _db;
    private readonly IMemoryCache _cache;

    public DashboardController(ApplicationDbContext db, IMemoryCache cache)
    {
        _db    = db;
        _cache = cache;
    }

    // GET /api/dashboard/summary
    [HttpGet("summary")]
    public async Task<IActionResult> GetSummary(CancellationToken ct)
    {
        const string cacheKey = "dashboard:summary";

        if (_cache.TryGetValue(cacheKey, out object? cached))
            return Ok(cached);

        var now     = DateTime.UtcNow;
        var since1m = now.AddMinutes(-1);
        var since24h = now.AddHours(-24);
        var since7d  = now.AddDays(-7);
        var todayUtc = now.Date;
        var weekAgo  = now.AddDays(-7).Date;

        // Métricas operacionales
        var totalCameras  = await _db.Cameras.AsNoTracking().CountAsync(ct);
        var onlineCameras = await _db.Cameras.AsNoTracking()
            .CountAsync(c => c.Status == "active" && c.LastSeen >= since1m, ct);

        var totalGateways  = await _db.Clients.AsNoTracking().CountAsync(ct);
        var activeGateways = await _db.Clients.AsNoTracking()
            .CountAsync(c => c.Status == "active", ct);

        var recordingsToday = await _db.Recordings.AsNoTracking()
            .CountAsync(r => r.CreatedAt >= todayUtc, ct);
        var recordingsWeek = await _db.Recordings.AsNoTracking()
            .CountAsync(r => r.CreatedAt >= weekAgo, ct);

        // Métricas de negocio
        var totalClients  = await _db.Clients.AsNoTracking().CountAsync(ct);
        var activeClients = await _db.Clients.AsNoTracking()
            .CountAsync(c => c.Status == "active", ct);

        var topClients = await _db.Clients.AsNoTracking()
            .Where(c => c.Status == "active")
            .Select(c => new
            {
                c.Id,
                c.Name,
                cameraCount = _db.Cameras.Count(cam => cam.ClientId == c.Id)
            })
            .OrderByDescending(c => c.cameraCount)
            .Take(5)
            .ToListAsync(ct);

        var storageTotalMb = await _db.Recordings.AsNoTracking()
            .SumAsync(r => (double?)r.SizeMb ?? 0, ct);

        var storageByClient = await _db.Recordings.AsNoTracking()
            .GroupBy(r => r.CameraId)
            .Select(g => new { CameraId = g.Key, SizeMb = g.Sum(r => r.SizeMb) })
            .ToListAsync(ct);

        // Alertas pendientes (no leídas)
        var unreadAlerts = await _db.Alerts.AsNoTracking()
            .CountAsync(a => a.ReadAt == null, ct);

        var summary = new
        {
            operational = new
            {
                totalCameras,
                onlineCameras,
                offlineCameras  = totalCameras - onlineCameras,
                uptimePct       = totalCameras > 0
                    ? Math.Round((double)onlineCameras / totalCameras * 100, 1)
                    : 0,
                totalGateways,
                activeGateways,
                recordingsToday,
                recordingsWeek
            },
            business = new
            {
                totalClients,
                activeClients,
                topClients,
                storageTotalMb    = Math.Round(storageTotalMb, 1),
                storageTotalGb    = Math.Round(storageTotalMb / 1024, 2),
                storageByClient
            },
            alerts = new
            {
                unreadAlerts
            },
            generatedAt = now
        };

        _cache.Set(cacheKey, summary, TimeSpan.FromSeconds(30));
        return Ok(summary);
    }
}
```

**Step 3: Compilar y commit**

```bash
cd backend
dotnet build
git add backend/Controllers/Monitoring/DashboardController.cs
git add backend/Program.cs
git commit -m "feat(api): add DashboardController with operational and business metrics (30s cache)"
```

---

## FASE 2 — Frontend: Sistema de Alertas Web

### Task 6: NotificationService — polling de alertas

**Files:**
- Create: `frontend/src/app/services/notification.service.ts`

**Step 1: Crear servicio**

```typescript
// frontend/src/app/services/notification.service.ts
import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';

const API_URL = '/api';
const POLL_INTERVAL_MS = 30_000;

export interface Alert {
    id: number;
    severity: 'Info' | 'Warning' | 'Critical';
    type: string;
    message: string;
    readAt: string | null;
    createdAt: string;
    cameraId: number | null;
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
    private http = inject(HttpClient);

    alerts      = signal<Alert[]>([]);
    unreadCount = signal<number>(0);
    loading     = signal<boolean>(false);

    isOpen = signal<boolean>(false);

    private pollTimer: any = null;

    startPolling() {
        if (this.pollTimer) return;
        this.fetchAlerts();
        this.pollTimer = setInterval(() => this.fetchAlerts(), POLL_INTERVAL_MS);
    }

    stopPolling() {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
    }

    fetchAlerts() {
        this.http.get<{ alerts: Alert[], unreadCount: number }>(
            `${API_URL}/alerts?limit=50`
        ).subscribe({
            next: (res) => {
                this.alerts.set(res.alerts ?? []);
                this.unreadCount.set(res.unreadCount ?? 0);
            },
            error: () => { /* silencioso — no interrumpir UX */ }
        });
    }

    markAllRead() {
        const unreadIds = this.alerts()
            .filter(a => !a.readAt)
            .map(a => a.id);

        if (unreadIds.length === 0) return;

        this.http.post(`${API_URL}/alerts/mark-read`, { ids: unreadIds })
            .subscribe({
                next: () => {
                    this.alerts.update(list =>
                        list.map(a => ({ ...a, readAt: new Date().toISOString() }))
                    );
                    this.unreadCount.set(0);
                }
            });
    }

    toggleDrawer() {
        const wasOpen = this.isOpen();
        this.isOpen.set(!wasOpen);
        if (!wasOpen && this.unreadCount() > 0) {
            this.markAllRead();
        }
    }
}

function inject<T>(token: any): T {
    // Angular DI — handled by @Injectable providedIn: root
    throw new Error('Use Angular DI');
}
```

> **Nota:** Reemplazar la función `inject` stub con el import correcto de Angular:

```typescript
import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
```

Y en la clase:
```typescript
private http = inject(HttpClient);
```

**Step 2: Commit**

```bash
git add frontend/src/app/services/notification.service.ts
git commit -m "feat(stream): add NotificationService with 30s polling and mark-read"
```

---

### Task 7: NotificationBellComponent — campana en navbar

**Files:**
- Create: `frontend/src/app/components/notifications/notification-bell.component.ts`
- Create: `frontend/src/app/components/notifications/notification-bell.component.html`
- Create: `frontend/src/app/components/notifications/notification-bell.component.scss`
- Modify: `frontend/src/app/app.component.html` (agregar campana en topbar admin)
- Modify: `frontend/src/app/components/client-portal/client-shell.component.ts` (campana cliente)

**Step 1: Crear componente TypeScript**

```typescript
// frontend/src/app/components/notifications/notification-bell.component.ts
import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationService } from '../../services/notification.service';

@Component({
    selector: 'app-notification-bell',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './notification-bell.component.html',
    styleUrl: './notification-bell.component.scss'
})
export class NotificationBellComponent implements OnInit, OnDestroy {
    ns = inject(NotificationService);

    ngOnInit() {
        this.ns.startPolling();
    }

    ngOnDestroy() {
        this.ns.stopPolling();
    }
}
```

**Step 2: Crear template HTML**

```html
<!-- frontend/src/app/components/notifications/notification-bell.component.html -->
<button class="bell-btn" (click)="ns.toggleDrawer()" [class.has-unread]="ns.unreadCount() > 0"
        title="Notificaciones" aria-label="Abrir notificaciones">
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
       fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
       stroke-linejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
  </svg>
  @if (ns.unreadCount() > 0) {
    <span class="badge">{{ ns.unreadCount() > 99 ? '99+' : ns.unreadCount() }}</span>
  }
</button>

<!-- Drawer de notificaciones -->
@if (ns.isOpen()) {
  <div class="drawer-backdrop" (click)="ns.toggleDrawer()"></div>
  <div class="notification-drawer">
    <div class="drawer-header">
      <h3>Notificaciones</h3>
      @if (ns.unreadCount() > 0) {
        <button class="mark-read-btn" (click)="ns.markAllRead()">
          Marcar todas como leídas
        </button>
      }
    </div>
    <div class="drawer-body">
      @if (ns.alerts().length === 0) {
        <div class="empty-state">
          <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24"
               fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
          <p>Sin notificaciones</p>
        </div>
      }
      @for (alert of ns.alerts(); track alert.id) {
        <div class="alert-item" [class.unread]="!alert.readAt"
             [class.critical]="alert.severity === 'Critical'"
             [class.warning]="alert.severity === 'Warning'">
          <div class="alert-dot" [class]="'dot-' + alert.severity.toLowerCase()"></div>
          <div class="alert-content">
            <p class="alert-message">{{ alert.message }}</p>
            <span class="alert-time">{{ alert.createdAt | date:'d MMM, HH:mm' }}</span>
          </div>
        </div>
      }
    </div>
  </div>
}
```

**Step 3: Crear estilos SCSS**

```scss
// frontend/src/app/components/notifications/notification-bell.component.scss
.bell-btn {
  position: relative;
  background: none;
  border: none;
  color: var(--nav-ink);
  cursor: pointer;
  padding: 8px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;

  &:hover { background: rgba(var(--ink-rgb), 0.08); }

  &.has-unread svg {
    color: var(--amber);
  }
}

.badge {
  position: absolute;
  top: 2px;
  right: 2px;
  background: var(--red);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  min-width: 16px;
  height: 16px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 3px;
  line-height: 1;
  animation: badge-pop 0.2s ease;
}

@keyframes badge-pop {
  0% { transform: scale(0); }
  80% { transform: scale(1.2); }
  100% { transform: scale(1); }
}

.drawer-backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
}

.notification-drawer {
  position: fixed;
  top: 60px;
  right: 16px;
  width: 360px;
  max-height: 480px;
  background: var(--surface);
  border: 1px solid var(--outline);
  border-radius: 12px;
  box-shadow: var(--shadow);
  z-index: 201;
  display: flex;
  flex-direction: column;
  overflow: hidden;

  @media (max-width: 480px) {
    right: 8px;
    left: 8px;
    width: auto;
  }
}

.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--outline);

  h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--ink);
  }
}

.mark-read-btn {
  background: none;
  border: none;
  color: var(--accent);
  font-size: 12px;
  cursor: pointer;
  padding: 0;

  &:hover { text-decoration: underline; }
}

.drawer-body {
  overflow-y: auto;
  flex: 1;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  color: var(--muted);
  gap: 12px;

  p { margin: 0; font-size: 14px; }
}

.alert-item {
  display: flex;
  gap: 12px;
  padding: 14px 20px;
  border-bottom: 1px solid var(--outline);
  transition: background 0.1s;

  &:last-child { border-bottom: none; }
  &.unread { background: rgba(var(--accent-rgb), 0.05); }
  &.critical.unread { background: rgba(var(--red-rgb), 0.06); }
  &.warning.unread { background: rgba(var(--amber-rgb), 0.06); }
  &:hover { background: rgba(var(--ink-rgb), 0.03); }
}

.alert-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-top: 6px;
  flex-shrink: 0;

  &.dot-info { background: var(--accent); }
  &.dot-warning { background: var(--amber); }
  &.dot-critical {
    background: var(--red);
    animation: pulse-dot 1.5s infinite;
  }
}

@keyframes pulse-dot {
  0%, 100% { box-shadow: 0 0 0 0 rgba(var(--red-rgb), 0.4); }
  50% { box-shadow: 0 0 0 4px rgba(var(--red-rgb), 0); }
}

.alert-content {
  flex: 1;
  min-width: 0;
}

.alert-message {
  margin: 0 0 4px;
  font-size: 13px;
  color: var(--ink);
  line-height: 1.4;
}

.alert-time {
  font-size: 11px;
  color: var(--muted);
}
```

**Step 4: Integrar campana en App shell admin**

Leer `frontend/src/app/app.component.html`. Localizar el topbar del admin (la sección con clase `topbar` o similar). Agregar el componente de campana junto a los controles de tema:

```html
<!-- En app.component.html, dentro del topbar, junto al theme toggle -->
<app-notification-bell></app-notification-bell>
```

Agregar import en `frontend/src/app/app.component.ts`:
```typescript
import { NotificationBellComponent } from './components/notifications/notification-bell.component';
```
Y en `imports: [...]` del componente.

**Step 5: Integrar campana en Client Shell**

En `frontend/src/app/components/client-portal/client-shell.component.ts`, agregar en el topbar de la misma forma. Leer el archivo primero para ver exactamente dónde va.

**Step 6: Commit**

```bash
git add frontend/src/app/components/notifications/
git add frontend/src/app/app.component.ts
git add frontend/src/app/app.component.html
git add frontend/src/app/components/client-portal/client-shell.component.ts
git commit -m "feat(camera): add NotificationBellComponent with drawer and polling"
```

---

### Task 8: AlertPreferencesComponent — preferencias del cliente

**Files:**
- Create: `frontend/src/app/components/client-portal/alert-preferences.component.ts`
- Create: `frontend/src/app/components/client-portal/alert-preferences.component.html`
- Create: `frontend/src/app/components/client-portal/alert-preferences.component.scss`
- Modify: `frontend/src/app/app.routes.ts` (agregar ruta `/client/notifications`)
- Modify: `frontend/src/app/components/client-portal/client-shell.component.ts` (agregar nav link)

**Step 1: Crear componente TypeScript**

```typescript
// frontend/src/app/components/client-portal/alert-preferences.component.ts
import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';

const API_URL = '/api';

interface Preference {
    alertType: string;
    emailEnabled: boolean;
    webEnabled: boolean;
    whatsAppEnabled: boolean;
    whatsAppPhone: string | null;
    notificationEmail: string | null;
}

const DEFAULT_TYPES = [
    { key: 'camera_offline', label: 'Cámara desconectada', severity: 'Critical' },
    { key: 'camera_online', label: 'Cámara reconectada', severity: 'Info' },
    { key: 'gateway_offline', label: 'Gateway offline', severity: 'Critical' },
    { key: 'motor_out_of_range', label: 'Motor fuera de rango', severity: 'Warning' },
    { key: 'broadcast', label: 'Mensajes del administrador', severity: 'Critical' },
];

@Component({
    selector: 'app-alert-preferences',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './alert-preferences.component.html',
    styleUrl: './alert-preferences.component.scss'
})
export class AlertPreferencesComponent implements OnInit {
    private http = inject(HttpClient);

    alertTypes = DEFAULT_TYPES;
    preferences = signal<Record<string, Preference>>({});
    saving = signal<string | null>(null);
    saved = signal<string | null>(null);

    ngOnInit() {
        this.loadPreferences();
    }

    loadPreferences() {
        this.http.get<Preference[]>(`${API_URL}/notification-preferences`).subscribe({
            next: (prefs) => {
                const map: Record<string, Preference> = {};
                // Initialize defaults
                for (const t of DEFAULT_TYPES) {
                    map[t.key] = {
                        alertType: t.key,
                        emailEnabled: true,
                        webEnabled: true,
                        whatsAppEnabled: false,
                        whatsAppPhone: null,
                        notificationEmail: null
                    };
                }
                // Override with saved prefs
                for (const p of prefs) {
                    map[p.alertType] = p;
                }
                this.preferences.set(map);
            }
        });
    }

    getPref(type: string): Preference {
        return this.preferences()[type] ?? {
            alertType: type,
            emailEnabled: true,
            webEnabled: true,
            whatsAppEnabled: false,
            whatsAppPhone: null,
            notificationEmail: null
        };
    }

    savePref(type: string, updated: Partial<Preference>) {
        const current = this.getPref(type);
        const next = { ...current, ...updated };

        this.preferences.update(map => ({ ...map, [type]: next }));
        this.saving.set(type);

        this.http.put(`${API_URL}/notification-preferences`, {
            alertType: type,
            emailEnabled: next.emailEnabled,
            webEnabled: next.webEnabled,
            whatsAppEnabled: next.whatsAppEnabled,
            whatsAppPhone: next.whatsAppPhone,
            notificationEmail: next.notificationEmail
        }).subscribe({
            next: () => {
                this.saving.set(null);
                this.saved.set(type);
                setTimeout(() => this.saved.set(null), 2000);
            },
            error: () => this.saving.set(null)
        });
    }
}
```

**Step 2: Crear template HTML**

```html
<!-- frontend/src/app/components/client-portal/alert-preferences.component.html -->
<div class="prefs-page">
  <div class="page-header">
    <h1>Notificaciones</h1>
    <p class="subtitle">Configura cómo y cuándo recibir alertas de tu sistema.</p>
  </div>

  <div class="prefs-grid">
    @for (type of alertTypes; track type.key) {
      <div class="pref-card" [class.saving]="saving() === type.key">
        <div class="pref-header">
          <div>
            <h3 class="pref-title">{{ type.label }}</h3>
            <span class="severity-badge" [class]="'sev-' + type.severity.toLowerCase()">
              {{ type.severity }}
            </span>
          </div>
          @if (saved() === type.key) {
            <span class="saved-indicator">✓ Guardado</span>
          }
        </div>

        <div class="channels">
          <label class="channel-row">
            <div class="channel-info">
              <span class="channel-icon">🌐</span>
              <div>
                <span class="channel-name">Web</span>
                <span class="channel-desc">Notificación en la plataforma</span>
              </div>
            </div>
            <input type="checkbox"
                   [checked]="getPref(type.key).webEnabled"
                   (change)="savePref(type.key, { webEnabled: $any($event.target).checked })">
          </label>

          <label class="channel-row">
            <div class="channel-info">
              <span class="channel-icon">📧</span>
              <div>
                <span class="channel-name">Email</span>
                <span class="channel-desc">Enviar al correo registrado</span>
              </div>
            </div>
            <input type="checkbox"
                   [checked]="getPref(type.key).emailEnabled"
                   (change)="savePref(type.key, { emailEnabled: $any($event.target).checked })">
          </label>

          @if (type.severity === 'Critical') {
            <label class="channel-row">
              <div class="channel-info">
                <span class="channel-icon">💬</span>
                <div>
                  <span class="channel-name">WhatsApp</span>
                  <span class="channel-desc">Solo alertas críticas</span>
                </div>
              </div>
              <input type="checkbox"
                     [checked]="getPref(type.key).whatsAppEnabled"
                     (change)="savePref(type.key, { whatsAppEnabled: $any($event.target).checked })">
            </label>

            @if (getPref(type.key).whatsAppEnabled) {
              <div class="phone-row">
                <input type="tel"
                       placeholder="+52 55 1234 5678"
                       class="phone-input"
                       [value]="getPref(type.key).whatsAppPhone ?? ''"
                       (blur)="savePref(type.key, { whatsAppPhone: $any($event.target).value || null })">
              </div>
            }
          }
        </div>
      </div>
    }
  </div>
</div>
```

**Step 3: SCSS**

```scss
// frontend/src/app/components/client-portal/alert-preferences.component.scss
.prefs-page {
  padding: 24px;
  max-width: 800px;
}

.page-header {
  margin-bottom: 32px;

  h1 {
    font-size: 24px;
    font-weight: 700;
    color: var(--ink);
    margin: 0 0 8px;
  }

  .subtitle {
    color: var(--muted);
    font-size: 14px;
    margin: 0;
  }
}

.prefs-grid {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.pref-card {
  background: var(--surface);
  border: 1px solid var(--outline);
  border-radius: 12px;
  padding: 20px;
  transition: opacity 0.2s;

  &.saving { opacity: 0.7; }
}

.pref-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
}

.pref-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--ink);
  margin: 0 0 6px;
}

.severity-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;

  &.sev-critical { background: rgba(var(--red-rgb), 0.15); color: var(--red); }
  &.sev-warning  { background: rgba(var(--amber-rgb), 0.15); color: var(--amber); }
  &.sev-info     { background: rgba(var(--accent-rgb), 0.15); color: var(--accent); }
}

.saved-indicator {
  font-size: 12px;
  color: var(--green);
  font-weight: 600;
}

.channels {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.channel-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.1s;

  &:hover { background: rgba(var(--ink-rgb), 0.04); }
}

.channel-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.channel-icon {
  font-size: 18px;
  width: 28px;
  text-align: center;
}

.channel-name {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: var(--ink);
}

.channel-desc {
  display: block;
  font-size: 12px;
  color: var(--muted);
}

input[type="checkbox"] {
  width: 18px;
  height: 18px;
  accent-color: var(--accent);
  cursor: pointer;
}

.phone-row {
  padding: 4px 12px 8px 52px;
}

.phone-input {
  width: 100%;
  max-width: 240px;
  background: var(--bg);
  border: 1px solid var(--outline);
  border-radius: 8px;
  padding: 8px 12px;
  color: var(--ink);
  font-size: 14px;

  &::placeholder { color: var(--muted); }
  &:focus {
    outline: none;
    border-color: var(--accent);
  }
}
```

**Step 4: Agregar ruta y nav link**

En `frontend/src/app/app.routes.ts`, dentro del bloque de rutas de cliente (`/client/`):
```typescript
{ path: 'notifications', loadComponent: () => import('./components/client-portal/alert-preferences.component').then(m => m.AlertPreferencesComponent) },
```

En `client-shell.component.ts`, agregar en la lista de navegación:
```html
<a routerLink="/client/notifications" routerLinkActive="active">
  <svg ...></svg> <!-- Ícono de campana -->
  Notificaciones
</a>
```

**Step 5: Commit**

```bash
git add frontend/src/app/components/client-portal/alert-preferences.component.ts
git add frontend/src/app/components/client-portal/alert-preferences.component.html
git add frontend/src/app/components/client-portal/alert-preferences.component.scss
git add frontend/src/app/app.routes.ts
git add frontend/src/app/components/client-portal/client-shell.component.ts
git commit -m "feat(camera): add AlertPreferencesComponent with per-type channel control"
```

---

## FASE 3 — NVR Mejorado (Admin + Cliente)

### Task 9: NVR mejorado — Portal Cliente

**Files:**
- Modify: `frontend/src/app/components/client-portal/client-cameras.component.ts`
- Modify: `frontend/src/app/components/client-portal/client-cameras.component.html` (si existe separado)
- Modify: `frontend/src/app/components/client-portal/client-cameras.component.scss` (si existe separado)

**Step 1: Leer el archivo actual**

```bash
cat frontend/src/app/components/client-portal/client-cameras.component.ts
```

**Step 2: Cambios a hacer en el TypeScript**

Agregar signal para layout (con persistencia) y fullscreen:

```typescript
// Agregar a las propiedades del componente
layout = signal<'1x1' | '2x2' | '3x3' | '4x4'>(
    (localStorage.getItem('nvr_layout') as any) ?? '2x2'
);
fullscreenCamera = signal<any | null>(null);

// Computed: columnas CSS según layout
gridCols = computed(() => {
    const map: Record<string, number> = { '1x1': 1, '2x2': 2, '3x3': 3, '4x4': 4 };
    return map[this.layout()] ?? 2;
});

setLayout(l: '1x1' | '2x2' | '3x3' | '4x4') {
    this.layout.set(l);
    localStorage.setItem('nvr_layout', l);
}

openFullscreen(camera: any) {
    this.fullscreenCamera.set(camera);
}

closeFullscreen() {
    this.fullscreenCamera.set(null);
}

// Keyboard ESC handler
@HostListener('document:keydown.escape')
onEsc() { this.closeFullscreen(); }

// isOnline helper
isOnline(camera: any): boolean {
    if (!camera.lastSeen) return false;
    const diff = Date.now() - new Date(camera.lastSeen).getTime();
    return diff < 90_000; // 90 segundos
}
```

**Step 3: Template HTML actualizado**

Reemplazar la sección del grid con:

```html
<!-- Header NVR -->
<div class="nvr-header">
  <div class="nvr-stats">
    <span class="online-count">
      <span class="status-dot online"></span>
      {{ cameras().filter(isOnline).length }} en línea
    </span>
    <span class="total-count">/ {{ cameras().length }} total</span>
  </div>
  <div class="layout-selector">
    @for (opt of ['1x1','2x2','3x3','4x4']; track opt) {
      <button class="layout-btn" [class.active]="layout() === opt"
              (click)="setLayout($any(opt))" [title]="opt + ' grid'">
        <app-grid-icon [cols]="opt"></app-grid-icon>
      </button>
    }
  </div>
</div>

<!-- Grid -->
<div class="nvr-grid" [style.--cols]="gridCols()">
  @for (camera of cameras(); track camera.id) {
    <div class="nvr-tile" [class.offline]="!isOnline(camera)">
      <div class="tile-overlay top">
        <span class="live-badge" [class.offline]="!isOnline(camera)">
          {{ isOnline(camera) ? 'EN VIVO' : 'OFFLINE' }}
        </span>
        @if (camera.isRecording) {
          <span class="rec-badge">● REC</span>
        }
      </div>

      <app-camera-viewer [streamUrl]="getCameraStreamUrl(camera)">
      </app-camera-viewer>

      <div class="tile-overlay bottom">
        <span class="camera-name">{{ camera.name }}</span>
        <div class="tile-actions">
          <button class="tile-btn" (click)="openFullscreen(camera)" title="Pantalla completa">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
                 fill="none" stroke="currentColor" stroke-width="2">
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  }

  <!-- Placeholder para slots vacíos en grids grandes -->
  @for (slot of getEmptySlots(); track slot) {
    <div class="nvr-tile placeholder">
      <div class="placeholder-content">
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" stroke-width="1" opacity="0.3">
          <path d="M15 10l4.553-2.069A1 1 0 0 1 21 8.82v6.36a1 1 0 0 1-1.447.89L15 14M3 8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z"/>
        </svg>
        <span>Sin cámara</span>
      </div>
    </div>
  }
</div>

<!-- Fullscreen Overlay -->
@if (fullscreenCamera()) {
  <div class="fullscreen-overlay" (click)="closeFullscreen()">
    <div class="fullscreen-container" (click)="$event.stopPropagation()">
      <div class="fullscreen-header">
        <span class="fullscreen-title">{{ fullscreenCamera()!.name }}</span>
        <button class="close-btn" (click)="closeFullscreen()">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
               fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <app-camera-viewer [streamUrl]="getCameraStreamUrl(fullscreenCamera()!)">
      </app-camera-viewer>
    </div>
  </div>
}
```

Agregar helper:
```typescript
getEmptySlots(): number[] {
    const capacity = this.gridCols() * this.gridCols();
    const count    = this.cameras().length;
    const empties  = Math.max(0, capacity - count);
    return Array.from({ length: empties }, (_, i) => i);
}
```

**Step 4: SCSS clave para el NVR**

```scss
.nvr-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-bottom: 1px solid var(--outline);
}

.status-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 6px;
  background: var(--red);

  &.online {
    background: var(--green);
    animation: pulse-dot 2s infinite;
  }
}

@keyframes pulse-dot {
  0%, 100% { box-shadow: 0 0 0 0 rgba(var(--green-rgb), 0.4); }
  50%      { box-shadow: 0 0 0 4px rgba(var(--green-rgb), 0); }
}

.layout-selector { display: flex; gap: 4px; }

.layout-btn {
  padding: 6px 8px;
  background: none;
  border: 1px solid var(--outline);
  border-radius: 6px;
  color: var(--muted);
  cursor: pointer;
  transition: all 0.15s;

  &.active, &:hover {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }
}

.nvr-grid {
  display: grid;
  grid-template-columns: repeat(var(--cols, 2), 1fr);
  gap: 8px;
  padding: 16px;
  flex: 1;
}

.nvr-tile {
  position: relative;
  background: #000;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--outline);
  aspect-ratio: 16/9;
  transition: border-color 0.2s;

  &.offline { border-color: rgba(var(--red-rgb), 0.4); }
  &.placeholder {
    background: var(--surface);
    border-style: dashed;
  }
}

.tile-overlay {
  position: absolute;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  z-index: 10;
  pointer-events: none;

  &.top    { top: 0; background: linear-gradient(to bottom, rgba(0,0,0,0.5), transparent); }
  &.bottom { bottom: 0; background: linear-gradient(to top, rgba(0,0,0,0.6), transparent); pointer-events: all; }
}

.live-badge {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1px;
  padding: 2px 7px;
  border-radius: 4px;
  background: rgba(var(--green-rgb), 0.85);
  color: #fff;
  text-transform: uppercase;

  &.offline { background: rgba(var(--red-rgb), 0.85); }
}

.rec-badge {
  font-size: 10px;
  font-weight: 600;
  color: var(--red);
  animation: blink 1s infinite;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.3; }
}

.camera-name {
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  text-shadow: 0 1px 3px rgba(0,0,0,0.8);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: calc(100% - 36px);
}

.tile-btn {
  background: rgba(255,255,255,0.15);
  border: none;
  border-radius: 4px;
  padding: 5px;
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(4px);
  transition: background 0.15s;

  &:hover { background: rgba(255,255,255,0.3); }
}

.placeholder-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--muted);
  gap: 8px;
  font-size: 12px;
}

// Fullscreen overlay
.fullscreen-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.92);
  z-index: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.fullscreen-container {
  width: 100%;
  max-width: 1200px;
  background: #000;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--outline);
}

.fullscreen-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--nav);
}

.fullscreen-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--nav-ink);
}

.close-btn {
  background: none;
  border: none;
  color: var(--nav-muted);
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  border-radius: 6px;
  transition: color 0.15s;

  &:hover { color: var(--nav-ink); }
}
```

**Step 5: Commit**

```bash
git add frontend/src/app/components/client-portal/client-cameras.component.*
git commit -m "feat(camera): upgrade client NVR with 4x4 layouts, status tiles, and fullscreen overlay"
```

---

### Task 10: NVR mejorado — Portal Admin

**Files:**
- Modify: `frontend/src/app/components/cameras/cameras.component.ts`

Aplicar los mismos cambios del Task 9 al componente admin de cámaras:
- Agregar `layout signal` con `localStorage` persistence
- Agregar `fullscreenCamera signal`
- Agregar `gridCols computed`
- Agregar `setLayout()`, `openFullscreen()`, `closeFullscreen()`, `onEsc()`, `isOnline()`, `getEmptySlots()`
- Actualizar template con header NVR, grid dinámico, tiles con overlays, fullscreen overlay
- Aplicar mismos estilos SCSS

**Step 1:** Leer el archivo actual: `frontend/src/app/components/cameras/cameras.component.ts`

**Step 2:** Aplicar todos los cambios del Task 9 con las adaptaciones necesarias (el admin usa diferentes endpoints y puede ver todas las cámaras, no solo las del cliente).

**Step 3: Commit**

```bash
git add frontend/src/app/components/cameras/cameras.component.*
git commit -m "feat(camera): upgrade admin NVR with layout selector, status indicators, and fullscreen"
```

---

## FASE 4 — Dashboard con Analítica Real

### Task 11: DashboardComponent — reemplazar dashboard vacío

**Files:**
- Modify: `frontend/src/app/components/dashboard/dashboard.component.ts`

**Step 1:** Leer el archivo actual para entender qué ya existe.

**Step 2: Agregar carga de summary**

```typescript
// Agregar a las propiedades
summary = signal<any | null>(null);
loadingSummary = signal(true);

// En ngOnInit o método de carga:
loadDashboard() {
    this.loadingSummary.set(true);
    this.http.get<any>('/api/dashboard/summary').subscribe({
        next: (data) => {
            this.summary.set(data);
            this.loadingSummary.set(false);
        },
        error: () => this.loadingSummary.set(false)
    });
}
```

**Step 3: Template — stat cards y métricas**

Agregar sección en el template:

```html
<!-- System Status Banner -->
@if (summary()) {
  <div class="system-banner" [class.healthy]="summary().operational.offlineCameras === 0">
    <div class="banner-dot"></div>
    <span>
      @if (summary().operational.offlineCameras === 0) {
        Todos los sistemas operativos
      } @else {
        {{ summary().operational.offlineCameras }} cámara(s) offline
      }
    </span>
    <span class="banner-time">Actualizado {{ summary().generatedAt | date:'HH:mm:ss' }}</span>
  </div>

  <!-- Stat Cards — Operacionales -->
  <div class="stat-grid">
    <div class="stat-card">
      <div class="stat-icon cameras">
        <svg ...></svg>
      </div>
      <div class="stat-body">
        <span class="stat-value">{{ summary().operational.onlineCameras }}/{{ summary().operational.totalCameras }}</span>
        <span class="stat-label">Cámaras en línea</span>
        <span class="stat-sub">{{ summary().operational.uptimePct }}% uptime</span>
      </div>
    </div>

    <div class="stat-card">
      <div class="stat-icon gateways"><!-- ícono --></div>
      <div class="stat-body">
        <span class="stat-value">{{ summary().operational.activeGateways }}/{{ summary().operational.totalGateways }}</span>
        <span class="stat-label">Gateways activos</span>
      </div>
    </div>

    <div class="stat-card">
      <div class="stat-icon recordings"><!-- ícono --></div>
      <div class="stat-body">
        <span class="stat-value">{{ summary().operational.recordingsToday }}</span>
        <span class="stat-label">Grabaciones hoy</span>
        <span class="stat-sub">{{ summary().operational.recordingsWeek }} esta semana</span>
      </div>
    </div>

    <div class="stat-card">
      <div class="stat-icon clients"><!-- ícono --></div>
      <div class="stat-body">
        <span class="stat-value">{{ summary().business.activeClients }}/{{ summary().business.totalClients }}</span>
        <span class="stat-label">Clientes activos</span>
      </div>
    </div>
  </div>

  <!-- Storage Bar -->
  <div class="storage-card">
    <div class="storage-header">
      <h3>Almacenamiento</h3>
      <span>{{ summary().business.storageTotalGb }} GB usados</span>
    </div>
    <div class="storage-bar">
      <div class="storage-fill" [style.width]="getStoragePct() + '%'"></div>
    </div>
  </div>

  <!-- Top Clients Table -->
  <div class="top-clients-card">
    <h3>Top clientes por cámaras</h3>
    <table class="clients-table">
      <thead>
        <tr><th>Cliente</th><th>Cámaras</th></tr>
      </thead>
      <tbody>
        @for (client of summary().business.topClients; track client.id) {
          <tr>
            <td>{{ client.name }}</td>
            <td>{{ client.cameraCount }}</td>
          </tr>
        }
      </tbody>
    </table>
  </div>
}

<!-- Empty state si no hay datos -->
@if (!loadingSummary() && !summary()) {
  <div class="empty-dashboard">
    <svg ...></svg>
    <p>No se pudieron cargar las métricas</p>
    <button (click)="loadDashboard()">Reintentar</button>
  </div>
}
```

**Step 4: SCSS para dashboard**

```scss
.system-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 20px;
  border-radius: 10px;
  background: rgba(var(--red-rgb), 0.1);
  border: 1px solid rgba(var(--red-rgb), 0.2);
  margin-bottom: 20px;
  font-size: 14px;
  color: var(--ink);

  &.healthy {
    background: rgba(var(--green-rgb), 0.08);
    border-color: rgba(var(--green-rgb), 0.2);
  }

  .banner-time {
    margin-left: auto;
    font-size: 12px;
    color: var(--muted);
  }
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 20px;
}

.stat-card {
  background: var(--surface);
  border: 1px solid var(--outline);
  border-radius: 12px;
  padding: 20px;
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

.stat-value {
  display: block;
  font-size: 28px;
  font-weight: 700;
  color: var(--ink);
  font-family: 'Space Grotesk', sans-serif;
  line-height: 1;
  margin-bottom: 4px;
}

.stat-label {
  display: block;
  font-size: 13px;
  color: var(--muted);
  margin-bottom: 2px;
}

.stat-sub {
  display: block;
  font-size: 12px;
  color: var(--accent);
}

.storage-card,
.top-clients-card {
  background: var(--surface);
  border: 1px solid var(--outline);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 16px;

  h3 {
    font-size: 15px;
    font-weight: 600;
    color: var(--ink);
    margin: 0 0 16px;
  }
}

.storage-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 10px;
  font-size: 13px;
  color: var(--muted);
}

.storage-bar {
  height: 8px;
  background: rgba(var(--ink-rgb), 0.08);
  border-radius: 4px;
  overflow: hidden;
}

.storage-fill {
  height: 100%;
  background: var(--accent);
  border-radius: 4px;
  transition: width 0.6s ease;
}

.clients-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;

  th {
    text-align: left;
    padding: 8px 12px;
    color: var(--muted);
    font-weight: 500;
    border-bottom: 1px solid var(--outline);
  }

  td {
    padding: 10px 12px;
    color: var(--ink);
    border-bottom: 1px solid rgba(var(--outline), 0.5);
  }

  tr:last-child td { border-bottom: none; }
  tr:hover td { background: rgba(var(--ink-rgb), 0.03); }
}
```

**Step 5: Commit**

```bash
git add frontend/src/app/components/dashboard/dashboard.component.*
git commit -m "feat(api): upgrade dashboard with real-time operational and business metrics"
```

---

## FASE 5 — Email + WhatsApp Dispatch

### Task 12: Email dispatch desde AlertDispatcherService

**Files:**
- Modify: `backend/Services/Monitoring/AlertDispatcherService.cs`
- Modify: `backend/Services/Shared/IEmailService.cs`
- Modify: `backend/Services/Shared/ResendEmailService.cs`

**Step 1: Agregar método a IEmailService**

```csharp
Task SendAlertAsync(string toEmail, string toName, string alertType,
    string severity, string message, CancellationToken ct = default);
```

**Step 2: Implementar en ResendEmailService**

Agregar método que envía un email de alerta con template HTML sencillo. Usar el patrón existente del servicio.

**Step 3: Integrar en AlertDispatcherService**

Después de guardar la alerta, consultar preferencias del cliente y enviar email si:
- `severity == "Warning"` o `severity == "Critical"`
- `pref.EmailEnabled == true` para ese `alertType`

```csharp
// En DispatchAsync, después de SaveChangesAsync:
if (severity == "Warning" || severity == "Critical")
{
    var emailService = scope.ServiceProvider.GetRequiredService<IEmailService>();
    var prefs = await db.NotificationPreferences
        .Where(p => p.ClientId == clientId &&
               (p.AlertType == type || p.AlertType == "all"))
        .FirstOrDefaultAsync(ct);

    if (prefs?.EmailEnabled != false)
    {
        var client = await db.Clients
            .Include(c => c.User)
            .FirstOrDefaultAsync(c => c.Id == clientId, ct);

        if (client?.User?.Email != null)
        {
            var emailAddr = prefs?.NotificationEmail ?? client.User.Email;
            await emailService.SendAlertAsync(
                emailAddr, client.Name, type, severity, message, ct);
        }
    }
}
```

**Step 4: Commit**

```bash
git add backend/Services/Shared/IEmailService.cs
git add backend/Services/Shared/ResendEmailService.cs
git add backend/Services/Monitoring/AlertDispatcherService.cs
git commit -m "feat(api): integrate email dispatch in AlertDispatcherService for Warning/Critical alerts"
```

---

### Task 13: WhatsApp dispatch con Twilio

**Files:**
- Modify: `backend/MotorControlEnterprise.Api.csproj` (agregar Twilio SDK)
- Create: `backend/Services/Shared/IWhatsAppService.cs`
- Create: `backend/Services/Shared/TwilioWhatsAppService.cs`
- Modify: `backend/Services/Monitoring/AlertDispatcherService.cs`
- Modify: `backend/Program.cs`

**Step 1: Agregar Twilio NuGet**

```bash
cd backend
dotnet add package Twilio --version 7.*
```

**Step 2: Crear interfaz**

```csharp
// backend/Services/Shared/IWhatsAppService.cs
namespace MotorControlEnterprise.Api.Services;

public interface IWhatsAppService
{
    Task SendAlertAsync(string toPhone, string message, CancellationToken ct = default);
}
```

**Step 3: Implementar TwilioWhatsAppService**

```csharp
// backend/Services/Shared/TwilioWhatsAppService.cs
using Twilio;
using Twilio.Rest.Api.V2010.Account;
using Twilio.Types;

namespace MotorControlEnterprise.Api.Services;

public class TwilioWhatsAppService : IWhatsAppService
{
    private readonly string _from;
    private readonly ILogger<TwilioWhatsAppService> _logger;

    public TwilioWhatsAppService(IConfiguration config,
        ILogger<TwilioWhatsAppService> logger)
    {
        _logger = logger;
        var sid   = config["Twilio:AccountSid"] ?? "";
        var token = config["Twilio:AuthToken"] ?? "";
        _from     = config["Twilio:FromNumber"] ?? "whatsapp:+14155238886"; // sandbox
        if (!string.IsNullOrEmpty(sid) && !string.IsNullOrEmpty(token))
            TwilioClient.Init(sid, token);
    }

    public async Task SendAlertAsync(string toPhone, string message,
        CancellationToken ct = default)
    {
        try
        {
            var msg = await MessageResource.CreateAsync(
                to:   new PhoneNumber($"whatsapp:{toPhone}"),
                from: new PhoneNumber(_from),
                body: $"🔔 NIRM GROUP — Alerta de seguridad:\n{message}"
            );
            _logger.LogInformation("WhatsApp sent to {Phone}: {Sid}", toPhone, msg.Sid);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "WhatsApp send failed to {Phone}", toPhone);
        }
    }
}
```

**Step 4: Registrar en Program.cs**

```csharp
builder.Services.AddScoped<IWhatsAppService, TwilioWhatsAppService>();
```

**Step 5: Integrar en AlertDispatcherService**

Agregar envío de WhatsApp solo si `severity == "Critical"` y `prefs.WhatsAppEnabled && prefs.WhatsAppPhone != null`.

**Step 6: Agregar configuración en appsettings**

En `backend/appsettings.json`:
```json
"Twilio": {
  "AccountSid": "",
  "AuthToken": "",
  "FromNumber": "whatsapp:+14155238886"
}
```

**Step 7: Compilar y commit**

```bash
cd backend && dotnet build
git add backend/MotorControlEnterprise.Api.csproj
git add backend/Services/Shared/IWhatsAppService.cs
git add backend/Services/Shared/TwilioWhatsAppService.cs
git add backend/Services/Monitoring/AlertDispatcherService.cs
git add backend/Program.cs
git add backend/appsettings.json
git commit -m "feat(api): integrate Twilio WhatsApp for Critical alerts with preference gating"
```

---

## FASE 6 — Visual Refresh Transversal

### Task 14: Status dots en listas de cámaras y gateways

**Files:**
- Modify: `frontend/src/app/components/cameras/cameras.component.html` (si es inline template)
- Modify: `frontend/src/app/components/gateways/gateways.component.html`
- Modify: `frontend/src/styles.scss` (agregar utilidades globales)

**Step 1: Agregar clases globales en styles.scss**

```scss
// Status indicators — usar en toda la app
.status-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;

  &.online  {
    background: #22c55e;
    animation: pulse-online 2s infinite;
  }
  &.offline  { background: #ef4444; }
  &.warning  { background: #f59e0b; }
  &.inactive { background: var(--muted); }
}

@keyframes pulse-online {
  0%, 100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.4); }
  50%       { box-shadow: 0 0 0 4px rgba(34, 197, 94, 0); }
}

// Empty state reutilizable
.empty-state-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 24px;
  color: var(--muted);
  text-align: center;
  gap: 12px;

  svg { opacity: 0.4; }
  p   { margin: 0; font-size: 14px; }
  small { font-size: 12px; opacity: 0.7; }
}
```

**Step 2: Aplicar status dots en listas**

Para cada lista (cámaras, gateways, clientes), reemplazar indicadores de estado de texto por:
```html
<span class="status-dot" [class.online]="item.status === 'active'"
                          [class.offline]="item.status !== 'active'"></span>
```

**Step 3: Agregar empty states**

Para cada página que pueda mostrar lista vacía, agregar:
```html
@if (items().length === 0 && !loading()) {
  <div class="empty-state-container">
    <!-- Ícono contextual SVG -->
    <p>No hay [elemento] registrados</p>
    <small>Agrega uno usando el botón superior</small>
  </div>
}
```

**Step 4: Fix badge EN VIVO en modo claro**

Verificar que la clase `.live-badge` use `rgba(var(--green-rgb), 0.85)` como fondo (no variable de color del tema), y el texto sea siempre `#fff`. Esto garantiza visibilidad en modo claro y oscuro.

**Step 5: Commit**

```bash
git add frontend/src/styles.scss
git add frontend/src/app/components/
git commit -m "feat(camera): add global status dots, empty states, and fix live badge visibility"
```

---

## FASE 7 — Deploy

### Task 15: Verificar compilación completa y deploy

**Step 1: Compilar backend**
```bash
cd backend && dotnet build
```
Esperado: 0 errores.

**Step 2: Compilar frontend**
```bash
cd frontend && npm run build
```
Esperado: 0 errores.

**Step 3: Commit final si quedan cambios**

```bash
git status
# Si hay cambios sin commit:
git add -A
git commit -m "chore(infra): final adjustments before sprint deploy"
```

**Step 4: Invocar /devops para deploy**

```
/devops Deploy sprint Platform Completeness v1.0
```

---

## Resumen de archivos nuevos/modificados

### Backend — Nuevos
| Archivo | Descripción |
|---------|-------------|
| `Models/Monitoring/Alert.cs` | Modelo de alerta |
| `Models/Monitoring/NotificationPreference.cs` | Preferencias de notificación |
| `Controllers/Monitoring/AlertsController.cs` | CRUD alertas + broadcast |
| `Controllers/Monitoring/NotificationPreferencesController.cs` | Preferencias cliente |
| `Controllers/Monitoring/DashboardController.cs` | Métricas dashboard |
| `Services/Monitoring/IAlertDispatcherService.cs` | Interfaz dispatcher |
| `Services/Monitoring/AlertDispatcherService.cs` | Lógica de dispatch |
| `Services/Shared/IWhatsAppService.cs` | Interfaz WhatsApp |
| `Services/Shared/TwilioWhatsAppService.cs` | Implementación Twilio |
| `Migrations/AddAlertsAndNotificationPreferences` | Migración EF Core |

### Backend — Modificados
| Archivo | Cambio |
|---------|--------|
| `Data/ApplicationDbContext.cs` | Agregar DbSets + configuraciones |
| `Services/Shared/IEmailService.cs` | Agregar SendAlertAsync |
| `Services/Shared/ResendEmailService.cs` | Implementar SendAlertAsync |
| `Program.cs` | Registrar nuevos servicios |
| `appsettings.json` | Sección Twilio |
| `MotorControlEnterprise.Api.csproj` | Package Twilio |

### Frontend — Nuevos
| Archivo | Descripción |
|---------|-------------|
| `services/notification.service.ts` | Polling 30s, mark-read |
| `components/notifications/notification-bell.component.*` | Campana + drawer |
| `components/client-portal/alert-preferences.component.*` | Preferencias cliente |

### Frontend — Modificados
| Archivo | Cambio |
|---------|--------|
| `app.component.ts/.html` | Integrar campana en navbar admin |
| `components/client-portal/client-shell.component.ts` | Campana + nav link notificaciones |
| `components/client-portal/client-cameras.component.*` | NVR 4×4, fullscreen, tiles |
| `components/cameras/cameras.component.*` | NVR admin mejorado |
| `components/dashboard/dashboard.component.*` | Dashboard analítica real |
| `app.routes.ts` | Ruta /client/notifications |
| `src/styles.scss` | Status dots globales, empty states |
