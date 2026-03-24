# Wizard Refactor — Gateway-First Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactorizar el Wizard de 5 pasos (crea cliente) a 4 pasos (selecciona cliente existente y configura gateway).

**Architecture:** Un cambio menor en el backend (WizardController acepta `?gatewayId=` opcional) y una reescritura completa del componente Angular del Wizard. El frontend carga clientes existentes, permite seleccionar o crear un gateway, registra cámaras nuevas, genera los archivos de instalación y guía el despliegue. El diseño se implementa con el skill `/frontend-design` para mantener calidad visual y patrones del design system.

**Tech Stack:** ASP.NET Core 8 (C#), Angular 17 standalone components, signals, `HttpClient`, CSS variables design system (`--surface`, `--outline`, `--accent`, `--muted`, `--green`, `--red`).

**Spec:** `docs/superpowers/specs/2026-03-24-wizard-refactor-design.md`

---

## Archivos a modificar

| Archivo | Acción | Responsabilidad |
|---------|--------|-----------------|
| `backend/Controllers/Monitoring/WizardController.cs` | Modificar | Agregar `?gatewayId=` opcional a `GetEdgeConfig` |
| `frontend/src/app/components/wizard/wizard.component.ts` | Reescribir | Estado, lógica de 4 pasos, calls HTTP |
| `frontend/src/app/components/wizard/wizard.component.html` | Reescribir | Template 4 pasos |
| `frontend/src/app/components/wizard/wizard.component.scss` | Ajustar | Estilos si requiere cambios menores |

---

## Task 1: Backend — parámetro `?gatewayId=` en `GetEdgeConfig`

**Files:**
- Modify: `backend/Controllers/Monitoring/WizardController.cs` (método `GetEdgeConfig`, líneas ~34-124)

### Contexto
El método actual usa `client.Gateways.FirstOrDefault()` para determinar qué gateway configurar. Si el Wizard selecciona el gateway #2 de un cliente, los archivos generados serían para el #1. Hay que aceptar un `gatewayId` opcional para buscar el gateway correcto.

- [ ] **Step 1: Agregar parámetro `gatewayId` al método**

En `WizardController.cs`, cambiar la firma de `GetEdgeConfig`:

```csharp
[HttpGet("{id:int}/edge-config")]
public async Task<IActionResult> GetEdgeConfig(int id, [FromQuery] string? gatewayId = null)
```

- [ ] **Step 2: Actualizar la lógica de selección del gateway**

Reemplazar el bloque que busca el gateway (actualmente usa `FirstOrDefault()`) con:

```csharp
// Si se pasa gatewayId, usar ese gateway específico; si no, usar el primero (backward-compat)
Gateway? gateway;
if (!string.IsNullOrEmpty(gatewayId))
{
    gateway = client.Gateways.FirstOrDefault(g => g.GatewayId == gatewayId);
    if (gateway == null)
        return NotFound(new { message = $"Gateway '{gatewayId}' no encontrado para este cliente." });
    // Cuando se pasó gatewayId explícito, no aplicar auto-creación: salir si no existe.
}
else
{
    // Sin parámetro: comportamiento original — tomar el primero o auto-crear uno.
    gateway = client.Gateways.FirstOrDefault();

    if (gateway == null)
    {
        // ⚠️ Auto-creación solo en rama sin gatewayId (backward-compat).
        gateway = new Gateway
        {
            ClientId  = client.Id,
            GatewayId = $"gateway-{client.Id}",
            Name      = $"{client.Name} - Gateway",
            Status    = "active",
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };
        _db.Gateways.Add(gateway);
        await _db.SaveChangesAsync();
    }
}
```

- [ ] **Step 3: Verificar manualmente que compila**

```bash
# Desde una terminal con dotnet en PATH (CMD/PowerShell):
dotnet build backend/
# Esperado: Build succeeded. 0 Error(s)
```

Si dotnet no está disponible en bash, el build se verificará en el deploy.

- [ ] **Step 4: Commit**

```bash
git add backend/Controllers/Monitoring/WizardController.cs
git commit -m "feat(wizard): aceptar gatewayId opcional en GetEdgeConfig"
```

---

## Task 2: Frontend — Estado y lógica del nuevo Wizard (`.ts`)

**Files:**
- Rewrite: `frontend/src/app/components/wizard/wizard.component.ts`

### Contexto
El `.ts` actual tiene 491 líneas con estado mezclado de 5 pasos (clientData, userData, cameras, etc.). Se reemplaza por un estado limpio de 4 pasos usando Angular signals.

**Invocar `/frontend-design` al implementar este task para mantener calidad y patrones.**

- [ ] **Step 1: Reescribir `wizard.component.ts` con el nuevo estado**

```typescript
import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router, RouterModule } from '@angular/router';
import { firstValueFrom } from 'rxjs';

const API_URL = '/api';

interface ClientOption {
  id: number;
  name: string;
  cloudStorageActive: boolean;
  localStorageType: string;
}

interface GatewayOption {
  id: number;
  gatewayId: string;
  name: string;
  location?: string;
}

interface CameraForm {
  uid: number;        // local unique id para tracking en @for
  name: string;
  ip: string;
  onvifPort: number;
  onvifUser: string;
  onvifPass: string;
}

@Component({
  selector: 'app-wizard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './wizard.component.html',
  styleUrls: ['./wizard.component.scss']
})
export class WizardComponent implements OnInit {
  private http = inject(HttpClient);
  private router = inject(Router);

  // ── Progreso ──────────────────────────────────────────────────────────────
  currentStep = signal<1 | 2 | 3 | 4>(1);
  totalSteps = 4;

  // ── Paso 1: Cliente & Gateway ─────────────────────────────────────────────
  clients = signal<ClientOption[]>([]);
  loadingClients = signal(false);
  selectedClient = signal<ClientOption | null>(null);

  gateways = signal<GatewayOption[]>([]);
  loadingGateways = signal(false);
  gatewayMode = signal<'existing' | 'new'>('existing');
  selectedGateway = signal<GatewayOption | null>(null);

  newGateway = {
    name: '',
    gatewayId: '',
    edgeToken: '',
    location: ''
  };
  showToken = signal(false);   // true = texto plano, false = password
  step1Error = signal('');
  savingGateway = signal(false);

  // ── Paso 2: Cámaras ───────────────────────────────────────────────────────
  cameras = signal<CameraForm[]>([]);
  private nextCameraUid = 1;
  step2Error = signal('');

  // ── Paso 3: Archivos ──────────────────────────────────────────────────────
  activeTab = signal<'env' | 'mediamtx' | 'compose'>('env');
  generatedFiles = signal<{ env: string; compose: string; mediamtx: string }>({
    env: '', compose: '', mediamtx: ''
  });
  step3Error = signal('');

  // ── Paso 4: Despliegue & Discovery ────────────────────────────────────────
  discoveryStatus = signal<any>(null);
  private discoveryPollInterval: any = null;
  private discoveryStartTime = 0;
  private readonly DISCOVERY_TIMEOUT_MS = 5 * 60 * 1000;
  manualRtspInputs: { [key: number]: string } = {};

  // ── Computed ──────────────────────────────────────────────────────────────
  activeGatewayId = computed(() => {
    if (this.gatewayMode() === 'existing') return this.selectedGateway()?.gatewayId ?? null;
    return this.newGateway.gatewayId.trim() || null;
  });

  canContinueFromStep4 = computed(() => {
    const status = this.discoveryStatus();
    if (!status?.cameras?.length) return false;
    return status.cameras.every((c: any) =>
      ['discovered', 'onvif_failed', 'manual'].includes(c.status)
    ) || status.gatewayOnline;
  });

  // ─────────────────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.loadClients();
  }

  // ── Clientes ──────────────────────────────────────────────────────────────

  loadClients(): void {
    this.loadingClients.set(true);
    this.http.get<ClientOption[]>(`${API_URL}/clients`).subscribe({
      next: (res) => { this.clients.set(res ?? []); this.loadingClients.set(false); },
      error: () => this.loadingClients.set(false)
    });
  }

  onClientChange(clientId: string): void {
    const id = parseInt(clientId, 10);
    const client = this.clients().find(c => c.id === id) ?? null;
    this.selectedClient.set(client);
    this.selectedGateway.set(null);
    this.gateways.set([]);
    this.step1Error.set('');

    if (!client) return;

    this.loadingGateways.set(true);
    this.http.get<GatewayOption[]>(`${API_URL}/clients/${client.id}/gateways`).subscribe({
      next: (res) => {
        this.gateways.set(res ?? []);
        this.loadingGateways.set(false);
        // Sin gateways → modo "nuevo" forzado
        this.gatewayMode.set(res?.length ? 'existing' : 'new');
      },
      error: () => this.loadingGateways.set(false)
    });
  }

  setGatewayMode(mode: 'existing' | 'new'): void {
    this.gatewayMode.set(mode);
    this.selectedGateway.set(null);
    this.step1Error.set('');
  }

  onGatewayChange(gatewayId: string): void {
    const gw = this.gateways().find(g => g.gatewayId === gatewayId) ?? null;
    this.selectedGateway.set(gw);
  }

  generateToken(): void {
    this.newGateway.edgeToken = crypto.randomUUID();
    this.showToken.set(true);
  }

  // ── Navegación ────────────────────────────────────────────────────────────

  async nextStep(): Promise<void> {
    if (this.currentStep() === 1) {
      if (!await this.submitStep1()) return;
    } else if (this.currentStep() === 2) {
      await this.submitStep2();
      await this.generateFiles();
    } else if (this.currentStep() === 3) {
      this.startDiscoveryPolling();
    } else if (this.currentStep() === 4) {
      this.router.navigate(['/clients']);
      return;
    }
    this.currentStep.update(v => (v + 1) as any);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  prevStep(): void {
    if (this.currentStep() === 1) return;
    if (this.currentStep() === 4) this.stopDiscoveryPolling();
    this.currentStep.update(v => (v - 1) as any);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ── Step 1 submit ─────────────────────────────────────────────────────────

  private async submitStep1(): Promise<boolean> {
    this.step1Error.set('');
    if (!this.selectedClient()) {
      this.step1Error.set('Selecciona un cliente.');
      return false;
    }

    if (this.gatewayMode() === 'existing') {
      if (!this.selectedGateway()) {
        this.step1Error.set('Selecciona un gateway existente.');
        return false;
      }
      return true;
    }

    // Modo "nuevo"
    if (!this.newGateway.name.trim()) { this.step1Error.set('El nombre del punto es requerido.'); return false; }
    if (!this.newGateway.gatewayId.trim()) { this.step1Error.set('El ID del dispositivo es requerido.'); return false; }
    if (!this.newGateway.edgeToken.trim()) { this.step1Error.set('Genera o ingresa un token de acceso.'); return false; }

    this.savingGateway.set(true);
    try {
      const body = {
        gatewayId: this.newGateway.gatewayId.trim(),
        name: this.newGateway.name.trim(),
        location: this.newGateway.location.trim() || null,
        clientId: this.selectedClient()!.id,
        edgeToken: this.newGateway.edgeToken.trim()
      };

      const created = await firstValueFrom(
        this.http.post<{ id: number }>(`${API_URL}/gateways`, body)
      );

      // Guardar como gateway seleccionado (id viene del backend)
      this.selectedGateway.set({
        id: created?.id ?? 0,
        gatewayId: body.gatewayId,
        name: body.name,
        location: body.location ?? undefined
      });
      return true;
    } catch (err: any) {
      this.step1Error.set(
        err?.error?.message ?? 'Error al registrar el gateway. Verifica el ID del dispositivo.'
      );
      return false;
    } finally {
      this.savingGateway.set(false);
    }
  }

  // ── Step 2: Cámaras ───────────────────────────────────────────────────────

  addCamera(): void {
    this.cameras.update(list => [
      ...list,
      { uid: this.nextCameraUid++, name: '', ip: '', onvifPort: 8000, onvifUser: 'admin', onvifPass: '' }
    ]);
  }

  removeCamera(uid: number): void {
    this.cameras.update(list => list.filter(c => c.uid !== uid));
  }

  private async submitStep2(): Promise<void> {
    this.step2Error.set('');
    const clientId = this.selectedClient()!.id;
    const cloudActive = this.selectedClient()!.cloudStorageActive;
    let failedCount = 0;

    for (const cam of this.cameras()) {
      if (!cam.name.trim() || !cam.ip.trim()) continue; // skip incomplete
      const base = {
        name: cam.name, cameraId: cam.name, onvifPort: cam.onvifPort || 8000,
        onvifUser: cam.onvifUser, onvifPass: cam.onvifPass, onvifIp: cam.ip,
        ptz: false, isRecordingOnly: false, clientId
      };
      try {
        await firstValueFrom(this.http.post(`${API_URL}/cameras`, base));
        if (cloudActive) {
          await firstValueFrom(this.http.post(`${API_URL}/cameras`, {
            ...base,
            name: `${cam.name}-low`, cameraId: `${cam.name}-low`,
            isRecordingOnly: true
          }));
        }
      } catch { failedCount++; }
    }

    if (failedCount > 0) {
      this.step2Error.set(
        `${failedCount} cámara(s) no se pudieron registrar. Agrégalas después desde el módulo de Cámaras.`
      );
    }
  }

  // ── Step 3: Archivos ──────────────────────────────────────────────────────

  async generateFiles(): Promise<void> {
    this.step3Error.set('');
    const clientId = this.selectedClient()!.id;
    const gatewayId = this.activeGatewayId();

    if (!gatewayId) {
      this.step3Error.set('No hay gateway seleccionado.');
      return;
    }

    try {
      const data = await firstValueFrom(
        this.http.get<{ env: string; dockerCompose: string; mediamtxYml: string }>(
          `${API_URL}/admin/clients/${clientId}/edge-config?gatewayId=${encodeURIComponent(gatewayId)}`
        )
      );
      this.generatedFiles.set({ env: data.env, compose: data.dockerCompose, mediamtx: data.mediamtxYml });
    } catch (err: any) {
      this.step3Error.set(err?.error?.message ?? 'Error al obtener la configuración.');
    }
  }

  showTab(tab: 'env' | 'mediamtx' | 'compose'): void { this.activeTab.set(tab); }

  downloadFile(type: 'env' | 'mediamtx' | 'compose'): void {
    const map = {
      env:      { content: this.generatedFiles().env,     name: 'edge-gateway.env' },
      mediamtx: { content: this.generatedFiles().mediamtx, name: 'mediamtx.yml' },
      compose:  { content: this.generatedFiles().compose,  name: 'docker-compose.yml' }
    };
    const { content, name } = map[type];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type: 'text/plain' }));
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ── Step 4: Discovery ────────────────────────────────────────────────────

  startDiscoveryPolling(): void {
    this.discoveryStartTime = Date.now();
    this.pollDiscoveryOnce();
    this.discoveryPollInterval = setInterval(() => {
      if (Date.now() - this.discoveryStartTime > this.DISCOVERY_TIMEOUT_MS) {
        this.stopDiscoveryPolling();
        return;
      }
      this.pollDiscoveryOnce();
    }, 3000);
  }

  stopDiscoveryPolling(): void {
    if (this.discoveryPollInterval) { clearInterval(this.discoveryPollInterval); this.discoveryPollInterval = null; }
  }

  private async pollDiscoveryOnce(): Promise<void> {
    const clientId = this.selectedClient()?.id;
    if (!clientId) return;
    try {
      const data = await firstValueFrom(
        this.http.get<any>(`${API_URL}/admin/clients/${clientId}/discovery-status`)
      );
      this.discoveryStatus.set(data);
      const allTerminal = data.cameras?.every((c: any) =>
        ['discovered', 'onvif_failed', 'manual'].includes(c.status)
      );
      if (allTerminal && data.cameras?.length > 0) this.stopDiscoveryPolling();
    } catch { /* ignore */ }
  }

  async retryDiscovery(cameraId?: number): Promise<void> {
    const clientId = this.selectedClient()?.id;
    if (!clientId) return;
    const url = cameraId
      ? `${API_URL}/admin/clients/${clientId}/trigger-discovery?cameraId=${cameraId}`
      : `${API_URL}/admin/clients/${clientId}/trigger-discovery`;
    try {
      await firstValueFrom(this.http.post(url, {}));
    } catch { /* ignore */ }
    if (!this.discoveryPollInterval) this.startDiscoveryPolling();
  }

  async saveManualRtsp(cameraId: number, rtspUrl: string): Promise<void> {
    if (!rtspUrl?.startsWith('rtsp://')) return;
    try {
      await firstValueFrom(
        this.http.put(`${API_URL}/cameras/${cameraId}`, { rtspUrl, status: 'manual' })
      );
    } catch { return; }
    this.discoveryStatus.update((s: any) => ({
      ...s,
      cameras: s.cameras.map((c: any) => c.id === cameraId ? { ...c, status: 'manual' } : c)
    }));
    await this.pollDiscoveryOnce();
  }
}
```

- [ ] **Step 2: Verificar que no hay errores de TypeScript obvios**

Revisar visualmente que:
- Todos los signals tienen tipo correcto
- `computed()` depende solo de signals válidos
- `firstValueFrom` está importado de `rxjs`

- [ ] **Step 3: Commit parcial del .ts**

```bash
git add frontend/src/app/components/wizard/wizard.component.ts
git commit -m "feat(wizard): reescritura lógica 4 pasos con selección de cliente/gateway"
```

---

## Task 3: Frontend — Template del Wizard (`.html`) con `/frontend-design`

**Files:**
- Rewrite: `frontend/src/app/components/wizard/wizard.component.html`

**IMPORTANTE: Invocar el skill `/frontend-design` para implementar este task.** El template debe usar las variables CSS del design system, ser intuitivo para usuarios no técnicos, y seguir los patrones Angular 17 standalone (`@if`, `@for`, `@switch`).

- [ ] **Step 1: Reescribir el template con los 4 pasos**

El template debe incluir:

**Barra de progreso (siempre visible):**
```html
<div class="wizard-container">
  <div class="wizard-header">
    <h1>Configurar Gateway</h1>
    <p>Genera la configuración de instalación para una Raspberry Pi</p>
  </div>

  <div class="progress-container">
    <div class="progress-steps">
      <div class="progress-line">
        <div class="progress-line-fill"
             [style.width.%]="(currentStep() - 1) / (totalSteps - 1) * 100"></div>
      </div>
      @for (step of [{n:1,label:'Cliente'},{n:2,label:'Cámaras'},{n:3,label:'Archivos'},{n:4,label:'Despliegue'}]; track step.n) {
        <div class="step" [class.active]="currentStep() === step.n" [class.completed]="currentStep() > step.n">
          <div class="step-circle">
            @if (currentStep() > step.n) { ✓ } @else { {{step.n}} }
          </div>
          <div class="step-label">{{step.label}}</div>
        </div>
      }
    </div>
  </div>

  <div class="wizard-content">
    <!-- Paso 1 -->
    @if (currentStep() === 1) { ... }
    <!-- Paso 2 -->
    @if (currentStep() === 2) { ... }
    <!-- Paso 3 -->
    @if (currentStep() === 3) { ... }
    <!-- Paso 4 -->
    @if (currentStep() === 4) { ... }
  </div>

  <!-- Nav footer -->
  <div class="wizard-nav">
    <button class="btn btn-secondary" [disabled]="currentStep() === 1" (click)="prevStep()">
      ← Anterior
    </button>
    <span class="step-counter">Paso {{currentStep()}} de {{totalSteps}}</span>
    <button class="btn btn-primary" (click)="nextStep()"
            [disabled]="savingGateway() || (currentStep() === 4 && !canContinueFromStep4())">
      @if (savingGateway()) { Guardando... }
      @else if (currentStep() === 4) { Finalizar }
      @else { Siguiente → }
    </button>
  </div>
</div>
```

**Paso 1 — Cliente & Gateway:**
```html
@if (currentStep() === 1) {
<div class="wizard-step">
  <h2 class="step-title">Cliente y Gateway</h2>
  <p class="step-description">Selecciona el cliente y la Raspberry Pi que vas a instalar</p>

  @if (step1Error()) {
    <div class="alert error">{{ step1Error() }}</div>
  }

  <!-- Selector de cliente -->
  <div class="form-group">
    <label>Cliente <span class="required">*</span></label>
    @if (loadingClients()) {
      <div class="loading-hint">Cargando clientes...</div>
    } @else if (clients().length === 0) {
      <div class="empty-state">
        <p>No hay clientes registrados aún.</p>
        <a routerLink="/clients" class="btn btn-secondary">Dar de alta un cliente →</a>
      </div>
    } @else {
      <select (change)="onClientChange($any($event.target).value)">
        <option value="">Selecciona un cliente...</option>
        @for (c of clients(); track c.id) {
          <option [value]="c.id">{{ c.name }}</option>
        }
      </select>
    }
  </div>

  <!-- Selector de gateway (solo si hay cliente) -->
  @if (selectedClient()) {
    <div class="gateway-section">
      <div class="gateway-section-header">
        <label>Gateway (Raspberry Pi) <span class="required">*</span></label>
        @if (gateways().length > 0) {
          <div class="mode-toggle">
            <button [class.active]="gatewayMode() === 'existing'" (click)="setGatewayMode('existing')">
              Existente
            </button>
            <button [class.active]="gatewayMode() === 'new'" (click)="setGatewayMode('new')">
              + Nuevo
            </button>
          </div>
        }
      </div>

      @if (gatewayMode() === 'existing' && gateways().length > 0) {
        <select (change)="onGatewayChange($any($event.target).value)">
          <option value="">Selecciona un gateway...</option>
          @for (gw of gateways(); track gw.gatewayId) {
            <option [value]="gw.gatewayId">{{ gw.name }}</option>
          }
        </select>
        <div class="hint">Útil para regenerar los archivos de una RPi ya instalada</div>
      }

      @if (gatewayMode() === 'new') {
        <div class="new-gateway-form">
          <div class="form-group">
            <label>Nombre del punto <span class="required">*</span></label>
            <input type="text" [(ngModel)]="newGateway.name"
                   placeholder="Ej: Edificio A, Planta Baja" autocomplete="off">
          </div>
          <div class="form-group">
            <label>
              ID del dispositivo <span class="required">*</span>
              <span class="tooltip-trigger" title="MAC address o hostname de la Raspberry Pi. Ejecuta 'hostname' en la RPi para obtenerlo.">?</span>
            </label>
            <input type="text" [(ngModel)]="newGateway.gatewayId"
                   placeholder="b8:27:eb:aa:bb:cc" class="mono" autocomplete="off" spellcheck="false">
          </div>
          <div class="form-group">
            <label>
              Token de acceso <span class="required">*</span>
              <span class="tooltip-trigger" title="Contraseña que usará la RPi para conectarse al servidor. Genera uno o usa el que ya tiene configurado.">?</span>
            </label>
            <div class="token-row">
              <input [type]="showToken() ? 'text' : 'password'"
                     [(ngModel)]="newGateway.edgeToken"
                     placeholder="Token de autenticación"
                     class="mono" autocomplete="new-password" spellcheck="false">
              <button type="button" class="btn btn-secondary" (click)="generateToken()">Generar</button>
            </div>
            @if (newGateway.edgeToken) {
              <div class="hint success">✓ Copia este token antes de continuar — no se puede recuperar después</div>
            }
          </div>
          <div class="form-group">
            <label>Ubicación <span class="optional">(opcional)</span></label>
            <input type="text" [(ngModel)]="newGateway.location"
                   placeholder="Ej: Piso 2, junto al cuarto de red">
          </div>
        </div>
      }
    </div>
  }
</div>
}
```

**Paso 2 — Cámaras:**
```html
@if (currentStep() === 2) {
<div class="wizard-step">
  <h2 class="step-title">Cámaras IP</h2>
  <p class="step-description">
    Agrega las cámaras que conectarás a esta Raspberry Pi.
    <strong>Puedes omitir este paso</strong> y agregarlas después desde el módulo de Cámaras.
  </p>

  @if (step2Error()) { <div class="alert error">{{ step2Error() }}</div> }

  <div class="alert info">
    Las cámaras deben estar en la misma red local que la Raspberry Pi.
  </div>

  @for (cam of cameras(); track cam.uid) {
    <div class="camera-card">
      <div class="camera-card-header">
        <span class="camera-card-title">Cámara {{ $index + 1 }}</span>
        <button class="btn-remove" (click)="removeCamera(cam.uid)">Eliminar</button>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>ID/Nombre <span class="required">*</span></label>
          <input type="text" [(ngModel)]="cam.name" placeholder="cam1">
        </div>
        <div class="form-group">
          <label>IP Local <span class="required">*</span></label>
          <input type="text" [(ngModel)]="cam.ip" placeholder="192.168.1.100">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group" style="max-width:140px">
          <label>Puerto ONVIF</label>
          <input type="number" [(ngModel)]="cam.onvifPort" placeholder="8000">
          <span class="hint">Común: 80, 8000, 8080</span>
        </div>
        <div class="form-group">
          <label>Usuario ONVIF <span class="required">*</span></label>
          <input type="text" [(ngModel)]="cam.onvifUser" placeholder="admin" autocomplete="off">
        </div>
        <div class="form-group">
          <label>Contraseña ONVIF</label>
          <input type="password" [(ngModel)]="cam.onvifPass" autocomplete="new-password">
        </div>
      </div>
    </div>
  }

  <button class="btn btn-secondary" style="margin-top:10px" (click)="addCamera()">
    + Agregar cámara
  </button>
</div>
}
```

**Paso 3 — Archivos de Configuración:**
```html
@if (currentStep() === 3) {
<div class="wizard-step">
  <h2 class="step-title">Archivos de Configuración</h2>
  <p class="step-description">Revisa y descarga los archivos que debes copiar al dispositivo edge (Raspberry Pi)</p>

  @if (step3Error()) {
    <div class="alert error">
      {{ step3Error() }}
      <button class="btn btn-secondary" style="margin-left:12px" (click)="generateFiles()">Reintentar</button>
    </div>
  }

  <div class="file-tab">
    <button class="tab-btn" [class.active]="activeTab() === 'env'" (click)="showTab('env')">.env</button>
    <button class="tab-btn" [class.active]="activeTab() === 'mediamtx'" (click)="showTab('mediamtx')">mediamtx.yml</button>
    <button class="tab-btn" [class.active]="activeTab() === 'compose'" (click)="showTab('compose')">docker-compose.yml</button>
  </div>

  <div class="code-block">
    @if (activeTab() === 'env') { {{ generatedFiles().env }} }
    @if (activeTab() === 'mediamtx') { {{ generatedFiles().mediamtx }} }
    @if (activeTab() === 'compose') { {{ generatedFiles().compose }} }
  </div>

  <div class="download-btns">
    <button class="btn btn-primary" (click)="downloadFile('env')">Descargar .env</button>
    <button class="btn btn-primary" (click)="downloadFile('mediamtx')">Descargar mediamtx.yml</button>
    <button class="btn btn-primary" (click)="downloadFile('compose')">Descargar docker-compose.yml</button>
  </div>
</div>
}
```

**Paso 4 — Despliegue:**
```html
@if (currentStep() === 4) {
<div class="wizard-step">
  <h2 class="step-title">Instrucciones de Instalación</h2>
  <p class="step-description">Pasos para instalar el equipo en la ubicación de
    <strong>{{ selectedClient()?.name }}</strong>. Realiza esto en la Raspberry Pi del cliente.
  </p>

  <div class="alert success" style="display:block">
    ✅ Gateway registrado. Descarga los archivos del paso anterior antes de irte.
  </div>

  <div class="deploy-step">
    <div class="deploy-step-num">1</div>
    <div class="deploy-step-content">
      <strong>Descargar el software base del gateway</strong>
      <p>En la consola de la Raspberry Pi:</p>
      <code class="cmd">git clone https://github.com/CarlosBarajasS/motorcontrol-edge-template.git edge-gateway &amp;&amp; cd edge-gateway</code>
    </div>
  </div>

  <div class="deploy-step">
    <div class="deploy-step-num">2</div>
    <div class="deploy-step-content">
      <strong>Copiar los archivos de configuración</strong>
      <p>Transfiere los 3 archivos descargados vía SFTP o USB, y reemplázalos sobre la carpeta
        <code>edge-gateway</code>. Coloca <code>mediamtx.yml</code> dentro del subdirectorio <code>mediamtx/</code>.
      </p>
    </div>
  </div>

  <div class="deploy-step">
    <div class="deploy-step-num">3</div>
    <div class="deploy-step-content">
      <strong>Iniciar el contenedor Docker</strong>
      <code class="cmd">mv edge-gateway.env .env</code>
      <code class="cmd">docker compose up -d</code>
    </div>
  </div>

  <div class="deploy-step">
    <div class="deploy-step-num">4</div>
    <div class="deploy-step-content">
      <strong>Verificar</strong>
      <p>El heartbeat aparecerá en el listado de Gateways en menos de 2 minutos.</p>
      <code class="cmd">docker logs edge-agent --tail=20 -f</code>
    </div>
  </div>

  <!-- Discovery Status Panel -->
  <div class="discovery-panel">
    <h3>Estado del descubrimiento</h3>

    <div class="gateway-status">
      @if (!discoveryStatus()?.gatewayOnline) {
        <span class="status-dot pending"></span>
        <span>Esperando conexión del gateway...</span>
      } @else {
        <span class="status-dot online"></span>
        <span>Gateway conectado</span>
      }
    </div>

    @if (discoveryStatus()?.cameras?.length > 0) {
    <div class="camera-list">
      @for (cam of discoveryStatus().cameras; track cam.id) {
      <div class="camera-item" [class.failed]="cam.status === 'onvif_failed'">
        <div class="camera-header">
          <span class="camera-icon">📷</span>
          <strong>{{ cam.name }}</strong>
          @switch (cam.status) {
            @case ('pending') { <span class="badge pending">⬜ Pendiente</span> }
            @case ('discovering') { <span class="badge discovering">🟡 Descubriendo...</span> }
            @case ('discovered') {
              <span class="badge discovered">
                ✅ {{ cam.brand }} {{ cam.model }}
                @if (cam.resolution) { · {{ cam.resolution }} }
                @if (cam.fps) { · {{ cam.fps }}fps }
              </span>
            }
            @case ('manual') { <span class="badge manual">✏️ URL manual</span> }
            @case ('onvif_failed') { <span class="badge failed">⚠️ ONVIF no respondió</span> }
          }
        </div>

        @if (cam.status === 'onvif_failed') {
        <div class="failure-guide">
          <div class="guide-option">
            <strong>Opción 1 — Activar ONVIF en la cámara</strong>
            <p>En la interfaz web de la cámara: <em>Configuración → Red → ONVIF → Activar</em></p>
            <button class="btn btn-secondary" (click)="retryDiscovery(cam.id)">🔄 Reintentar descubrimiento</button>
          </div>
          <div class="guide-option">
            <strong>Opción 2 — URL RTSP manual</strong>
            <table class="rtsp-cheatsheet">
              <tr><td>Hikvision</td><td><code>/Streaming/Channels/101</code></td></tr>
              <tr><td>Dahua</td><td><code>/cam/realmonitor?channel=1&amp;subtype=0</code></td></tr>
              <tr><td>Reolink</td><td><code>/h264Preview_01_main</code></td></tr>
              <tr><td>TP-Link Tapo</td><td><code>/stream1</code></td></tr>
              <tr><td>Axis</td><td><code>/axis-media/media.amp</code></td></tr>
            </table>
            <div class="manual-input-row">
              <input type="text" [(ngModel)]="manualRtspInputs[cam.id]"
                     placeholder="rtsp://admin:pass@192.168.1.100:554/..." class="form-input manual-rtsp">
              <button class="btn btn-primary" (click)="saveManualRtsp(cam.id, manualRtspInputs[cam.id])">Guardar</button>
            </div>
          </div>
        </div>
        }
      </div>
      }
    </div>
    }
  </div>

  <div style="margin-top: 24px;">
    <button class="btn btn-secondary" routerLink="/clients">Ir a lista de Clientes</button>
  </div>
</div>
}
```

- [ ] **Step 2: Commit del template**

```bash
git add frontend/src/app/components/wizard/wizard.component.html
git commit -m "feat(wizard): template 4 pasos con selección de cliente y gateway"
```

---

## Task 4: Frontend — Estilos (`.scss`)

**Files:**
- Modify: `frontend/src/app/components/wizard/wizard.component.scss`

- [ ] **Step 1: Agregar estilos para elementos nuevos**

Añadir al final del `.scss` existente (no reemplazar — los estilos actuales siguen siendo válidos):

```scss
/* ── Gateway section ─────────────────────────────── */
.gateway-section {
  margin-top: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.gateway-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;

  label { margin: 0; }
}

.mode-toggle {
  display: flex;
  border: 1px solid var(--outline);
  border-radius: 6px;
  overflow: hidden;
  flex-shrink: 0;

  button {
    padding: 5px 14px;
    font-size: 12px;
    font-weight: 500;
    border: none;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    transition: background 0.15s, color 0.15s;

    &.active {
      background: var(--accent);
      color: #fff;
    }
    &:not(.active):hover { background: rgba(var(--ink-rgb), 0.06); }
  }
}

.new-gateway-form {
  padding: 16px;
  background: rgba(var(--ink-rgb), 0.03);
  border: 1px solid var(--outline);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.token-row {
  display: flex;
  gap: 8px;

  input { flex: 1; min-width: 0; }
}

.hint.success {
  color: var(--green);
  font-weight: 500;
}

.mono {
  font-family: 'Courier New', Courier, monospace;
  font-size: 13px;
  letter-spacing: 0.02em;
}

.tooltip-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1px solid var(--outline);
  font-size: 10px;
  font-weight: 700;
  color: var(--muted);
  cursor: help;
  vertical-align: middle;
  margin-left: 4px;
}

/* ── Empty state ─────────────────────────────────── */
.empty-state {
  padding: 24px;
  text-align: center;
  background: rgba(var(--ink-rgb), 0.03);
  border: 1px dashed var(--outline);
  border-radius: 8px;

  p { color: var(--muted); margin-bottom: 12px; }
}

.loading-hint {
  font-size: 13px;
  color: var(--muted);
  padding: 8px 0;
}
```

- [ ] **Step 2: Commit de estilos**

```bash
git add frontend/src/app/components/wizard/wizard.component.scss
git commit -m "feat(wizard): estilos para modo gateway existente/nuevo y empty state"
```

---

## Task 5: Verificación manual en navegador

- [ ] **Step 1: Arrancar el frontend localmente (o verificar en producción tras deploy)**

```bash
cd frontend && ng serve
# Navegar a: http://localhost:4200/wizard
```

- [ ] **Step 2: Verificar CA-1 a CA-15 del spec**

Checklist de verificación manual:

```
CA-1:  El wizard NO muestra campos de creación de cliente            [ ]
CA-2:  El dropdown carga clientes reales de la BD                   [ ]
CA-3:  Al cambiar cliente, se cargan sus gateways                   [ ]
CA-4:  Sin gateways → modo "nuevo" automático, sin toggle           [ ]
CA-5:  Con gateways → toggle "Existente / + Nuevo" visible          [ ]
CA-6:  Gateway nuevo → POST /api/gateways se llama; error duplicado
       muestra mensaje inline y NO avanza                           [ ]
CA-7:  Token generado se ve en texto plano                          [ ]
CA-8:  Paso 2 inicia vacío                                          [ ]
CA-9:  Se puede avanzar desde paso 2 con 0 cámaras                 [ ]
CA-10: Archivos .env contienen el gatewayId correcto (no siempre
       el primero del cliente)                                      [ ]
CA-11: Discovery polling funciona igual que antes                   [ ]
CA-12: Sin paso 5 (Acceso Web)                                      [ ]
CA-13: Botón final lleva a /clients                                 [ ]
CA-14: Sin clientes → empty state con link                         [ ]
CA-15: Diseño coherente con el resto del sistema                    [ ]
```

- [ ] **Step 3: Commit final y push**

```bash
git push origin main
```

---

## Task 6: Deploy a producción

- [ ] **Step 1: Invocar `/devops` para deploy**

```
/devops Deploy wizard refactor: backend WizardController + frontend wizard component
```

- [ ] **Step 2: Verificar logs del backend tras deploy**

```bash
docker logs mce-backend --tail 30
# Verificar que no hay errores de startup
```

- [ ] **Step 3: Smoke test en producción**

Navegar a `https://nirmgroup.net/wizard` y ejecutar el checklist de CA-1 a CA-15 con datos reales.
