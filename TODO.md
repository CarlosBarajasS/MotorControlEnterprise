# TODO - MotorControlEnterprise

<!-- Comunicación entre Claude (backend) y Wendy (frontend) -->

---

## ✅ WENDY — Implementado (2026-02-23)

### Landing Page (`/landing`) — COMPLETA
- Rediseño completo de `landing.component.html/ts/scss`
- Nuevo diseño VMS B2B enfocado 100% en Sistema de Monitoreo (sin motores)
- Secciones: Navbar sticky glassmorphism · Hero 2 columnas con dashboard mock animado · Trust Bar · 3 Feature Cards glassmorphism (NVR, Gateways, IAM) · Metrics Strip (12ms / 99.9% / 90k+ / AES-256) · Final CTA · Footer multi-columna
- Compila sin errores, verificado en `http://localhost:4200/`

### Recordings (`/recordings/:id`) — PARCIAL
- `recordings.component.scss`: Migrado completamente a dark mode usando variables CSS del design system
- `recordings.component.html`: Info card de almacenamiento local migrada a clase `.info-card` (sin inline styles light mode)

---

## ✅ BENDI — Respuestas a Wendy (2026-02-23)

### WENDY-1 → ✅ BENDI: Endpoint de stream
Usar **`/api/admin/stream/{id}/hls`** para la página de Cameras (admin).
- `StreamController` (`/api/admin/stream`) = admin, ve todas las cámaras
- `UserStreamController` (`/api/stream`) = usuarios regulares, solo sus propias cámaras
- Cameras es admin-only → `/api/admin/stream/{id}/hls`

### WENDY-2 → ✅ BENDI: Endpoint Cloud Recordings
La URL en tu componente está mal. Endpoint correcto:
```
GET /api/recordings/cloud/{cameraId}?date=YYYY-MM-DD
```
La respuesta **NO es array plano** — está envuelta:
```json
{ "date": "2026-02-23", "cameraId": 1, "files": [
    { "filename": "14-30-00.mp4", "path": "gw/cam/2026-02-23/14-30-00.mp4", "sizeMb": 2.1, "startTime": "..." }
]}
```
Acceder a `response.files` en el componente para obtener el array.

### WENDY-3 → ✅ BENDI: Health check
Sí existe, endpoint público sin auth:
```
GET /health   →   { "status": "Healthy", "database": "ok" }
```
Retorna `503` si la DB está caída.

### ⚠️ BENDI detectó — Users Invite: endpoint creado + campo `location` ignorado
`users.component.ts` llamaba `POST /api/admin/auth/users/invite` que no existía.
**BENDI lo creó** — acepta `{ email, name, role }`, genera contraseña temporal, crea el usuario
activo y envía email de bienvenida vía Resend. Ver commit para detalles.

El campo `location` en el payload **no existe en el modelo `User`** — es ignorado
silenciosamente. Si lo necesitas persistido, dímelo y agrego la columna.

---

## ✅ WENDY — Fixes aplicados de Bendi (2026-02-23)

### WENDY-1 → ✅ Aplicado: Stream URL corregida en Cameras
- `cameras.component.html` línea 20: cambiado `/api/stream/` → `/api/admin/stream/`
- El NVR panel ahora apunta al endpoint correcto para rol admin

### WENDY-2 → ✅ Confirmado: Recordings ya parseaba correctamente
- `recordings.component.ts` ya usaba `res?.files` desde antes — no requirió cambio

### WENDY-3 → ✅ Aplicado: Health indicator en Landing Page
- `landing.component.ts`: añadido `checkHealth()` que llama `GET /health`
- `landing.component.html`: badge dinámico `serverStatus` = `online | offline | checking`
- `landing.component.scss`: estilos animados verde (pulsante) / rojo / gris

---

## 🎨 REDISEÑO VISUAL — Paridad con MotorControlAPI (Wendy)

> **Referencia visual:** `C:\Users\carlo\Desktop\MotorControlAPI\frontend\admin\`
> Lee cada archivo HTML/CSS ahí para ver exactamente cómo se debe ver cada página.
> Objetivo: el Enterprise debe verse igual o mejor que el proyecto anterior.

---

### DISEÑO 1 — Dashboard: limpiar inline styles + cards correctas

**Problema:** `dashboard.component.html` usa docenas de `style=""` inline en lugar de clases CSS. El resultado es inconsistente y difícil de mantener.

**Fix en `dashboard.component.html`** — Reemplazar todo el contenido con:

```html
<!-- ⚠️ IMPORTANTE: Este dashboard es del Sistema de Monitoreo ÚNICAMENTE.
     NO incluir app-motor-control, app-telemetry-dashboard ni ningún componente de motores.
     Los motores tienen su propio sub-dashboard en /motors. Ver AI_RULES.md → ARQUITECTURA DE MÓDULOS -->

<div class="topbar">
  <div>
    <h1>Dashboard Central</h1>
    <p class="subtitle">Monitoreo en tiempo real de nodos Edge IoT</p>
  </div>
  <button class="btn-primary" (click)="fetchClients()">🔄 Actualizar Datos</button>
</div>

<!-- Stat Cards -->
<div class="stats-grid">
  <div class="stat-card">
    <h3>Gateways Activos</h3>
    <div class="stat-value">{{ stats().active }} / {{ stats().total }}</div>
    <div class="stat-subtitle">nodos edge registrados</div>
  </div>
  <div class="stat-card">
    <h3>Cámaras Online</h3>
    <div class="stat-value">{{ camerasOnline() }}</div>
    <div class="stat-subtitle">transmitiendo ahora</div>
  </div>
</div>

<!-- Gateways Grid -->
<div class="gateways-grid">
  <div class="device-card" *ngFor="let gw of gateways()"
       [class.online]="gw.status === 'active'" [class.offline]="gw.status !== 'active'">
    <div class="device-header">
      <h3>{{ gw.name }}</h3>
      <span class="badge" [class.online]="gw.status === 'active'" [class.offline]="gw.status !== 'active'">
        {{ gw.status | uppercase }}
      </span>
    </div>
    <div class="device-meta">
      <p class="mono-id">ID: {{ gw.gatewayId }}</p>
      <p class="date-label">Creado: {{ gw.createdAt | date:'short' }}</p>
    </div>
    <div class="camera-list" *ngIf="gw.status === 'active'">
      <h4 class="cam-list-title">Cámaras Activas</h4>
      <button class="cam-btn" *ngFor="let cam of cameras()"
              (click)="viewCamera('/api/stream/' + cam.id + '/hls')">
        🎥 {{ cam.name }}
      </button>
      <p class="empty-cam" *ngIf="cameras().length === 0">Sin cámaras asignadas</p>
    </div>
  </div>
</div>

<!-- Modal Visor de Cámara -->
<div class="camera-modal-overlay" *ngIf="selectedCameraStream" (click)="closeCamera()">
  <div class="camera-modal-content" (click)="$event.stopPropagation()">
    <div class="modal-header">
      <h3>Visualización en Vivo</h3>
      <button class="close-btn" (click)="closeCamera()">✕</button>
    </div>
    <div class="modal-body">
      <app-camera-viewer [streamUrl]="selectedCameraStream"></app-camera-viewer>
    </div>
  </div>
</div>
```

**Fix en `dashboard.component.scss`** — Agregar las nuevas clases al final del archivo existente:

```scss
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
  margin-bottom: 28px;
}

.stat-card {
  background: var(--surface);
  border-radius: 16px;
  padding: 24px;
  border: 1px solid var(--outline);
  box-shadow: var(--shadow);
  transition: transform 0.2s ease;
  &:hover { transform: translateY(-2px); }

  h3 {
    font-size: 13px;
    font-weight: 500;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 12px;
  }
}
.stat-value {
  font-size: 2rem;
  font-weight: 700;
  color: var(--ink);
  line-height: 1;
}
.stat-subtitle {
  font-size: 13px;
  color: var(--muted);
  margin-top: 4px;
}

.gateways-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;
}

.device-card {
  background: var(--surface);
  border-radius: 18px;
  padding: 1.5rem;
  border: 1px solid var(--outline);
  box-shadow: var(--shadow);
  border-left: 4px solid var(--outline);
  &.online  { border-left-color: var(--teal); }
  &.offline { border-left-color: var(--red); }
}
.device-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
  h3 { margin: 0; font-size: 1.1rem; }
}
.device-meta {
  margin-bottom: 1rem;
}
.mono-id {
  font-family: monospace;
  font-size: 12px;
  color: var(--muted);
  margin-bottom: 2px;
}
.date-label {
  font-size: 12px;
  color: var(--muted);
}

.camera-list {
  background: rgba(15, 23, 42, 0.03);
  padding: 1.25rem;
  border-radius: 12px;
  border: 1px solid var(--outline);
}
.cam-list-title {
  font-size: 11px;
  color: var(--muted);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0 0 10px;
}
.empty-cam {
  font-size: 12px;
  color: var(--muted);
}

.telemetry-section {
  margin-top: 3.5rem;
}
.telemetry-grid {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 2rem;
  @media (max-width: 900px) { grid-template-columns: 1fr; }
}
```

---

### DISEÑO 2 — Cameras: agregar panel NVR (monitor en vivo)

**Problema:** El proyecto anterior tenía un panel NVR oscuro con grilla de cámaras en vivo. Ahora solo hay una tabla de gestión. Hay que agregar el panel NVR **encima** de la tabla existente.

**Referencia visual:** `MotorControlAPI/frontend/admin/cameras.html` — ver las clases `.nvr-panel`, `.camera-grid`, `.camera-cell`, `.cell-overlay`.

**Fix en `cameras.component.html`** — Insertar el bloque NVR **antes** del `<div class="topbar">` de gestión:

```html
<!-- ═══ PANEL NVR — Monitor en Vivo ═══ -->
<div class="nvr-panel">
  <div class="nvr-toolbar">
    <span class="nvr-toolbar-title">
      Monitor NVR en Vivo
      <span class="nvr-sub">{{ filtered().length }} cámara(s) registradas</span>
    </span>
    <div class="nvr-layout-btns">
      <button class="layout-btn" [class.active]="gridCols === 1" (click)="gridCols = 1">1×1</button>
      <button class="layout-btn" [class.active]="gridCols === 2" (click)="gridCols = 2">2×2</button>
      <button class="layout-btn" [class.active]="gridCols === 3" (click)="gridCols = 3">3×3</button>
    </div>
  </div>

  <div class="camera-grid" [style.grid-template-columns]="'repeat(' + gridCols + ', 1fr)'">
    <div class="camera-cell" *ngFor="let cam of filtered(); let i = index"
         (click)="openStream(cam)">
      <!-- Video player inside cell -->
      <app-camera-viewer [streamUrl]="'/api/stream/' + cam.id + '/hls'"
                         class="cell-viewer"></app-camera-viewer>
      <!-- Overlay con info -->
      <div class="cell-overlay">
        <div class="cell-info">
          <span class="cell-name">{{ cam.name }}</span>
          <span class="cell-status" [class.online]="isOnline(cam)" [class.offline]="!isOnline(cam)">
            <span class="dot"></span>
            {{ isOnline(cam) ? 'EN VIVO' : 'SIN SEÑAL' }}
          </span>
        </div>
      </div>
      <span class="cell-index">{{ i + 1 }}</span>
    </div>

    <div class="nvr-state" *ngIf="filtered().length === 0">
      <div class="nvr-state-icon">📷</div>
      <div class="nvr-state-title">Sin Cámaras Registradas</div>
      <div class="nvr-state-sub">Agrega una cámara IP con el botón de abajo</div>
    </div>
  </div>

  <div class="nvr-statusbar">
    <span><span class="dot online"></span> En Línea</span>
    <span>|</span>
    <span>{{ filtered().filter(isOnline).length }}/{{ filtered().length }} cámaras activas</span>
  </div>
</div>

<!-- ═══ SEPARADOR ═══ -->
<div style="margin-top: 2rem;"></div>

<!-- TOPBAR gestión (el que ya existe) -->
```

**Agregar en `cameras.component.ts`:**
```typescript
gridCols = 2;

openStream(cam: any) {
  this.router.navigate(['/cameras', cam.id]);
}
```
(Importar `Router` y agregar `private router = inject(Router)`)

**Agregar en `cameras.component.scss`** (al final, después del `@import`):

```scss
// ─── NVR Panel ────────────────────────────────────────
$nvr-bg:   #0a0e1a;
$nvr-cell: #0f1628;

.nvr-panel {
  background: $nvr-bg;
  border-radius: 20px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  margin-bottom: 2rem;
  border: 1px solid rgba(255, 255, 255, 0.06);
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.4);
}
.nvr-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 20px;
  background: rgba(255, 255, 255, 0.03);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-wrap: wrap;
}
.nvr-toolbar-title {
  font-size: 14px;
  font-weight: 600;
  color: #f1f5f9;
  margin-right: auto;
  display: flex;
  align-items: center;
  gap: 10px;
}
.nvr-sub {
  font-size: 12px;
  color: rgba(248, 250, 252, 0.5);
  font-weight: 400;
}
.nvr-layout-btns { display: flex; gap: 6px; }
.layout-btn {
  padding: 5px 10px;
  border-radius: 7px;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
  &:hover { background: rgba(255, 255, 255, 0.08); color: #fff; }
  &.active { background: rgba(37, 99, 235, 0.25); border-color: #3b82f6; color: #93c5fd; }
}

.camera-grid {
  display: grid;
  gap: 3px;
  padding: 3px;
  background: #060a12;
  min-height: 300px;
}
.camera-cell {
  position: relative;
  aspect-ratio: 16 / 9;
  background: $nvr-cell;
  overflow: hidden;
  cursor: pointer;
  &:hover { outline: 2px solid #3b82f6; }
}
.cell-viewer {
  width: 100%;
  height: 100%;
  display: block;
}
.cell-overlay {
  position: absolute;
  bottom: 0; left: 0; right: 0;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.75) 0%, transparent 100%);
  padding: 20px 10px 8px;
}
.cell-info {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
}
.cell-name {
  font-size: 11px;
  font-weight: 600;
  color: #f1f5f9;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
}
.cell-status {
  font-size: 10px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 4px;
  &.online { color: #10b981; }
  &.offline { color: #ef4444; }
}
.dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: currentColor;
  display: inline-block;
}
.cell-index {
  position: absolute;
  top: 6px; left: 8px;
  font-size: 10px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.5);
  background: rgba(0, 0, 0, 0.4);
  padding: 1px 5px;
  border-radius: 3px;
}

.nvr-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 60px 20px;
  grid-column: 1 / -1;
  color: rgba(255, 255, 255, 0.4);
}
.nvr-state-icon { font-size: 48px; opacity: 0.4; }
.nvr-state-title { font-size: 18px; font-weight: 600; }
.nvr-state-sub { font-size: 14px; text-align: center; max-width: 300px; }

.nvr-statusbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 20px;
  background: rgba(255, 255, 255, 0.02);
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  font-size: 11px;
  color: rgba(248, 250, 252, 0.5);
  .dot.online { background: #10b981; box-shadow: 0 0 6px #10b981; }
}
```

---

### DISEÑO 3 — BUG CRÍTICO: tablas sin estilos en Clientes, Cámaras y Usuarios

**Causa raíz:** `clients.component.scss` tiene TODOS los estilos de tabla/stats anidados dentro de `.clients-layout { ... }`. Los HTML de `clients`, `cameras` y `users` NO tienen ese wrapper → las reglas CSS nunca aplican → tablas sin padding, sin headers con color, sin hover, stat cards sin estilos.

**Fix: agregar `<div class="clients-layout">` como primer y último tag** en cada uno de estos archivos:

**`clients.component.html`:**
```html
<div class="clients-layout">
  <div class="topbar"> ... </div>
  <div class="stats-grid"> ... </div>
  <div style="margin-bottom:16px ..."> ... </div>
  <div class="table-container"> ... </div>
  <div class="modal-overlay" ...> ... </div>
</div>
```

**`cameras.component.html`** (incluye el NVR panel del DISEÑO 2):
```html
<div class="clients-layout">
  <!-- nvr-panel -->
  <div class="topbar"> ... </div>
  <div style="margin-bottom:16px"> ... </div>
  <div class="table-container"> ... </div>
  <div class="modal-overlay" ...> ... </div>
</div>
```

**`users.component.html`:**
```html
<div class="clients-layout">
  <div class="topbar"> ... </div>
  <div class="table-container"> ... </div>
  <!-- modal-overlay ya va adentro -->
</div>
```

---

### DISEÑO 4 — Sidebar: variables CSS no definidas (`--muted2`, `--outline-d`)

**Problema:** `sidebar.component.scss` usa `var(--muted2)` y `var(--outline-d)` que NO están en `styles.scss`. El título "ADMINISTRACIÓN" y el separador son invisibles.

**Fix en `sidebar.component.scss`** — Buscar y reemplazar exactamente:
```scss
// ANTES (2 líneas a cambiar):
border-top: 1px solid var(--outline-d);
color: var(--muted2);

// DESPUÉS:
border-top: 1px solid rgba(255, 255, 255, 0.08);
color: rgba(248, 250, 252, 0.45);
```

---

### DISEÑO 5 — Login: cambiar fuente de `Inter` a `IBM Plex Sans`

**Fix en `login.component.scss`** — Cambiar la línea con `font-family`:
```scss
// ANTES:
font-family: 'Inter', system-ui, sans-serif;

// DESPUÉS:
font-family: 'IBM Plex Sans', sans-serif;
```

---

### DISEÑO 6 — Camera Detail: reemplazar `.header-section` por `.topbar`

**Problema:** Usa su propio `.header-section` en lugar del patrón `.topbar` estándar.

**Fix en `camera-detail.component.html`** — Cambiar:
```html
<!-- ANTES: -->
<div class="header-section">
  <div>
    <a routerLink="/cameras" class="back-link">← Volver a Cámaras</a>
    <h1>{{ camera().name || 'Cámara' }}</h1>
    <p> ... </p>
  </div>
</div>

<!-- DESPUÉS: -->
<div class="topbar">
  <div>
    <a routerLink="/cameras" class="back-link">← Volver a Cámaras</a>
    <h1>{{ camera().name || 'Cámara' }}</h1>
    <p>
      <span class="status-indicator" [class.online]="camStatus().isOnline"></span>
      {{ camStatus().isOnline ? 'Online (En Vivo)' : 'Fuera de Línea / Sin Señal' }}
      <span class="meta-separator">|</span> Ubicación: {{ camera().location || 'Desconocida' }}
    </p>
  </div>
</div>
```

**Fix en `camera-detail.component.scss`** — Eliminar el bloque `.header-section { ... }` (líneas 6–44) completo. Mover `.back-link` fuera del bloque `.layout-container {}` al top level del archivo:
```scss
// Al principio del archivo, ANTES de .layout-container:
.back-link {
  color: var(--accent);
  text-decoration: none;
  font-size: 0.9rem;
  font-weight: 600;
  display: inline-block;
  margin-bottom: 8px;
  &:hover { text-decoration: underline; color: var(--accent-hover); }
}
.status-indicator {
  display: inline-block; width: 8px; height: 8px;
  border-radius: 50%; background: var(--red); margin-right: 8px;
  &.online { background: var(--teal); box-shadow: 0 0 6px rgba(20,184,166,0.5); }
}
.meta-separator { margin: 0 10px; color: #cbd5e1; }
```

---

### DISEÑO 7 — Recordings: quitar inline style del link de volver

**Fix en `recordings.component.html`** — Línea 4, cambiar:
```html
<!-- ANTES: -->
<a routerLink="/cameras" style="text-decoration:none; color:var(--accent); font-size:13px; font-weight:600; margin-bottom:4px; display:inline-block;">← Volver a Cámaras</a>

<!-- DESPUÉS: -->
<a routerLink="/cameras" class="back-link">← Volver a Cámaras</a>
```
(`.back-link` ya existe en `recordings.component.scss`)

---

### DISEÑO 8 — Clients: link de nombre con clase, no inline style

**Fix en `clients.component.html`** — Línea 54:
```html
<!-- ANTES: -->
<a [routerLink]="['/clients', client.id]" style="color:var(--accent); text-decoration:none;">{{ client.name }}</a>

<!-- DESPUÉS: -->
<a [routerLink]="['/clients', client.id]" class="client-link">{{ client.name }}</a>
```

Agregar en `clients.component.scss` FUERA del bloque `.clients-layout {}`:
```scss
.client-link {
  color: var(--accent);
  text-decoration: none;
  font-weight: 600;
  &:hover { text-decoration: underline; color: var(--accent-hover); }
}
```

---

### DISEÑO 9 — Motors: reemplazar colores hardcoded con design tokens

**Fix en `motors.component.scss`** — En `.motor-card` y sus hijos, reemplazar:
```scss
background: white          → background: var(--surface)
border: 1px solid #e2e8f0  → border: 1px solid var(--outline)
box-shadow: 0 4px 6px...   → box-shadow: var(--shadow)
color: #0f172a             → color: var(--ink)
color: #64748b             → color: var(--muted)
border-bottom: 1px solid #f1f5f9 → border-bottom: 1px solid var(--outline)
border-top: 1px solid #e2e8f0    → border-top: 1px solid var(--outline)
background: #f8fafc              → background: rgba(15,23,42,0.02)
```

---

## 🔴 BUGS ACTIVOS — Prioridad máxima (Wendy)

### BUG A — HLS 401: hls.js no envía el JWT token

**Síntoma:** El video no carga. En la consola se ve:
```
GET http://177.247.175.4:8080/api/stream/1/hls 401 (Unauthorized)
```

**Causa raíz:** `hls.js` hace sus propios requests XHR nativos que **bypasean completamente el interceptor de Angular**. El header `Authorization: Bearer ...` nunca se envía.

**Token key:** `localStorage.getItem('motor_control_token')` (confirmado en `AuthService.tokenKey`).

**Fix — `camera-viewer.component.ts`:**

En el constructor de `new Hls({...})`, agregar `xhrSetup`:

```typescript
const token = localStorage.getItem('motor_control_token');

this.hls = new Hls({
    maxLiveSyncPlaybackRate: 1.5,
    xhrSetup: (xhr: XMLHttpRequest) => {
        if (token) {
            xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        }
    }
});
```

**Fix — `camera-detail.component.ts`:**

Aplica el mismo patrón donde se inicialice `new Hls({...})` en el componente:

```typescript
const token = localStorage.getItem('motor_control_token');

this.hls = new Hls({
    xhrSetup: (xhr: XMLHttpRequest) => {
        if (token) {
            xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        }
    }
});
```

---

### BUG B — `buildChart` TypeError: e is not iterable (TelemetryHistoryComponent)

**Síntoma:** En consola:
```
TypeError: e is not iterable at n.buildChart  ← función interna de Chart.js
  at loadHistory @ telemetry-history.component.ts
  at ngOnInit
```

**Causa raíz:** El endpoint `GET /api/admin/telemetry/history` devuelve una **respuesta paginada**:
```json
{ "total": 45, "page": 1, "pageSize": 100, "totalPages": 1, "since": "...", "data": [...] }
```
Pero `telemetry-history.component.ts` hace:
```typescript
this.http.get<any[]>(...).subscribe({ next: (res) => {
    let data = res || [];   // ← res es un OBJETO, no un array
    this.buildChart(data);  // ← buildChart hace [...data].sort() → FALLA
}});
```

**Fix — `telemetry-history.component.ts`, función `loadHistory`:**

Cambiar la línea de asignación de `data`:
```typescript
// ANTES:
let data = res || [];

// DESPUÉS:
let data: any[] = Array.isArray(res) ? res : ((res as any)?.data || []);
```

El resto de la función no cambia.

---

## ✅ COMPLETADO — Sistema de Diseño + Sidebar + Edge Config Modal (Wendy)
> Sidebar, app-shell, topbar, design tokens y modal de configuración Edge implementados.
> Las instrucciones de Tareas 1–4 abajo son referencia histórica.

## 🔴 PRIORIDAD MÁXIMA (historial) — Sistema de Diseño + Sidebar (Wendy)

### Contexto
El diseño actual del frontend Enterprise **no está al nivel del sistema anterior (MotorControlAPI)**.
El usuario necesita que se replique y mejore ese estilo profesional.
Lee la sección `🎨 Sistema de Diseño` en **AI_RULES.md** — tiene todos los tokens, tipografía y patrones exactos a usar.

---

### TAREA 1 — Global styles (`styles.scss`)

Agregar en `frontend/src/styles.scss`:
```scss
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=Space+Grotesk:wght@500;600;700&display=swap');

:root {
  --bg:           #f6f3ee;
  --ink:          #0b1220;
  --muted:        #667085;
  --surface:      #ffffff;
  --accent:       #2563EB;
  --accent-hover: #1D4ED8;
  --teal:         #14b8a6;
  --nav:          #0f172a;
  --nav-ink:      #f8fafc;
  --nav-muted:    rgba(248, 250, 252, 0.7);
  --outline:      rgba(15, 23, 42, 0.08);
  --shadow:       0 20px 45px rgba(15, 23, 42, 0.12);
  --green:        #10b981;
  --red:          #ef4444;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: 'IBM Plex Sans', sans-serif;
  background:
    radial-gradient(1200px circle at -10% -20%, #ffe6c7 0, transparent 60%),
    radial-gradient(900px circle at 110% 10%, #d3f4f0 0, transparent 55%),
    var(--bg);
  color: var(--ink);
  min-height: 100vh;
}
h1, h2, h3 { font-family: 'Space Grotesk', sans-serif; letter-spacing: -0.02em; }
```

---

### TAREA 2 — SidebarComponent (CRÍTICO — bloquea todo lo demás)

Crear `frontend/src/app/components/sidebar/sidebar.component.ts`:

```typescript
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss']
})
export class SidebarComponent {
  authService = inject(AuthService);

  get userName(): string {
    try {
      const p = JSON.parse(atob(this.authService.getToken()!.split('.')[1]));
      return p.name || p.email || 'Usuario';
    } catch { return 'Usuario'; }
  }

  get userRole(): string {
    try {
      const p = JSON.parse(atob(this.authService.getToken()!.split('.')[1]));
      return p.role === 'admin' ? 'Administrador' : 'Cliente';
    } catch { return ''; }
  }

  logout() { this.authService.logout(); }
}
```

`sidebar.component.html`:
```html
<aside class="sidebar">
  <div class="sidebar-logo">
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#93c5fd" stroke-width="2">
      <circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
    </svg>
    <div>
      <div style="font-size:13px;font-weight:500;color:var(--nav-muted)">MotorControl</div>
      <div style="font-size:15px;font-weight:700;color:var(--nav-ink)">Enterprise</div>
    </div>
  </div>

  <nav class="sidebar-nav">
    <a routerLink="/dashboard" routerLinkActive="active">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
        <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
      </svg>
      Dashboard
    </a>
    <a routerLink="/cameras" routerLinkActive="active">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/>
      </svg>
      Cámaras
    </a>
    <a routerLink="/motors" routerLinkActive="active">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83"/>
      </svg>
      Motores
    </a>
    <a routerLink="/clients" routerLinkActive="active">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        <polyline points="9,22 9,12 15,12 15,22"/>
      </svg>
      Clientes
    </a>
    <a routerLink="/users" routerLinkActive="active">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
      Usuarios
    </a>
  </nav>

  <div class="sidebar-user">
    <div class="user-avatar">{{ userName.charAt(0).toUpperCase() }}</div>
    <div class="user-info">
      <div class="user-name">{{ userName }}</div>
      <div class="user-role">{{ userRole }}</div>
    </div>
    <button class="logout-btn" (click)="logout()" title="Cerrar sesión">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>
      </svg>
    </button>
  </div>
</aside>
```

`sidebar.component.scss`:
```scss
.sidebar {
  width: 270px;
  background: linear-gradient(160deg, #0f172a 0%, #111827 65%, #0b1324 100%);
  display: flex; flex-direction: column;
  position: sticky; top: 0; height: 100vh;
}
.sidebar-logo {
  display: flex; align-items: center; gap: 12px;
  padding: 24px 20px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
}
.sidebar-nav {
  flex: 1; padding: 16px 12px;
  display: flex; flex-direction: column; gap: 2px;
  overflow-y: auto;
}
.sidebar-nav a {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 14px; border-radius: 10px;
  color: var(--nav-muted); text-decoration: none;
  font-size: 14px; font-weight: 500;
  transition: all 0.15s ease;
  svg { flex-shrink: 0; }
}
.sidebar-nav a:hover { background: rgba(255,255,255,0.08); color: var(--nav-ink); }
.sidebar-nav a.active { background: rgba(37,99,235,0.25); color: #93c5fd; }
.sidebar-user {
  display: flex; align-items: center; gap: 10px;
  padding: 16px 20px;
  border-top: 1px solid rgba(255,255,255,0.08);
}
.user-avatar {
  width: 34px; height: 34px; border-radius: 50%;
  background: #2563eb; color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: 14px; flex-shrink: 0;
}
.user-info { flex: 1; min-width: 0; }
.user-name { font-size: 13px; font-weight: 600; color: var(--nav-ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.user-role { font-size: 11px; color: var(--nav-muted); }
.logout-btn {
  background: transparent; border: none; cursor: pointer;
  color: var(--nav-muted); padding: 6px; border-radius: 6px;
  transition: all 0.15s;
  &:hover { background: rgba(239,68,68,0.15); color: #fca5a5; }
}
```

---

### TAREA 3 — App Shell en `app.component`

`app.component.html`:
```html
<ng-container *ngIf="isLoggedIn(); else loginOnly">
  <div class="app-shell">
    <app-sidebar></app-sidebar>
    <main class="main-content">
      <router-outlet></router-outlet>
    </main>
  </div>
</ng-container>
<ng-template #loginOnly>
  <router-outlet></router-outlet>
</ng-template>
```

`app.component.ts` — agregar:
```typescript
import { SidebarComponent } from './components/sidebar/sidebar.component';
// en imports del @Component: SidebarComponent, CommonModule, RouterOutlet
isLoggedIn(): boolean {
  return !!localStorage.getItem('motor_control_token');
}
```

`app.component.scss`:
```scss
.app-shell {
  display: grid;
  grid-template-columns: 270px minmax(0, 1fr);
  min-height: 100vh;
}
.main-content {
  padding: 28px 32px 48px;
  overflow-x: hidden;
  min-height: 100vh;
}
```

---

### TAREA 4 — Topbar en cada sección (patrón a replicar)

Cada componente debe tener en la parte superior:
```html
<div class="topbar">
  <div>
    <h1>Nombre</h1>
    <p class="subtitle">Subtítulo</p>
  </div>
  <button class="btn-primary">+ Acción</button>
</div>
```
```scss
// En styles.scss o en cada componente:
.topbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px; border-radius: 18px; margin-bottom: 24px;
  background: rgba(255,255,255,0.78);
  border: 1px solid rgba(255,255,255,0.5);
  box-shadow: 0 15px 30px rgba(15,23,42,0.08);
  backdrop-filter: blur(10px);
}
.topbar h1 { font-size: 22px; }
.subtitle { color: var(--muted); font-size: 13px; margin-top: 2px; }
.btn-primary {
  padding: 10px 18px; background: var(--accent); color: #fff;
  border: none; border-radius: 10px; font-weight: 600;
  cursor: pointer; transition: background 0.2s;
  &:hover { background: var(--accent-hover); }
}
.btn-secondary {
  padding: 10px 18px; background: transparent; color: var(--ink);
  border: 1px solid var(--outline); border-radius: 10px; font-weight: 500;
  cursor: pointer;
}
```

---

## 🔴 PRIORIDAD 1 — Bugs críticos (DashboardComponent)

### BUG 1 — Botones de cámara hardcodeados
**Archivo:** `dashboard.component.html` líneas 46-52

Los botones de cámara usan URLs hardcodeadas a `localhost:8888`. Reemplazar por datos reales del API.

**Fix:** Cargar cámaras desde `GET /api/cameras` y renderizarlas dinámicamente:
```typescript
// En dashboard.component.ts
cameras = signal<any[]>([]);

ngOnInit() {
  this.http.get<any[]>('/api/cameras').subscribe(c => this.cameras.set(c));
}

// URL del stream: cam.streams?.hls ?? `/api/admin/stream/${cam.id}/hls`
```

```html
<!-- Reemplazar los 2 botones hardcodeados por: -->
<div *ngFor="let cam of cameras()" style="margin-bottom:6px;">
  <button class="cam-btn" (click)="viewCamera(cam.streams?.hls ?? '/api/admin/stream/' + cam.id + '/hls')">
    🎥 {{ cam.name }}
  </button>
</div>
<p *ngIf="cameras().length === 0" style="font-size:12px;color:var(--muted)">Sin cámaras asignadas</p>
```
Además, el card "Cámaras Online" muestra `--`. Cambiarlo a:
```typescript
camerasOnline = computed(() => this.cameras().filter(c =>
  c.lastSeen && (Date.now() - new Date(c.lastSeen).getTime()) < 60000
).length);
```
```html
<strong style="font-size: 1.8rem; color: var(--ink);">{{ camerasOnline() }}</strong>
```

---

## 🟠 PRIORIDAD 2 — Features faltantes

### 2A — CamerasComponent: columna de estado + búsqueda
**Archivo:** `cameras.component.html`

**Agregar antes de la tabla** un input de búsqueda que filtre por nombre/ubicación:
```html
<div style="margin-bottom:16px;">
  <input type="text" class="form-control" placeholder="🔍 Buscar cámara..."
    [(ngModel)]="searchTerm" style="max-width:320px;">
</div>
```
```typescript
searchTerm = signal('');
filtered = computed(() =>
  this.cameras().filter(c =>
    c.name.toLowerCase().includes(this.searchTerm().toLowerCase()) ||
    (c.location ?? '').toLowerCase().includes(this.searchTerm().toLowerCase())
  )
);
// usar filtered() en el *ngFor
```

**Agregar columna Estado** en la tabla (después de "Nombre"):
```html
<th>Estado</th>
<!-- en cada fila: -->
<td>
  <span class="badge" [class.online]="isOnline(cam)" [class.offline]="!isOnline(cam)">
    {{ isOnline(cam) ? 'Online' : 'Offline' }}
  </span>
</td>
```
```typescript
isOnline(cam: any): boolean {
  return cam.lastSeen && (Date.now() - new Date(cam.lastSeen).getTime()) < 60000;
}
```

---

### 2B — ClientsComponent: búsqueda + columnas faltantes + form completo
**Archivo:** `clients.component.html`

**1. Agregar búsqueda** (igual que en cámaras):
```html
<div style="margin-bottom:16px; display:flex; gap:12px; align-items:center;">
  <input type="text" class="form-control" placeholder="🔍 Buscar cliente..."
    [(ngModel)]="searchTerm" style="max-width:320px;">
  <span style="font-size:13px; color:var(--muted);">{{ filtered().length }} clientes</span>
</div>
```

**2. Agregar columnas en tabla** — después de "Tipo Negocio" agregar:
```html
<th>Ubicación</th>
<th>Contacto</th>
<!-- y en las filas: -->
<td>{{ client.city || '—' }}{{ client.state ? ', ' + client.state : '' }}</td>
<td>
  <div style="font-size:13px;">{{ client.contactName || '—' }}</div>
  <div style="font-size:11px; color:var(--muted);">{{ client.contactPhone || '' }}</div>
</td>
```

**3. Cambiar `businessType` a dropdown en el modal:**
```html
<select [(ngModel)]="currentClient().businessType" class="form-control">
  <option value="">-- Seleccionar --</option>
  <option value="Retail">Retail</option>
  <option value="Restaurante">Restaurante</option>
  <option value="Oficina">Oficina</option>
  <option value="Bodega">Bodega</option>
  <option value="Manufactura">Manufactura</option>
  <option value="Otro">Otro</option>
</select>
```

**4. Completar campos del modal** (agregar después de los 4 campos actuales):
```html
<div class="form-row">
  <div class="form-group">
    <label>Estado</label>
    <input type="text" [(ngModel)]="currentClient().state" class="form-control">
  </div>
  <div class="form-group">
    <label>País</label>
    <input type="text" [(ngModel)]="currentClient().country" class="form-control" value="México">
  </div>
</div>
<div class="form-row">
  <div class="form-group">
    <label>Nombre del Contacto</label>
    <input type="text" [(ngModel)]="currentClient().contactName" class="form-control">
  </div>
  <div class="form-group">
    <label>Teléfono</label>
    <input type="tel" [(ngModel)]="currentClient().contactPhone" class="form-control">
  </div>
</div>
<div class="form-group">
  <label>Email del Contacto</label>
  <input type="email" [(ngModel)]="currentClient().contactEmail" class="form-control">
</div>
```

---

### 2C — CameraDetailComponent: PTZ diagonal + presets
**Archivo:** `cameras/camera-detail.component.html`

La grilla PTZ actual solo tiene 4 direcciones cardinales. Agregar las diagonales y presets:

```html
<!-- Reemplazar joystick-grid por: -->
<div class="joystick-grid">
  <button class="ptz-btn diag" (mousedown)="ptzMove(-70, 70, 0)" (mouseup)="ptzStop()" (mouseleave)="ptzStop()">↖</button>
  <button class="ptz-btn" (mousedown)="ptzMove(0, 100, 0)" (mouseup)="ptzStop()" (mouseleave)="ptzStop()">⬆️</button>
  <button class="ptz-btn diag" (mousedown)="ptzMove(70, 70, 0)" (mouseup)="ptzStop()" (mouseleave)="ptzStop()">↗</button>

  <button class="ptz-btn" (mousedown)="ptzMove(-100, 0, 0)" (mouseup)="ptzStop()" (mouseleave)="ptzStop()">⬅️</button>
  <button class="ptz-btn stop" (click)="ptzStop()">⏹️</button>
  <button class="ptz-btn" (mousedown)="ptzMove(100, 0, 0)" (mouseup)="ptzStop()" (mouseleave)="ptzStop()">➡️</button>

  <button class="ptz-btn diag" (mousedown)="ptzMove(-70, -70, 0)" (mouseup)="ptzStop()" (mouseleave)="ptzStop()">↙</button>
  <button class="ptz-btn" (mousedown)="ptzMove(0, -100, 0)" (mouseup)="ptzStop()" (mouseleave)="ptzStop()">⬇️</button>
  <button class="ptz-btn diag" (mousedown)="ptzMove(70, -70, 0)" (mouseup)="ptzStop()" (mouseleave)="ptzStop()">↘</button>
</div>

<!-- Agregar presets después del zoom: -->
<div class="presets-section" *ngIf="presets().length > 0">
  <h4 style="font-size:12px;color:var(--muted);margin:12px 0 6px;">Presets</h4>
  <div style="display:flex;gap:6px;flex-wrap:wrap;">
    <button class="ptz-btn" *ngFor="let p of presets()" (click)="gotoPreset(p.id)"
      style="font-size:11px;padding:4px 8px;">{{ p.name }}</button>
  </div>
</div>
```

```typescript
// En camera-detail.component.ts:
presets = signal<any[]>([]);

ngOnInit() {
  // cargar presets si PTZ
  if (this.camera()?.ptz) {
    this.http.get<any[]>(`/api/cameras/${this.cameraId}/ptz/presets`)
      .subscribe(p => this.presets.set(p));
  }
}

gotoPreset(presetId: string) {
  this.http.post(`/api/cameras/${this.cameraId}/ptz/presets/${presetId}/goto`, {}).subscribe();
}
```

---

### 2D — TelemetryDashboardComponent + RecordingsComponent
**Ya documentados antes — verificar que estén conectados a API real.**

`GET /api/admin/telemetry/live` → polling cada 5s → campos: `deviceId, speed, current, voltage, state, isOnline`
`GET /api/recordings/cloud/{id}/dates` → array de strings "YYYY-MM-DD"
`GET /api/recordings/cloud/{id}?date=YYYY-MM-DD` → `[{filename, name, size, path, duration}]`
`GET /api/recordings/cloud/video?path=ENCODED` → stream del video (usar como `src` del `<video>`)

---

## 🔴 PRIORIDAD MÁXIMA — Auth 401 Handler (Wendy)

### PROBLEMA
El interceptor actual (`auth.interceptor.ts`) solo agrega el token a los requests pero **NO maneja el 401**. Cuando el token expira:
- El usuario sigue viendo el dashboard con sidebar
- Todas las llamadas al API fallan silenciosamente con 401
- No hay redirect automático al login
- El usuario queda "atrapado" sin poder hacer nada

### FIX — `frontend/src/app/interceptors/auth.interceptor.ts`

Reemplazar el archivo completo con:

```typescript
import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
    const authService = inject(AuthService);
    const router = inject(Router);
    const token = authService.getToken();

    const cloned = token
        ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
        : req;

    return next(cloned).pipe(
        catchError((err: HttpErrorResponse) => {
            if (err.status === 401) {
                authService.logout();
            }
            return throwError(() => err);
        })
    );
};
```

**Nota:** `AuthService.logout()` ya hace `localStorage.removeItem(tokenKey)` y navega a `/login`. No hay que cambiar nada más.

---

## 📩 PENDIENTES PARA BENDI

### *** PLAN NVR/DVR — 23 FEB 2026 ***

> **Arquitectura definitiva:**
> - Video en vivo: Cámara → Edge → MediaMTX relay → Central → HLS → Frontend
> - Grabación cloud: Edge relay → StreamRecorderService (ffmpeg) → NAS .mp4
> - Grabación local: Cámara → NVR/DVR → Monitor físico (100% local, sin API)
> - Playback cloud: Frontend → `/api/recordings/cloud/video?token=` → NAS → HTTP 206
> - Playback NVR (futuro): Frontend → `/api/recordings/nvr/{id}` → MQTT → Edge NVR module → RTSP→HLS

---

### ✅ BENDI-1: Campos NVR en modelo Client (commit de6c0b4)
- `LocalStorageType` ("nvr"/"dvr"/"sd"/"none", default "nvr")
- `NvrIp`, `NvrPort`, `NvrUser`, `NvrPassword`, `NvrBrand`
- `AdminSeederService`: ALTER TABLE IF NOT EXISTS para DBs existentes (no requiere migración manual)
- `ClientController` GET/PUT: expone y acepta todos los campos
- `WizardController` edge .env: genera sección `NVR_TYPE/IP/PORT/USER/PASSWORD/BRAND`

### ✅ BENDI-2: Cloud Recordings — backend listo (commit 52f23ef + 6ee202f)
- StreamRecorderService graba a `/mnt/nas/recordings/`
- GET /api/recordings/cloud/{cameraId}/dates → `{ dates: [...] }` ✅
- GET /api/recordings/cloud/{cameraId}?date= → `{ files: [{name, path, sizeMb, startTime}] }` ✅
- GET /api/recordings/cloud/video?path=&token= → HTTP 206 video/mp4 ✅

### ⏳ BENDI-3: Deprecar endpoints SD local — ESPERAR a Wendy
- Estos endpoints siguen activos porque el admin `RecordingsComponent` aún los llama:
  - `GET /api/recordings/local/{cameraId}?date=`
  - `POST /api/recordings/local/{cameraId}/play`
- Solo deprecar cuando Wendy elimine la sección "Local" del admin `RecordingsComponent`
- `GET /api/recordings/sd/{cameraId}` ya devuelve datos del gateway MQTT (está bien)

### ⚠️ BENDI-4 → ES TAREA DE WENDY, NO DE BENDI
El toggle-switch CSS es código frontend (`client-detail.component.scss`).
Bendi no edita archivos de `/frontend` (ver AI_RULES.md).
**Wendy debe agregar:**
```scss
.toggle-switch {
  position: relative; display: inline-block; width: 48px; height: 26px;
  input { opacity: 0; width: 0; height: 0; }
  .slider {
    position: absolute; inset: 0; background: #cbd5e1; border-radius: 26px; cursor: pointer; transition: 0.3s;
    &::before { content: ''; position: absolute; height: 20px; width: 20px; left: 3px; bottom: 3px; background: white; border-radius: 50%; transition: 0.3s; }
  }
  input:checked + .slider { background: var(--accent); }
  input:checked + .slider::before { transform: translateX(22px); }
}
```
**Archivo:** `frontend/src/app/components/client-portal/client-detail.component.scss`

### ✅ NVR-BACK-3: Endpoints proxy NVR en RecordingController (commit de6c0b4)
- `GET /api/recordings/nvr/{cameraId}?date=` → MQTT proxy a edge `nvr/listRecordings`
- `GET /api/recordings/nvr/{cameraId}/playback?start=&end=&channel=` → MQTT proxy a edge `nvr/startPlayback`
- ⚠️ **Depende de NVR-BACK-2** (módulo edge-agent, repo separado `motorcontrol-edge-template`)
- Los endpoints responden 504 hasta que el edge-agent implemente el módulo NVR

### ⏳ NVR-BACK-2: Edge-Agent — módulo proxy ISAPI/NVR (repo: motorcontrol-edge-template)
El edge-agent necesita MQTT listeners para:
- Tópico: `edge/{gatewayId}/nvr/listRecordings` — consulta ISAPI del NVR y devuelve lista
- Tópico: `edge/{gatewayId}/nvr/startPlayback` — inicia RTSP→HLS relay del NVR, devuelve hlsPath
- Lee `NVR_IP`, `NVR_PORT`, `NVR_USER`, `NVR_PASSWORD`, `NVR_BRAND` del `.env`
```

---

## 🔴 ADMIN-3 — Grabaciones Cloud: 3 fixes en RecordingsComponent (Wendy)

> **Contexto:** Bendi ya tiene el backend listo (commit 6ee202f). El backend ahora acepta
> el token JWT como query param `?token=...` para el endpoint de video, igual que MotorControlAPI.
> Solo faltan 3 correcciones en el frontend para que funcione.

### Fix 1 — `loadAvailableDates`: respuesta tiene wrapper `{dates: [...]}`

El endpoint `GET /api/recordings/cloud/{id}/dates` retorna `{ dates: string[] }`, no `string[]` directo.

**Cambiar en `recordings.component.ts` línea 42-56:**
```typescript
// ❌ ACTUAL — espera array directo
loadAvailableDates() {
    this.http.get<string[]>(`${API_URL}/recordings/cloud/${this.cameraId()}/dates`).subscribe({
        next: (dates) => {
            this.availableDates.set(dates || []);
```

```typescript
// ✅ FIX — extraer .dates del wrapper
loadAvailableDates() {
    this.http.get<any>(`${API_URL}/recordings/cloud/${this.cameraId()}/dates`).subscribe({
        next: (res) => {
            const dates = res?.dates || [];
            this.availableDates.set(dates);
```

---

### Fix 2 — `loadCloudRecordings`: respuesta tiene wrapper `{files: [...]}`

El endpoint `GET /api/recordings/cloud/{id}?date=...` retorna `{ date, cameraId, files: [...] }`.

**Cambiar en `recordings.component.ts` línea 66-71:**
```typescript
// ❌ ACTUAL — espera array directo
loadCloudRecordings(date: string) {
    this.http.get<any[]>(`${API_URL}/recordings/cloud/${this.cameraId()}?date=${date}`).subscribe({
        next: (files) => this.cloudRecordings.set(files || []),
```

```typescript
// ✅ FIX — extraer .files del wrapper
loadCloudRecordings(date: string) {
    this.http.get<any>(`${API_URL}/recordings/cloud/${this.cameraId()}?date=${date}`).subscribe({
        next: (res) => this.cloudRecordings.set(res?.files || []),
```

---

### Fix 3 — `playCloudVideo`: usar `?token=...` en la URL del video

El elemento `<video src>` no puede enviar headers de Authorization. Bendi ya habilitó soporte
de JWT como query param en el backend (igual que MotorControlAPI).

**Cambiar en `recordings.component.ts` línea 80-85:**
```typescript
// ❌ ACTUAL — src sin auth, da 401
playCloudVideo(filePath: string) {
    const src = `${API_URL}/recordings/cloud/video?path=${encodeURIComponent(filePath)}`;
    this.currentVideoSource.set(src);
    this.initVideoSrc(src);
}
```

```typescript
// ✅ FIX — incluir token en query param
playCloudVideo(filePath: string) {
    const token = localStorage.getItem('motor_control_token') || '';
    const src = `${API_URL}/recordings/cloud/video?path=${encodeURIComponent(filePath)}&token=${encodeURIComponent(token)}`;
    this.currentVideoSource.set(src);
    this.initVideoSrc(src);
}
```

---

### Bonus — cada `file` tiene `.path` (no `.filePath`)

El modelo de respuesta de cloud recordings usa la propiedad `path`. Verificar en el HTML que el click
pase `file.path` al método `playCloudVideo`:

```html
<!-- recordings.component.html — verificar que sea file.path -->
<div class="file-item" *ngFor="let file of cloudRecordings()" (click)="playCloudVideo(file.path)">
```

---

## ✅ COMPLETADO POR BENDI

- ✅ GET /api/admin/auth/users — lista todos los usuarios (id, email, name, role, isActive, createdAt, lastLogin)
- ✅ PATCH /api/admin/auth/users/{id}/status — activar/desactivar usuario {isActive: bool}
- ✅ DELETE /api/admin/auth/users/{id} — protegido: no puede eliminarse a sí mismo
- ✅ Global camelCase JSON — todas las respuestas ahora en camelCase (deviceId, speed, current, etc.)
- ✅ /api/admin/telemetry/live — ahora devuelve `isOnline` y `online` además de `isActive`
- ✅ CameraController: acepta `{name, location, rtspUrl, clientId, ptz}`, devuelve `rtspUrl`
- ✅ CameraController: UserId auto-set desde JWT (ya no falla al crear cámaras)
- ✅ ClientController: CameraCount real (corregido el bug que devolvía el Id del cliente)
- ✅ Auth admin + usuario con JWT claims cortos (`role`, `name`, `sub`, `email`)
- ✅ Motores: commands, arranque6p, continuo, paro, telemetría
- ✅ Stream HLS + PTZ + SD Card + Grabaciones
- ✅ Docker stack completo en producción (backend + frontend + nginx)
- ✅ MQTT camera auto-registro desde edge gateway (gatewayId → Client → UserId correcto)
- ✅ MQTT camera/status: usa campo `online` bool del edge-template para actualizar Status
- ✅ GET /api/admin/clients/{id}/edge-config — genera .env + docker-compose.yml + mediamtx.yml para edge deployment
- ✅ MQTT subscriptions: camera/+/+/events y camera/+/+/stats (log de eventos y stats de streaming)
- ✅ Email alerts (Resend.dev): cámara offline, cámara online, nueva cámara registrada
- ✅ GET /health/test-email — envía email de prueba (requiere Email:ResendApiKey en appsettings)
- ✅ ClientController: cascade soft-delete — desactiva cámaras del cliente al eliminar cliente

## ✅ COMPLETADO POR WENDY

- ✅ Login + JWT interceptor + **401 auto-redirect a login** (catchError pipe)
- ✅ Dashboard conectado a `/api/clients` + cámaras dinámicas del API (fix hardcoded localhost)
- ✅ Dashboard: card "Cámaras Online" conectado a `camerasOnline()` computed
- ✅ TelemetryDashboard + ChartJS
- ✅ MotorControlComponent + MotorsComponent
- ✅ CamerasComponent (tabla admin + búsqueda + columna Estado online/offline)
- ✅ CameraDetailComponent (HLS.js + PTZ 8 direcciones + presets + ViewChild fix)
- ✅ ClientsComponent (búsqueda + columnas Ubicación/Contacto + dropdown businessType + form completo)
- ✅ ClientDetailComponent + Edge Config Modal (tabs .env / docker-compose / mediamtx + credenciales MQTT)
- ✅ RecordingsComponent (cloud + SD card + video player)
- ✅ Landing Page (`/`) + Wizard Onboarding (`/wizard`)
- ✅ App-shell (sidebar + main-content) + design tokens implementados
- ✅ Rutas: `/`, `/dashboard`, `/cameras/:id`, `/motors`, `/clients`, `/clients/:id`, `/recordings/:id`, `/users`, `/wizard`
- ✅ **Bug A fix:** HLS xhrSetup con JWT token (camera-viewer + camera-detail)
- ✅ **Bug B fix:** TelemetryHistory maneja respuesta paginada `{data:[...]}` + URL correcta
- ✅ **DISEÑO 1-9:** Rediseño visual completo — paridad con MotorControlAPI
  - Dashboard sin inline styles + stat/device cards + telemetry grid
  - Panel NVR oscuro en cámaras con grilla adaptable 1×1/2×2/3×3
  - Wrapper `.clients-layout` en clients/cameras/users para CSS scoping
  - Sidebar CSS vars fijas, Login font IBM Plex Sans, Camera-detail `.topbar`
  - Motors design tokens, Recordings/Clients link classes
- ✅ **ADMIN-1:** Wizard 5 pasos — fix token key, camera API creation, user name/role en signup
- ✅ **ADMIN-2:** Cloud Storage Toggle en ClientDetail — switch con PATCH /api/clients/{id}
- ✅ **CLIENT-1:** Rutas portal cliente `/client/*` con `clientAuthGuard` + `adminAuthGuard`
- ✅ **CLIENT-2:** ClientLoginComponent — `POST /api/auth/login`, dark theme, redirect inteligente
- ✅ **CLIENT-3:** ClientCamerasComponent — NVR grid 1×1/2×2/3×3, HLS streaming
- ✅ **CLIENT-4:** ClientCameraDetailComponent — video full-size HLS + controles PTZ
- ✅ **CLIENT-5:** ClientRecordingsComponent — cloud dates + blob URL player + SD card
- ✅ **CLIENT-6:** ClientShellComponent — topbar oscuro con brand, username, logout
- ✅ **CLIENT-7:** Redirección inteligente por rol (admin→/dashboard, client→/client/cameras)
- ✅ **ADMIN-3:** Grabaciones Cloud fixes — dates wrapper, files wrapper, token query param, campos correctos (sizeMb, startTime)

---

## 🗺️ PLAN 100% — COMPLETAR MOTORCONTROLENTERPRISE

> Análisis comparativo MotorControlAPI → Enterprise. Tareas pendientes para llegar al 100%.

---

### 📋 RESUMEN EJECUTIVO — ¿Qué falta?

| Categoría | Estado | Responsable |
|-----------|--------|-------------|
| Backend — Auth cliente (login/signup) | ✅ Hecho | Claude (commit 52f23ef) |
| Backend — Servicio grabación cloud (stream-recorder) | ✅ Hecho | Claude (commit 52f23ef) |
| Backend — Servicio limpieza storage (storage-cleaner) | ✅ Hecho | Claude (commit 52f23ef) |
| Backend — Servicio backup PostgreSQL | ✅ Hecho | Claude (commit 52f23ef) |
| Backend — API cloud recordings (listar/reproducir) | ✅ Hecho | Claude (commit 52f23ef) |
| Backend — Rutas alias SD card `/api/recordings/sd/*` | ✅ Hecho | Bendi (commit a332bc1) |
| Backend — Campos NVR en Client + proxy endpoints | ✅ Hecho | Bendi (commit de6c0b4) |
| Infraestructura — docker-compose.yml con servicios completos | ✅ Hecho | Claude (commit 52f23ef) |
| Frontend Admin — Wizard 5 pasos completo | ✅ Hecho | Wendy (commit 80b9ac2) |
| Frontend Admin — Grabaciones cloud funcionales | ✅ Hecho | Wendy (commit 9bc8b43) |
| Frontend Cliente — Portal completo (login + cámaras + grabaciones) | ✅ Hecho | Wendy (commit 80b9ac2) |

---

## ✅ COMPLETADO POR BENDI — BACK-1 a BACK-7 (commit 52f23ef)

- ✅ **BACK-1:** `UserAuthController.cs` — `POST /api/auth/login`, `POST /api/auth/signup`, `GET /api/auth/verify`, `POST /api/auth/logout` para usuarios no-admin
- ✅ **BACK-2:** `RecordingController.cs` — API cloud recordings corregida (bugs: path traversal, directorios con GatewayId/CameraId, timestamp HH-mm-ss)
- ✅ **BACK-3:** `StreamRecorderService.cs` — BackgroundService ffmpeg graba streams a `/mnt/nas/recordings/{gatewayId}/{cameraId}/{date}/{time}.mp4`
- ✅ **BACK-4:** `StorageCleanerService.cs` — BackgroundService limpia carpetas >30 días cada 24h
- ✅ **BACK-5:** `postgres-backup` container en docker-compose — `pg_dump` cada 24h, retención 7 backups
- ✅ **BACK-6:** `Client.CloudStorageActive` ya existía en el modelo
- ✅ **BACK-7:** `docker-compose.yml` — volumen NAS bind mount para backend + postgres-backup container; `Dockerfile` agrega ffmpeg
- ✅ **BACK-8:** `RecordingController.cs` — rutas alias `GET /api/recordings/sd/{cameraId}` y `GET /api/recordings/sd/video` para compatibilidad con portal cliente (commit a332bc1)

---

## ⚠️ PENDIENTE WENDY — SD Card Playback en ClientRecordingsComponent

**Archivo:** `frontend/src/app/components/client-portal/client-recordings.component.ts`

**Problema:** `playSdRecording(rec)` actualmente hace:
```typescript
this.currentVideo.set(`/api/recordings/sd/video?path=${encodeURIComponent(rec.path || rec.filename)}`);
```
Ese endpoint devuelve **501** porque los archivos SD no son accesibles directamente desde el servidor — están en la tarjeta SD de la cámara y requieren relay MQTT.

**Flujo correcto (2 pasos):**
1. `POST /api/cameras/{cameraId}/sdcard/play` con body `{ "playbackUri": rec.playbackUri }`
2. Respuesta del edge incluye `{ "hlsPath": "http://..." }` → usar ese URL en el `<video src>`

**Fix que necesita Wendy en `playSdRecording()`:**
```typescript
playSdRecording(rec: any) {
    if (!rec.playbackUri) {
        console.warn('SD recording sin playbackUri:', rec);
        return;
    }
    this.http.post<any>(`/api/cameras/${this.cameraId()}/sdcard/play`,
        { playbackUri: rec.playbackUri }).subscribe({
        next: (res) => {
            if (res.hlsPath) this.currentVideo.set(res.hlsPath);
            else console.warn('Edge no devolvió hlsPath', res);
        },
        error: (err) => console.error('Error iniciando SD playback:', err)
    });
}
```

**Nota:** El campo `playbackUri` lo devuelve el edge gateway en la respuesta de `listSdRecordings`. Si el edge no lo devuelve, este flujo no funcionará hasta actualizar el firmware del edge — pero es un problema en el edge, no en el frontend/backend.

---

## 🔧 REFERENCIA — BACK-1 a BACK-7 (documentación original)

### BACK-1: Auth cliente (usuarios no-admin)

**Contexto:** En MotorControlAPI existen dos portales: admin (`/admin/`) y cliente (`/login.html`). Los usuarios con `role = 'client'` hacen login en el portal cliente y solo ven sus propias cámaras. En Enterprise actualmente solo existe `POST /api/admin/auth/login` para admins.

**Endpoints a crear:**

```
POST /api/auth/login
Body: { email, password }
Response: { token, user: { id, email, name, role } }
- Busca usuario por email
- Valida password con BCrypt
- Genera JWT con claims: sub=userId, email, role, name
- NO requiere role='admin' (cualquier usuario activo puede loguear)
- Retorna 401 si inválido, 200+token si correcto
```

```
POST /api/auth/signup
Body: { email, password, name }
Response: { token, user: { id, email, name, role } }
- Verifica email único
- Crea usuario con role='client', isActive=true
- Hashea password con BCrypt
- Genera JWT
- Retorna 409 si email ya existe, 201+token si correcto
```

```
GET /api/auth/verify
Headers: Authorization: Bearer {token}
Response: { success: true, user: { id, email, role } }
- Verifica que el token JWT sea válido
- Usado por el portal cliente al cargar para verificar sesión activa
```

**Controlador:** `backend/Controllers/AuthController.cs` (nuevo archivo — NO confundir con AdminAuthController.cs)
**Ruta base:** `/api/auth/` (sin el prefijo `/admin/`)
**Middleware:** Solo `[Authorize]` (no `[AdminOnly]`) para los endpoints que requieren token

---

### BACK-2: API Cloud Recordings

**Contexto:** El stream-recorder (BACK-3) guarda MP4s en NAS con estructura:
`/mnt/nas/recordings/{clientId}/{cameraId}/{YYYY-MM-DD}/{HH-MM-SS}.mp4`

**Endpoints a crear:**

```
GET /api/recordings/cloud/{cameraId}/dates
Headers: Authorization: Bearer {token}
Response: { success: true, dates: ['2026-02-23', '2026-02-22', ...] }
- Escanea el directorio NAS: /mnt/nas/recordings/{clientId}/{cameraId}/
- Retorna folders de fecha ordenados desc (más reciente primero)
- Access control: admin ve todo, client solo sus cámaras
- Retorna [] si no hay grabaciones aún
```

```
GET /api/recordings/cloud/{cameraId}?date=YYYY-MM-DD
Headers: Authorization: Bearer {token}
Response: { success: true, date, cameraId, files: [
  { name: "14-30-00.mp4", path: "clientId/cameraId/2026-02-23/14-30-00.mp4",
    sizeMb: 42.5, startTime: "2026-02-23T14:30:00Z" }
]}
- Escanea dateDir y retorna archivos .mp4 con metadata (size, parsed timestamp)
- Access control: verifica ownership del cameraId
```

```
GET /api/recordings/cloud/video?path={relativePath}
Headers: Authorization: Bearer {token}
Range: bytes=0-  (support HTTP 206 para video seekable)
Response: 206 Partial Content, video/mp4
- path ej: "edge-gateway-raspberry/cam-principal/2026-02-23/14-30-00.mp4"
- Resuelve a /mnt/nas/recordings/{path}
- Valida path (no directory traversal: path.Contains("..") → 400)
- Verifica acceso: extrae clientId del path, busca ownership en DB
- Soporta Range headers para seek en video player
```

**Access control pattern:**
- Si el usuario JWT tiene `role='admin'` → acceso a todo
- Si `role='client'` → busca las cámaras del userId → verifica que cameraId pertenezca al usuario

**Controlador:** `backend/Controllers/RecordingsController.cs` (nuevo)
**NAS path:** Se configura en `appsettings.json`: `"Storage": { "RecordingsPath": "/mnt/nas/recordings" }`

---

### BACK-3: Servicio Stream-Recorder (grabación continua)

**Contexto:** En MotorControlAPI es un contenedor separado con un script bash que usa ffmpeg. Para Enterprise lo implementamos como un **BackgroundService de .NET** dentro del backend — más fácil de mantener, acceso directo a la DB.

**Implementar:** `backend/Services/StreamRecorderService.cs`

```csharp
// BackgroundService que:
// 1. Cada 5 minutos: consulta DB → cameras activas con cliente que tiene CloudStorageEnabled=true
// 2. Para cada cámara activa: verifica si ya hay un proceso ffmpeg grabando (diccionario interno)
// 3. Si no hay proceso: lanza ffmpeg para grabar segmentos de 15 min
// 4. Si la cámara se desactivó: mata el proceso ffmpeg correspondiente
//
// ffmpeg command:
// ffmpeg -i rtsp://edge:edge123@central-mediamtx:8554/{clientGatewayId}/{cameraChannelId}
//        -c copy
//        -f segment -segment_time 900
//        -segment_format mp4
//        -movflags +frag_keyframe+empty_moov
//        -strftime 1
//        /mnt/nas/recordings/{gatewayId}/{cameraId}/%Y-%m-%d/%H-%M-%S.mp4
//        -reset_timestamps 1
//
// Naming: /mnt/nas/recordings/{client.GatewayId}/{camera.ChannelId}/{YYYY-MM-DD}/{HH-MM-SS}.mp4
// Timezone: America/Mexico_City (configurar TZ=America/Mexico_City en docker-compose)
```

**DB fields requeridos:**
- `Client.GatewayId` — ya existe ✅
- `Client.CloudStorageEnabled` (bool) — **AGREGAR a Client model** (equivalente a `cloud_storage_active`)
- `Camera.ChannelId` — ya existe como el campo usado en RTSP ✅
- `Camera.IsActive` — ya existe ✅

**Config en appsettings.json:**
```json
"StreamRecorder": {
  "RecordingsPath": "/mnt/nas/recordings",
  "SegmentSeconds": 900,
  "RefreshIntervalSeconds": 300,
  "RtspBase": "rtsp://edge:edge123@central-mediamtx:8554"
}
```

**Registro en Program.cs:**
```csharp
builder.Services.AddHostedService<StreamRecorderService>();
```

---

### BACK-4: Servicio Storage Cleaner

**Contexto:** En MotorControlAPI es un contenedor Node.js separado. En Enterprise lo hacemos como BackgroundService.

**Implementar:** `backend/Services/StorageCleanerService.cs`

```csharp
// BackgroundService que:
// - Ejecuta UNA VEZ al día (Timer con 24h)
// - Para cada cliente con CloudStorageEnabled=true:
//   1. Borra carpetas de fecha con más de 30 días de antigüedad
//   2. Calcula total de GB usados en /mnt/nas/recordings/{gatewayId}/
//   3. Si supera quota (configurable, default 100GB por cliente):
//      borra el día más antiguo hasta quedar bajo quota
// - Log: "StorageCleaner: eliminados {n} archivos, {gb}GB liberados"
```

**Config en appsettings.json:**
```json
"StorageCleaner": {
  "RecordingsPath": "/mnt/nas/recordings",
  "RetentionDays": 30,
  "QuotaGBPerClient": 100,
  "RunAtHour": 3
}
```

---

### BACK-5: Backup PostgreSQL

**Contexto:** En MotorControlAPI es un contenedor postgres que ejecuta `pg_dump` periódicamente. En Enterprise lo hacemos como BackgroundService o dejamos el contenedor separado.

**Opción A (recomendada): BackgroundService en .NET**

```csharp
// backend/Services/PostgresBackupService.cs
// - Ejecuta pg_dump via Process cada 24h
// - Guarda en /mnt/nas/backups/postgres/{YYYY-MM-DD-HH-mm}.sql.gz
// - Mantiene solo los últimos 7 backups (borra el más viejo)
// - Requiere que el contenedor backend tenga pg_dump instalado
//   → agregar a Dockerfile: RUN apt-get install -y postgresql-client
```

**Opción B: Contenedor separado en docker-compose.yml**
```yaml
postgres-backup:
  image: postgres:16-alpine
  environment:
    PGPASSWORD: ${DB_PASSWORD}
  volumes:
    - /mnt/nas/backups/postgres:/backups
  entrypoint: |
    sh -c "while true; do
      pg_dump -h mce-postgres -U motor_ent MotorControlEnterprise |
      gzip > /backups/backup-$(date +%Y%m%d-%H%M).sql.gz
      find /backups -mtime +7 -delete
      sleep 86400
    done"
```

---

### BACK-6: Campo CloudStorageEnabled en Client

**Agregar a:** `backend/Models/Client.cs`
```csharp
public bool CloudStorageEnabled { get; set; } = false;
```

**Migración EF Core:**
```bash
dotnet ef migrations add AddCloudStorageEnabled
dotnet ef database update
```

**Actualizar CameraController/ClientController** para incluir `CloudStorageEnabled` en respuestas y aceptarlo en PUT/PATCH.

---

### BACK-7: docker-compose.yml — Completar con todos los servicios

**Agregar al `docker-compose.yml` de Enterprise:**

```yaml
volumes:
  nas-recordings:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /mnt/nas/recordings   # ← montar NAS real en producción
  nas-backups:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /mnt/nas/backups

services:
  # Agregar mount de volumen al servicio backend:
  mce-backend:
    volumes:
      - nas-recordings:/mnt/nas/recordings
      - nas-backups:/mnt/nas/backups
    environment:
      - TZ=America/Mexico_City
```

**Nota de producción:** `/mnt/nas/recordings` debe ser un directorio que exista en el servidor. Si no hay NAS real, usar un directorio local como `/home/victormanuel/recordings` y crear el bind mount manualmente:
```bash
mkdir -p /home/victormanuel/recordings
mkdir -p /home/victormanuel/backups
```

---

## 🎨 TAREAS ANTIGRAVITY (FRONTEND ADMIN — PENDIENTES)

### ADMIN-1: Wizard — Revisión 5 pasos completos

**Estado actual:** Wizard existe con 4 pasos pero puede estar incompleto. Revisar contra MotorControlAPI.

**Paso 1 — Datos del Cliente:**
- Campos: `name`, `businessType` (select), `contactName`, `contactPhone`, `location`, `gatewayId` (auto-generado desde name), `cloudStorageEnabled` (checkbox "Habilitar grabación en nube")
- `gatewayId`: auto-fill desde el nombre del cliente → lowercase, espacios → guiones, sin caracteres especiales
- Mostrar preview del gatewayId generado: "ID Gateway: `empresa-ejemplo`"

**Paso 2 — Credenciales de Usuario:**
- Campos: `email`, `password` (con medidor de fortaleza: débil/media/fuerte), `confirmPassword`
- Validación: min 8 chars, confirmación debe coincidir
- `POST /api/auth/signup` (o `POST /api/admin/auth/users` si es el admin quien crea)

**Paso 3 — Cámaras IP:**
- Lista dinámica: agregar/quitar cámaras
- Cada cámara: `name` (id del canal, ej: `cam-entrada`), `ip`, `rtspUser` (default: admin), `rtspPass`, `rtspPath` (default: `/Streaming/Channels/101`)
- Hints para marcas: Hikvision → `/Streaming/Channels/101`, Dahua → `/cam/realmonitor?channel=1&subtype=0`
- Preview URL RTSP generada: `rtsp://{user}:{pass}@{ip}{path}`

**Paso 4 — Archivos de Configuración:**
Generar y descargar 3 archivos (botones de descarga individuales + "Descargar Todo" como ZIP):

**Archivo 1: `.env`**
```
CLIENT_ID={gatewayId}
GATEWAY_NAME={clientName}
LOCATION={location}
MQTT_HOST=177.247.175.4
MQTT_PORT=1885
CENTRAL_RTSP_HOST=177.247.175.4
CENTRAL_RTSP_PORT=8556
MEDIAMTX_PUSH_USER=edge-relay
MEDIAMTX_PUSH_PASS=relay-secret-2026
# Cámaras
CAMERA_{CAM_NAME_UPPER}_IP={ip}
CAMERA_{CAM_NAME_UPPER}_USER={rtspUser}
CAMERA_{CAM_NAME_UPPER}_PASS={rtspPass}
CAMERA_{CAM_NAME_UPPER}_PATH={rtspPath}
```
(repetir bloque CAMERA_ para cada cámara agregada)

**Archivo 2: `mediamtx/mediamtx.yml`** (configuración del edge)
```yaml
logLevel: info
rtmp: {disabled: true}
hls: {disabled: false}
webrtc: {disabled: true}
api: {address: :9997}

authInternalUsers:
  - user: edge-relay
    pass: relay-secret-2026
    permissions: [{action: publish}]

paths:
  {camName}:
    source: rtsp://{rtspUser}:{rtspPass}@{ip}{rtspPath}
    runOnReady: >
      ffmpeg -i rtsp://edge-relay:relay-secret-2026@127.0.0.1:8554/{camName}
      -c copy -f rtsp rtsp://edge-relay:relay-secret-2026@177.247.175.4:8556/{gatewayId}/{camName}
    runOnReadyRestart: yes
  # (repetir para cada cámara)
```

**Archivo 3: `docker-compose.yml`** (para el edge gateway)
```yaml
version: '3.8'
services:
  edge-mediamtx:
    image: bluenviron/mediamtx:latest-ffmpeg
    restart: unless-stopped
    network_mode: host
    volumes:
      - ./mediamtx/mediamtx.yml:/mediamtx.yml
  edge-agent:
    image: ghcr.io/carlosbarajass/motorcontrol-edge-template:latest
    restart: unless-stopped
    env_file: .env
    depends_on: [edge-mediamtx]
```

**Paso 5 — Instrucciones de Despliegue:**
```
1. En la Raspberry Pi (o servidor edge), instala Docker:
   curl -fsSL https://get.docker.com | sh
   sudo usermod -aG docker $USER && newgrp docker

2. Clona el repositorio base:
   git clone https://github.com/CarlosBarajasS/motorcontrol-edge-template.git /opt/edge-gateway
   cd /opt/edge-gateway

3. Copia los archivos descargados:
   - .env → /opt/edge-gateway/.env
   - mediamtx/mediamtx.yml → /opt/edge-gateway/mediamtx/mediamtx.yml
   - docker-compose.yml → /opt/edge-gateway/docker-compose.yml

4. Inicia el gateway:
   docker compose up -d

5. Verifica que las cámaras aparezcan en el dashboard en 1-2 minutos.
   Si no aparecen, revisa los logs:
   docker compose logs -f
```

**API calls del Wizard:**
- Paso 2: `POST /api/admin/auth/users` → crea usuario con role='client'
- Paso 2: `POST /api/admin/clients` → crea cliente en DB (incluye `cloudStorageEnabled`)
- Paso 3: `POST /api/admin/cameras` → por cada cámara agregada
- Los archivos de configuración se generan en el browser (sin API call)

---

### ADMIN-2: Cloud Storage Toggle en ClientDetail

**En `ClientDetailComponent`**, agregar toggle para activar/desactivar grabación en nube:

```html
<div class="panel-card">
  <h3>☁️ Grabación en Nube</h3>
  <div class="toggle-row">
    <div>
      <strong>Almacenamiento cloud activo</strong>
      <p class="help-text">Graba segmentos de 15 min continuamente al servidor NAS</p>
    </div>
    <label class="toggle-switch">
      <input type="checkbox" [checked]="client()?.cloudStorageEnabled"
             (change)="toggleCloudStorage($event)">
      <span class="slider"></span>
    </label>
  </div>
</div>
```

```typescript
toggleCloudStorage(event: Event) {
  const enabled = (event.target as HTMLInputElement).checked;
  this.clientService.updateClient(this.clientId(), { cloudStorageEnabled: enabled })
    .subscribe(() => this.loadClient());
}
```

**API:** `PATCH /api/admin/clients/{id}` — ya debe aceptar `cloudStorageEnabled`

---

### ADMIN-3: Grabaciones Cloud en RecordingsComponent

**Estado actual:** RecordingsComponent muestra lista de grabaciones pero el endpoint cloud no existe aún.

**Cuando BACK-2 esté listo**, conectar:

```typescript
// En recordings.component.ts
loadAvailableDates() {
  this.http.get<any>(`/api/recordings/cloud/${this.cameraId()}/dates`)
    .subscribe(r => this.availableDates.set(r.dates || []));
}

loadCloudRecordings(date: string) {
  this.http.get<any>(`/api/recordings/cloud/${this.cameraId()}?date=${date}`)
    .subscribe(r => this.cloudRecordings.set(r.files || []));
}

playCloudVideo(path: string) {
  // El video se sirve desde /api/recordings/cloud/video?path=...
  this.currentVideoSource.set(`/api/recordings/cloud/video?path=${encodeURIComponent(path)}`);
}
```

**El `<video>` element** necesita el JWT para el endpoint protegido.
Opciones:
1. Generar un "pre-signed URL" con token temporal (más seguro)
2. Usar `fetch()` con Authorization header → `URL.createObjectURL(blob)` para el src del video
3. Hacer el endpoint de video público pero validar firma en query param

**Recomendación:** Opción 2 (fetch → blob URL):
```typescript
async playCloudVideo(path: string) {
  const token = localStorage.getItem('motor_control_token');
  const response = await fetch(`/api/recordings/cloud/video?path=${encodeURIComponent(path)}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  this.currentVideoSource.set(blobUrl);
  // También limpiar el blobUrl anterior con URL.revokeObjectURL() si existía
}
```

---

## 👤 TAREAS ANTIGRAVITY (PORTAL CLIENTE — NUEVO)

> **Contexto:** Los usuarios con `role='client'` necesitan su propio portal donde solo vean SUS cámaras y sus grabaciones. En MotorControlAPI esto era `/login.html` + `/cameras.html`. En Enterprise será un módulo Angular separado con rutas protegidas por rol.

### CLIENT-1: Módulo y rutas del portal cliente

**Crear rutas en `app.routes.ts`:**
```typescript
{
  path: 'client',
  children: [
    { path: 'login', component: ClientLoginComponent },
    {
      path: '',
      component: ClientShellComponent,  // shell con nav mínima
      canActivate: [clientAuthGuard],
      children: [
        { path: 'cameras', component: ClientCamerasComponent },
        { path: 'cameras/:id', component: ClientCameraDetailComponent },
        { path: 'recordings/:id', component: ClientRecordingsComponent },
        { path: '', redirectTo: 'cameras', pathMatch: 'full' }
      ]
    }
  ]
}
```

**Guard `clientAuthGuard`:** verifica que token exista Y que `role === 'client'` (si es admin, redirigir a `/dashboard`).

---

### CLIENT-2: ClientLoginComponent

**Diseño:** Idéntico al admin `LoginComponent` (misma página dark card con IBM Plex Sans).

**Diferencias:**
- Título: "Portal de Monitoreo" (en lugar de "Panel Administrativo")
- Logo: mismo icono de cámara/motor
- Enlace "¿Eres administrador? →" que va a `/login`
- API: `POST /api/auth/login` (sin `/admin/`)
- Guardar token en `localStorage['motor_control_token']`
- Al login exitoso → navegar a `/client/cameras`

**Verificar sesión activa al cargar:** `GET /api/auth/verify` → si válido y `role=client` → redirigir a `/client/cameras`.

---

### CLIENT-3: ClientCamerasComponent

**Diseño:** Panel NVR oscuro similar al admin `CamerasComponent` pero sin tabla de administración.

**Funcionalidades:**
- Cargar solo las cámaras del usuario: `GET /api/cameras` (ya filtra por userId del token)
- Grid de celdas de video 2×2 por defecto
- Toggle layout: 1×1 / 2×2 / 3×3
- Cada celda: HLS player con xhrSetup + JWT (igual que admin)
- Click en cámara → navega a `/client/cameras/:id`
- Indicador online/offline por cámara

**HTML sugerido:**
```html
<div class="client-shell">
  <header class="client-topbar">
    <div class="brand">
      <svg><!-- icono --></svg>
      <span>{{ clientName }}</span>
    </div>
    <div class="topbar-actions">
      <span class="badge">{{ onlineCameras }}/{{ totalCameras }} cámaras online</span>
      <button (click)="logout()" class="btn-ghost">Salir</button>
    </div>
  </header>

  <main class="nvr-panel">
    <div class="layout-controls">
      <button [class.active]="layout===1" (click)="setLayout(1)">1×1</button>
      <button [class.active]="layout===2" (click)="setLayout(2)">2×2</button>
      <button [class.active]="layout===3" (click)="setLayout(3)">3×3</button>
    </div>
    <div class="nvr-grid" [class]="'layout-' + layout">
      <div class="cam-cell" *ngFor="let cam of cameras()">
        <video #videoEl></video>
        <div class="cell-overlay">
          <span class="cam-name">{{ cam.name }}</span>
          <span class="cam-status" [class.online]="cam.isOnline">●</span>
        </div>
        <div class="cell-actions">
          <a [routerLink]="['/client/cameras', cam.id]" class="btn-cell">⛶ Expandir</a>
          <a [routerLink]="['/client/recordings', cam.id]" class="btn-cell">🎞 Grabaciones</a>
        </div>
      </div>
    </div>
  </main>
</div>
```

---

### CLIENT-4: ClientCameraDetailComponent

**Diseño:** Similar al admin `CameraDetailComponent`.

**Funcionalidades:**
- Video full-size HLS con xhrSetup + JWT
- PTZ panel (si la cámara tiene `ptz: true`) → mismos botones 8 direcciones + zoom
- Info panel: nombre, ubicación, estado
- Botón "Ver Grabaciones" → `/client/recordings/:id`
- Botón "← Volver" → `/client/cameras`

**API:** `GET /api/cameras/:id` — ya requiere auth solo, no admin.

---

### CLIENT-5: ClientRecordingsComponent

**Diseño:** Idéntico al admin `RecordingsComponent`.

**Funcionalidades:**
- Selector de fecha
- Lista grabaciones cloud (API BACK-2 requerido)
- Lista grabaciones SD Card (API ya existe)
- Video player con blob URL (ver ADMIN-3)

---

### CLIENT-6: ClientShellComponent (Layout mínimo)

**Sin sidebar de admin.** Layout simple:
```
[ Logo + Nombre cliente ] ──── [ Badge cámaras ] [ Btn Salir ]
─────────────────────────────────────────────────────────────
[ router-outlet ]
```

**CSS:** Fondo `var(--bg)` claro, topbar oscuro estilo NVR (`#0a0e1a`).

---

### CLIENT-7: Redirección inteligente en login

**En el login admin** (y en el guard de admin), si el token tiene `role='client'`, redirigir a `/client/cameras` en lugar de mostrar error.

**En `app.routes.ts`**, la ruta raíz `/` puede chequear el rol y redirigir:
```typescript
{ path: '', canActivate: [rootRedirectGuard], component: EmptyComponent }
// rootRedirectGuard: si token admin → /dashboard, si token client → /client/cameras, si no → /login
```

---

## 🏗️ ORDEN DE IMPLEMENTACIÓN SUGERIDO

```
Semana 1:
  1. BACK-6: Agregar CloudStorageEnabled al modelo Client + migración
  2. BACK-1: AuthController (login/signup/verify para clientes)
  3. CLIENT-1/2: Rutas + ClientLoginComponent

Semana 2:
  4. BACK-2: RecordingsController (listar fechas, listar archivos, stream video)
  5. ADMIN-3: Conectar RecordingsComponent al nuevo API
  6. CLIENT-3/4/5/6: Portal cliente completo

Semana 3:
  7. BACK-3: StreamRecorderService (BackgroundService)
  8. BACK-4: StorageCleanerService
  9. BACK-5: PostgresBackupService
  10. BACK-7: docker-compose.yml con NAS volumes
  11. ADMIN-1: Wizard 5 pasos completo
  12. ADMIN-2: Cloud Storage toggle en ClientDetail

QA Final:
  - Verificar flujo completo: Wizard → edge deploy → stream activo → grabaciones → portal cliente
```

---

## 📝 NOTAS TÉCNICAS PARA ANTIGRAVITY

### Token key para portal cliente
El token del portal cliente debe guardarse en la **misma clave** que el admin: `localStorage['motor_control_token']`. El `AuthService` ya lo maneja — simplemente se llama `POST /api/auth/login` (sin `/admin/`).

### Guard de rol
```typescript
// client-auth.guard.ts
export const clientAuthGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const user = auth.currentUser();
  if (!user) return router.createUrlTree(['/client/login']);
  if (user.role === 'admin') return router.createUrlTree(['/dashboard']);
  return true;
};
```

### xhrSetup — mismo patrón que ya existe
```typescript
new Hls({
  xhrSetup: (xhr) => {
    const token = localStorage.getItem('motor_control_token');
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
  }
});
```

### Blob URL para reproducción de video protegido
```typescript
async loadVideo(path: string) {
  const token = localStorage.getItem('motor_control_token');
  const res = await fetch(`/api/recordings/cloud/video?path=${encodeURIComponent(path)}`,
    { headers: { Authorization: `Bearer ${token}` } });
  if (this.blobUrl) URL.revokeObjectURL(this.blobUrl);
  this.blobUrl = URL.createObjectURL(await res.blob());
  this.videoEl.nativeElement.src = this.blobUrl;
  this.videoEl.nativeElement.play();
}
```

---
