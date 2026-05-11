# Installer Client Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir al rol `installer` crear clientes con acceso por email, ver sus propios clientes, acceder a clientes ajenos bajo auditoría, y al admin ver un log de todas las acciones.

**Architecture:** Se agrega `InstallerCreatedById` (FK nullable) al modelo `Client` y una nueva tabla `AuditLogs`. El `ClientController` cambia de `[Authorize(Roles="admin")]` a `[Authorize(Roles="admin,installer")]` con checks de ownership inline. Un nuevo `AuditLogController` expone el log paginado solo a admin. En el frontend, `ClientsComponent` agrega tabs "Mis clientes"/"Todos", badge en clientes ajenos y oculta botones destructivos.

**Tech Stack:** ASP.NET Core 8, EF Core 8, PostgreSQL 15, Angular 17 standalone, SCSS variables CSS

---

## Task 1: Modelos de datos — AuditLog + Client.InstallerCreatedById

**Files:**
- Create: `backend/Models/Shared/AuditLog.cs`
- Modify: `backend/Models/Monitoring/Client.cs`

- [ ] **Step 1: Crear AuditLog.cs**

```csharp
// backend/Models/Shared/AuditLog.cs
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MotorControlEnterprise.Api.Models.Shared;

public class AuditLog
{
    public int Id { get; set; }

    public int UserId { get; set; }
    public User User { get; set; } = null!;

    [Required, MaxLength(50)]
    public string Action { get; set; } = null!;

    [Required, MaxLength(30)]
    public string EntityType { get; set; } = null!;

    public int? EntityId { get; set; }

    [Column(TypeName = "jsonb")]
    public string? Details { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
```

- [ ] **Step 2: Agregar InstallerCreatedById a Client.cs**

Abrir `backend/Models/Monitoring/Client.cs`. Después de la propiedad `UserId`/`User` (aprox. línea 57-59), agregar:

```csharp
[Column("installer_created_by_id")]
public int? InstallerCreatedById { get; set; }
public User? InstallerCreatedBy { get; set; }
```

- [ ] **Step 3: Commit**

```bash
git add backend/Models/Shared/AuditLog.cs backend/Models/Monitoring/Client.cs
git commit -m "feat(auth): agregar modelo AuditLog e InstallerCreatedById en Client"
```

---

## Task 2: DbContext + AuditService + registro en Program.cs

**Files:**
- Modify: `backend/Data/ApplicationDbContext.cs`
- Create: `backend/Services/Shared/AuditService.cs`
- Modify: `backend/Program.cs`

- [ ] **Step 1: Agregar DbSet y configuración en ApplicationDbContext.cs**

En la sección de DbSets (líneas 13-21), agregar:
```csharp
public DbSet<AuditLog> AuditLogs { get; set; }
```

Al final de `OnModelCreating()`, antes del cierre `}`, agregar:
```csharp
// AuditLog
modelBuilder.Entity<AuditLog>(e =>
{
    e.HasIndex(a => a.UserId);
    e.HasIndex(a => a.Action);
    e.HasIndex(a => a.CreatedAt);
    e.HasOne(a => a.User)
     .WithMany()
     .HasForeignKey(a => a.UserId)
     .OnDelete(DeleteBehavior.Cascade);
});

// Client.InstallerCreatedBy
modelBuilder.Entity<Client>()
    .HasOne(c => c.InstallerCreatedBy)
    .WithMany()
    .HasForeignKey(c => c.InstallerCreatedById)
    .OnDelete(DeleteBehavior.SetNull);
```

- [ ] **Step 2: Crear AuditService.cs**

```csharp
// backend/Services/Shared/AuditService.cs
using MotorControlEnterprise.Api.Data;
using MotorControlEnterprise.Api.Models.Shared;
using System.Text.Json;

namespace MotorControlEnterprise.Api.Services;

public class AuditService
{
    private readonly ApplicationDbContext _db;

    public AuditService(ApplicationDbContext db) => _db = db;

    public async Task LogAsync(
        int userId,
        string action,
        string entityType,
        int? entityId = null,
        object? details = null)
    {
        _db.AuditLogs.Add(new AuditLog
        {
            UserId     = userId,
            Action     = action,
            EntityType = entityType,
            EntityId   = entityId,
            Details    = details is null ? null : JsonSerializer.Serialize(details),
            CreatedAt  = DateTime.UtcNow
        });
        await _db.SaveChangesAsync();
    }
}
```

- [ ] **Step 3: Registrar AuditService en Program.cs**

Después de la línea `builder.Services.AddScoped<MotorControlEnterprise.Api.Services.AlertService>();` (~línea 41), agregar:

```csharp
builder.Services.AddScoped<MotorControlEnterprise.Api.Services.AuditService>();
```

- [ ] **Step 4: Commit**

```bash
git add backend/Data/ApplicationDbContext.cs backend/Services/Shared/AuditService.cs backend/Program.cs
git commit -m "feat(auth): AuditService + DbSet AuditLogs + InstallerCreatedBy relation"
```

---

## Task 3: Migración EF Core

**Files:**
- Create: `backend/Migrations/<timestamp>_AddInstallerOwnershipAndAuditLog.cs` (generado automáticamente)

- [ ] **Step 1: Generar la migración**

```bash
cd C:\dev\MotorControlEnterprise\backend
dotnet ef migrations add AddInstallerOwnershipAndAuditLog
```

Expected output: `Done. To undo this action, use 'ef migrations remove'`

- [ ] **Step 2: Aplicar la migración**

```bash
dotnet ef database update
```

Expected output: `Applying migration '..._AddInstallerOwnershipAndAuditLog'. Done.`

- [ ] **Step 3: Verificar en PostgreSQL**

```bash
docker exec -it mce-postgres psql -U motor_ent -d MotorControlEnterprise -c "\d \"AuditLogs\""
docker exec -it mce-postgres psql -U motor_ent -d MotorControlEnterprise -c "\d \"Clients\"" | grep installer
```

Expected: columna `installer_created_by_id` en `Clients` y tabla `AuditLogs` con columnas Id, UserId, Action, EntityType, EntityId, Details, CreatedAt.

- [ ] **Step 4: Commit**

```bash
git add backend/Migrations/
git commit -m "feat(db): migración InstallerOwnership y AuditLogs"
```

---

## Task 4: ClientController — autorizar installer, scope filter, auditoría, ownership checks

**Files:**
- Modify: `backend/Controllers/Monitoring/ClientController.cs`

- [ ] **Step 1: Cambiar using y class-level Authorize**

Agregar al bloque de usings (arriba del namespace):
```csharp
using System.Security.Claims;
using MotorControlEnterprise.Api.Services;
```

Cambiar línea 14:
```csharp
// Antes:
[Authorize(Roles = "admin")]
// Después:
[Authorize(Roles = "admin,installer")]
```

- [ ] **Step 2: Inyectar AuditService en el constructor**

```csharp
// Antes (líneas 17-24):
private readonly ApplicationDbContext _db;
private readonly IEmailService _email;

public ClientController(ApplicationDbContext db, IEmailService email)
{
    _db    = db;
    _email = email;
}

// Después:
private readonly ApplicationDbContext _db;
private readonly IEmailService _email;
private readonly AuditService _audit;

public ClientController(ApplicationDbContext db, IEmailService email, AuditService audit)
{
    _db    = db;
    _email = email;
    _audit = audit;
}
```

- [ ] **Step 3: Reemplazar GetAll() con soporte de scope y campo installerCreatedBy**

Reemplazar el método `GetAll()` completo (líneas 27-57):

```csharp
// GET api/clients
[HttpGet]
public async Task<IActionResult> GetAll([FromQuery] string? scope = null)
{
    var callerId  = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
    var isInstaller = User.IsInRole("installer");

    var query = _db.Clients
        .Include(c => c.User)
        .Include(c => c.InstallerCreatedBy)
        .Include(c => c.Gateways)
        .Where(c => c.DeletedAt == null);

    if (isInstaller && scope != "all")
        query = query.Where(c => c.InstallerCreatedById == callerId);
    else if (isInstaller && scope == "all")
        await _audit.LogAsync(callerId, "access_foreign_client", "Client", null, new { scope = "all" });

    var clients = await query.OrderBy(c => c.Name).ToListAsync();

    var cameraCountMap = await _db.Cameras
        .Where(c => c.ClientId != null)
        .GroupBy(c => c.ClientId!.Value)
        .Select(g => new { ClientId = g.Key, Count = g.Count() })
        .ToDictionaryAsync(x => x.ClientId, x => x.Count);

    return Ok(clients.Select(c => new {
        c.Id, c.Name, c.BusinessType, c.Rfc,
        c.City, c.State, c.Country,
        c.ContactName, c.ContactPhone, c.ContactEmail,
        c.GatewayId, c.LastHeartbeatAt, c.Status, c.CloudStorageActive,
        c.LocalStorageType, c.NvrIp, c.NvrPort, c.NvrBrand,
        c.CreatedAt,
        CameraCount = cameraCountMap.GetValueOrDefault(c.Id, 0),
        UserId     = c.UserId,
        UserEmail  = c.User?.Email,
        UserName   = c.User?.Name,
        UserActive = c.User?.IsActive,
        InstallerCreatedById = c.InstallerCreatedById,
        InstallerCreatedBy   = c.InstallerCreatedBy == null ? null : new {
            c.InstallerCreatedBy.Id,
            c.InstallerCreatedBy.Name
        }
    }));
}
```

- [ ] **Step 4: Agregar auditoría en Create() y guardar InstallerCreatedById**

Al inicio del método `Create()` (antes de la validación de nombre, ~línea 80), agregar:
```csharp
var callerId    = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
var isInstaller = User.IsInRole("installer");
```

Después de `_db.Clients.Add(client)` y antes del primer `SaveChangesAsync()`, agregar:
```csharp
if (isInstaller)
    client.InstallerCreatedById = callerId;
```

Después del `SaveChangesAsync()` que crea el cliente (donde se tiene el `client.Id`), agregar:
```csharp
await _audit.LogAsync(callerId, "create_client", "Client", client.Id,
    new { clientName = client.Name });
```

Si luego se crea un usuario (bloque `if (!string.IsNullOrEmpty(accessEmail))`), después del `SendWelcomePasswordAsync`, agregar:
```csharp
await _audit.LogAsync(callerId, "create_client_user", "User", user.Id,
    new { clientId = client.Id, email = accessEmail });
```

- [ ] **Step 5: Ownership check en UpdateStatus() y Delete()**

Al inicio de `UpdateStatus()` (línea 197), después de `if (client == null) return NotFound();`, agregar:
```csharp
var callerId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
if (User.IsInRole("installer") && client.InstallerCreatedById != callerId)
    return Forbid();
```

Al inicio de `Delete()` (línea 211), después de `if (client == null) return NotFound();`, agregar:
```csharp
var callerId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
if (User.IsInRole("installer") && client.InstallerCreatedById != callerId)
    return Forbid();
```

El endpoint `DELETE /permanent` permanece `[Authorize(Roles = "admin")]` — agregar el atributo explícito al método:
```csharp
[HttpDelete("{id:int}/permanent")]
[Authorize(Roles = "admin")]
public async Task<IActionResult> DeletePermanent(int id)
```

- [ ] **Step 6: Auditoría en CreateUser() cuando cliente es ajeno**

Al inicio de `CreateUser()` (línea 347), después de `if (client == null) return NotFound();`, agregar:
```csharp
var callerId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
if (User.IsInRole("installer") && client.InstallerCreatedById != callerId)
    await _audit.LogAsync(callerId, "modify_foreign_client", "Client", id,
        new { action = "create_user" });
```

Después de crear y guardar el usuario, agregar:
```csharp
await _audit.LogAsync(callerId, "create_client_user", "User", user.Id,
    new { clientId = id, email = email });
```

- [ ] **Step 7: Verificar que el proyecto compila**

```bash
cd C:\dev\MotorControlEnterprise\backend
dotnet build
```

Expected: `Build succeeded. 0 Error(s)`

- [ ] **Step 8: Commit**

```bash
git add backend/Controllers/Monitoring/ClientController.cs
git commit -m "feat(auth): autorizar installer en ClientController con scope, ownership y auditoría"
```

---

## Task 5: AuditLogController — endpoint GET /api/admin/audit-log

**Files:**
- Create: `backend/Controllers/Admin/AuditLogController.cs`

- [ ] **Step 1: Crear el controlador**

```csharp
// backend/Controllers/Admin/AuditLogController.cs
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MotorControlEnterprise.Api.Data;

namespace MotorControlEnterprise.Api.Controllers;

[ApiController]
[Route("api/admin/audit-log")]
[Authorize(Roles = "admin")]
public class AuditLogController : ControllerBase
{
    private readonly ApplicationDbContext _db;

    public AuditLogController(ApplicationDbContext db) => _db = db;

    // GET api/admin/audit-log
    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] int?      userId     = null,
        [FromQuery] string?   action     = null,
        [FromQuery] string?   entityType = null,
        [FromQuery] DateTime? from       = null,
        [FromQuery] DateTime? to         = null,
        [FromQuery] int       page       = 1,
        [FromQuery] int       pageSize   = 50)
    {
        if (page < 1) page = 1;
        if (pageSize < 1 || pageSize > 200) pageSize = 50;

        var query = _db.AuditLogs
            .Include(a => a.User)
            .AsQueryable();

        if (userId.HasValue)
            query = query.Where(a => a.UserId == userId.Value);
        if (!string.IsNullOrEmpty(action))
            query = query.Where(a => a.Action == action);
        if (!string.IsNullOrEmpty(entityType))
            query = query.Where(a => a.EntityType == entityType);
        if (from.HasValue)
            query = query.Where(a => a.CreatedAt >= from.Value);
        if (to.HasValue)
            query = query.Where(a => a.CreatedAt <= to.Value);

        var total = await query.CountAsync();

        var items = await query
            .OrderByDescending(a => a.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(a => new {
                a.Id,
                a.Action,
                a.EntityType,
                a.EntityId,
                a.Details,
                a.CreatedAt,
                User = new { a.User.Id, a.User.Name, a.User.Email, a.User.Role }
            })
            .ToListAsync();

        return Ok(new { items, total, page, pageSize });
    }
}
```

- [ ] **Step 2: Compilar y verificar**

```bash
cd C:\dev\MotorControlEnterprise\backend
dotnet build
```

Expected: `Build succeeded. 0 Error(s)`

- [ ] **Step 3: Commit**

```bash
git add backend/Controllers/Admin/AuditLogController.cs
git commit -m "feat(auth): AuditLogController GET /api/admin/audit-log paginado"
```

---

## Task 6: Frontend — ClientsComponent tabs, scope, badge, botones condicionales

**Files:**
- Modify: `frontend/src/app/components/clients/clients.component.ts`
- Modify: `frontend/src/app/components/clients/clients.component.html`
- Modify: `frontend/src/app/components/clients/clients.component.scss`

- [ ] **Step 1: Agregar signals de tabs y datos del usuario actual en el TS**

Al inicio de la clase `ClientsComponent` (después de los signals existentes, ~línea 44), agregar:

```typescript
// Tab activo para instaladores
activeTab    = signal<'mine' | 'all'>('mine');
currentRole  = signal<string>('admin');
currentUserId = signal<number>(0);

private decodeCurrentUser(): void {
    try {
        const token = localStorage.getItem('motor_control_token');
        if (!token) return;
        const payload = JSON.parse(atob(token.split('.')[1]));
        this.currentRole.set(payload.role ?? 'admin');
        this.currentUserId.set(parseInt(payload.sub ?? '0', 10));
    } catch { }
}

isInstaller = computed(() => this.currentRole() === 'installer');

isOwner = (client: any): boolean => {
    if (this.currentRole() === 'admin') return true;
    return client.installerCreatedById === this.currentUserId();
};
```

- [ ] **Step 2: Llamar decodeCurrentUser() en ngOnInit y pasar scope en loadData()**

En `ngOnInit()`, agregar antes de `this.loadData()`:
```typescript
this.decodeCurrentUser();
```

Modificar el método `loadData()` para incluir `?scope=all` cuando el tab es "all":

```typescript
loadData() {
    const scope = this.activeTab() === 'all' ? '?scope=all' : '';
    this.http.get<any>(`/api/clients/stats`).subscribe({ next: s => this.stats.set(s) });
    this.http.get<any[]>(`/api/clients${scope}`).subscribe({
        next: clients => {
            this.clients.set(clients);
        }
    });
}
```

- [ ] **Step 3: Agregar método switchTab()**

```typescript
switchTab(tab: 'mine' | 'all'): void {
    if (this.activeTab() === tab) return;
    this.activeTab.set(tab);
    this.loadData();
}
```

- [ ] **Step 4: Agregar tabs al HTML — encima de la barra de búsqueda**

En `clients.component.html`, antes del bloque de búsqueda (`<div class="search-box">` o similar), agregar:

```html
<!-- Tabs solo para instalador -->
@if (isInstaller()) {
  <div class="scope-tabs">
    <button
      class="scope-tab"
      [class.active]="activeTab() === 'mine'"
      (click)="switchTab('mine')">
      Mis clientes
    </button>
    <button
      class="scope-tab"
      [class.active]="activeTab() === 'all'"
      (click)="switchTab('all')">
      Todos los clientes
    </button>
  </div>
}
```

- [ ] **Step 5: Agregar badge "Instalado por" en tarjetas de clientes ajenos**

Dentro del loop de tarjetas de cliente (donde se muestra el nombre del cliente), agregar:

```html
@if (isInstaller() && !isOwner(client)) {
  <span class="foreign-badge">
    Instalado por {{ client.installerCreatedBy?.name ?? 'otro instalador' }}
  </span>
}
```

Para admin, agregar badge con el instalador (siempre visible si tiene):
```html
@if (!isInstaller() && client.installerCreatedBy) {
  <span class="installer-badge">
    {{ client.installerCreatedBy.name }}
  </span>
}
```

- [ ] **Step 6: Ocultar botones destructivos para instalador en clientes ajenos**

Localizar los botones de "Cambiar estado" y "Eliminar" en la tarjeta. Envolverlos con:

```html
@if (isOwner(client)) {
  <!-- botones: cambiar estado (active/inactive), eliminar -->
}
```

Los botones de "Ver detalle", "Agregar gateway" y "Crear acceso" permanecen visibles para todos.

- [ ] **Step 7: Agregar estilos en clients.component.scss**

```scss
.scope-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 16px;

  .scope-tab {
    padding: 6px 16px;
    border-radius: 20px;
    border: 1px solid var(--outline);
    background: transparent;
    color: rgba(var(--ink-rgb), 0.7);
    cursor: pointer;
    font-size: 13px;
    transition: all 0.15s;

    &.active {
      background: var(--accent);
      color: #fff;
      border-color: var(--accent);
    }

    &:hover:not(.active) {
      background: rgba(var(--ink-rgb), 0.05);
    }
  }
}

.foreign-badge {
  display: inline-block;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  background: rgba(var(--ink-rgb), 0.08);
  color: var(--muted);
  margin-left: 6px;
}

.installer-badge {
  display: inline-block;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  background: rgba(var(--teal), 0.12);
  color: var(--teal);
  margin-left: 6px;
}
```

- [ ] **Step 8: Commit**

```bash
git add frontend/src/app/components/clients/
git commit -m "feat(frontend): tabs Mis/Todos clientes para installer con badge y ownership checks"
```

---

## Task 7: Frontend — AuditLog service, component y ruta

**Files:**
- Create: `frontend/src/app/services/audit-log.service.ts`
- Create: `frontend/src/app/components/audit-log/audit-log.component.ts`
- Modify: `frontend/src/app/app.routes.ts`

- [ ] **Step 1: Crear AuditLogService**

```typescript
// frontend/src/app/services/audit-log.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

const API_URL = '/api';

export interface AuditEntry {
  id: number;
  action: string;
  entityType: string;
  entityId: number | null;
  details: string | null;
  createdAt: string;
  user: { id: number; name: string; email: string; role: string };
}

export interface AuditPageResult {
  items: AuditEntry[];
  total: number;
  page: number;
  pageSize: number;
}

@Injectable({ providedIn: 'root' })
export class AuditLogService {
  private http = inject(HttpClient);

  getAll(filters: {
    userId?: number;
    action?: string;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
  }): Observable<AuditPageResult> {
    let params = new HttpParams();
    if (filters.userId)   params = params.set('userId',   filters.userId);
    if (filters.action)   params = params.set('action',   filters.action);
    if (filters.from)     params = params.set('from',     filters.from);
    if (filters.to)       params = params.set('to',       filters.to);
    if (filters.page)     params = params.set('page',     filters.page);
    if (filters.pageSize) params = params.set('pageSize', filters.pageSize);
    return this.http.get<AuditPageResult>(`${API_URL}/admin/audit-log`, { params });
  }
}
```

- [ ] **Step 2: Crear AuditLogComponent**

```typescript
// frontend/src/app/components/audit-log/audit-log.component.ts
import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuditLogService, AuditEntry } from '../../services/audit-log.service';

const ACTION_LABELS: Record<string, string> = {
  create_client:         'Creó cliente',
  create_client_user:    'Creó acceso de usuario',
  access_foreign_client: 'Consultó clientes ajenos',
  modify_foreign_client: 'Modificó cliente ajeno',
};

@Component({
  selector: 'app-audit-log',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="audit-page">
      <div class="audit-header">
        <h2>Registro de Auditoría</h2>
      </div>

      <div class="audit-filters">
        <select [(ngModel)]="filterAction" (change)="loadPage(1)">
          <option value="">Todas las acciones</option>
          <option value="create_client">Creó cliente</option>
          <option value="create_client_user">Creó acceso de usuario</option>
          <option value="access_foreign_client">Consultó clientes ajenos</option>
          <option value="modify_foreign_client">Modificó cliente ajeno</option>
        </select>
        <input type="date" [(ngModel)]="filterFrom" (change)="loadPage(1)" placeholder="Desde">
        <input type="date" [(ngModel)]="filterTo"   (change)="loadPage(1)" placeholder="Hasta">
      </div>

      @if (loading()) {
        <p class="audit-loading">Cargando...</p>
      } @else {
        <table class="audit-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Usuario</th>
              <th>Acción</th>
              <th>Entidad</th>
              <th>Detalle</th>
            </tr>
          </thead>
          <tbody>
            @for (entry of entries(); track entry.id) {
              <tr>
                <td>{{ entry.createdAt | date:'dd/MM/yy HH:mm' }}</td>
                <td>
                  <span class="user-name">{{ entry.user.name || entry.user.email }}</span>
                  <span class="user-role">{{ entry.user.role }}</span>
                </td>
                <td><span class="action-badge action-{{ entry.action }}">{{ label(entry.action) }}</span></td>
                <td>{{ entry.entityType }} {{ entry.entityId ? '#' + entry.entityId : '' }}</td>
                <td class="detail-cell">{{ entry.details }}</td>
              </tr>
            }
          </tbody>
        </table>

        <div class="audit-pagination">
          <button (click)="loadPage(page() - 1)" [disabled]="page() <= 1">‹ Anterior</button>
          <span>Página {{ page() }} · {{ total() }} registros</span>
          <button (click)="loadPage(page() + 1)" [disabled]="page() * pageSize >= total()">Siguiente ›</button>
        </div>
      }
    </div>
  `,
  styles: [`
    .audit-page { padding: 24px; }
    .audit-header h2 { margin: 0 0 20px; font-size: 20px; }
    .audit-filters { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
    .audit-filters select,
    .audit-filters input { padding: 6px 10px; border: 1px solid var(--outline); border-radius: 6px; background: var(--surface); color: rgba(var(--ink-rgb), 1); font-size: 13px; }
    .audit-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .audit-table th { text-align: left; padding: 8px 12px; border-bottom: 2px solid var(--outline); color: var(--muted); font-weight: 600; }
    .audit-table td { padding: 8px 12px; border-bottom: 1px solid var(--outline); vertical-align: top; }
    .user-name { display: block; font-weight: 500; }
    .user-role { font-size: 11px; color: var(--muted); }
    .action-badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; background: rgba(var(--ink-rgb), 0.08); }
    .action-badge.action-modify_foreign_client { background: rgba(255,180,0,0.15); color: #b87800; }
    .action-badge.action-access_foreign_client { background: rgba(var(--teal), 0.12); color: var(--teal); }
    .action-badge.action-create_client { background: rgba(var(--green), 0.12); color: var(--green); }
    .detail-cell { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); font-size: 12px; }
    .audit-pagination { display: flex; align-items: center; gap: 16px; margin-top: 16px; font-size: 13px; color: var(--muted); }
    .audit-pagination button { padding: 4px 12px; border: 1px solid var(--outline); border-radius: 6px; background: var(--surface); cursor: pointer; }
    .audit-pagination button:disabled { opacity: 0.4; cursor: default; }
    .audit-loading { color: var(--muted); }
  `]
})
export class AuditLogComponent implements OnInit {
  private svc = inject(AuditLogService);

  entries   = signal<AuditEntry[]>([]);
  total     = signal(0);
  page      = signal(1);
  loading   = signal(false);
  readonly pageSize = 50;

  filterAction = '';
  filterFrom   = '';
  filterTo     = '';

  ngOnInit() { this.loadPage(1); }

  loadPage(p: number) {
    this.page.set(p);
    this.loading.set(true);
    this.svc.getAll({
      action:   this.filterAction || undefined,
      from:     this.filterFrom   || undefined,
      to:       this.filterTo     || undefined,
      page:     p,
      pageSize: this.pageSize
    }).subscribe({
      next: res => {
        this.entries.set(res.items);
        this.total.set(res.total);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  label(action: string): string {
    return ACTION_LABELS[action] ?? action;
  }
}
```

- [ ] **Step 3: Agregar ruta /audit-log en app.routes.ts**

Agregar el import al bloque de imports:
```typescript
import { AuditLogComponent } from './components/audit-log/audit-log.component';
```

En la sección de "Admin routes" (después de `wizard`), agregar:
```typescript
{ path: 'audit-log', component: AuditLogComponent, canActivate: [adminAuthGuard] },
```

> Nota: `adminAuthGuard` ya permite `installer` (no bloquea ese rol) pero la página no muestra nada útil para installer porque el endpoint `/api/admin/audit-log` es solo admin. Si se quiere restringir la ruta al frontend para installer, crear un guard separado. Por ahora es suficiente con que el backend rechace con 403.

- [ ] **Step 4: Compilar el frontend**

```bash
cd C:\dev\MotorControlEnterprise\frontend
npm run build -- --configuration production 2>&1 | tail -20
```

Expected: `Build at: ... - Hash: ... - Time: ...ms` sin errores.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/services/audit-log.service.ts frontend/src/app/components/audit-log/ frontend/src/app/app.routes.ts
git commit -m "feat(frontend): AuditLogComponent y ruta /audit-log para admin"
```

---

## Self-Review

| Requisito del spec | Tarea que lo implementa |
|--------------------|------------------------|
| `InstallerCreatedById` en Client | Task 1 + Task 3 |
| Tabla `AuditLogs` | Task 1 + Task 2 + Task 3 |
| `GET /api/clients?scope=all` para installer | Task 4 Step 3 |
| `POST /api/clients` autorizado para installer | Task 4 Step 1 |
| Ownership check en DELETE y PATCH status | Task 4 Step 5 |
| `DELETE /permanent` solo admin | Task 4 Step 5 |
| Auditoría en create_client, create_client_user | Task 4 Steps 4, 6 |
| Auditoría access_foreign_client, modify_foreign_client | Task 4 Steps 3, 6 |
| `GET /api/admin/audit-log` paginado | Task 5 |
| Frontend tabs Mis/Todos | Task 6 Steps 4-6 |
| Badge instalador en clientes ajenos | Task 6 Step 5 |
| Botones destructivos ocultos para clientes ajenos | Task 6 Step 6 |
| Página de auditoría admin | Task 7 |
| Wizard no tocado | ✅ no aparece en ninguna tarea |
| Cámaras/gateways no tocados | ✅ no aparece en ninguna tarea |
