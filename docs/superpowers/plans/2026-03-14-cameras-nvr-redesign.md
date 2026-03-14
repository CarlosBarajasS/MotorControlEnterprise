# Cameras NVR Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat camera card grid at `/cameras` with a two-level navigation — a client-cards grid (Level 1) and a full-screen NVR professional grid per client (Level 2).

**Architecture:** Level 1 (`/cameras`) shows one card per client with online/offline counts computed from `clientCards` signal. Level 2 (`/cameras/client/:clientId`) is a new standalone `ClientNvrComponent` that fetches cameras, auto-selects a CSS grid layout by count, and renders each stream via the existing `CameraViewerComponent` with a new `hideOverlay` input suppressing its internal LIVE badge so the NVR can provide its own overlays.

**Tech Stack:** Angular 17 standalone components, signals/computed, SCSS with CSS variables, `CameraViewerComponent` (HLS.js), existing endpoints `GET /api/cameras` + `GET /api/clients`.

---

## File Map

| File | Status | Responsibility |
|------|--------|---------------|
| `frontend/src/app/components/camera-viewer/camera-viewer.component.ts` | Modify | Add `@Input() hideOverlay = false` |
| `frontend/src/app/components/camera-viewer/camera-viewer.component.html` | Modify | Gate `.overlay-controls` on `!hideOverlay` |
| `frontend/src/app/components/cameras/cameras.component.ts` | Rewrite | Client-cards state: `clientCards` computed, modal retained, old filters removed |
| `frontend/src/app/components/cameras/cameras.component.html` | Rewrite | Client cards grid with loading/empty/error/search states |
| `frontend/src/app/components/cameras/cameras.component.scss` | Rewrite | Client card styles, skeleton, search box, error banner |
| `frontend/src/app/components/cameras/client-nvr.component.ts` | Create | Load cameras by clientId, grid cols computed, fullscreen, isOnline |
| `frontend/src/app/components/cameras/client-nvr.component.html` | Create | NVR topbar + camera grid cells + overlays |
| `frontend/src/app/components/cameras/client-nvr.component.scss` | Create | nvr-cell layout, overlay positioning, badge styles |
| `frontend/src/app/app.routes.ts` | Modify | Add `cameras/client/:clientId` route before `cameras/:id` |

---

## Chunk 1: CameraViewer patch + CamerasComponent (Level 1)

### Task 1: Patch `CameraViewerComponent` — add `hideOverlay` input

**Files:**
- Modify: `frontend/src/app/components/camera-viewer/camera-viewer.component.ts`
- Modify: `frontend/src/app/components/camera-viewer/camera-viewer.component.html`

- [ ] **Step 1.1: Add `@Input() hideOverlay` to the component class**

  In `camera-viewer.component.ts`, add `Input` to the Angular core imports and add the property:

  Change line 1 from:
  ```typescript
  import { Component, Input, OnDestroy, AfterViewInit, ElementRef, ViewChild } from '@angular/core';
  ```
  (It already imports `Input` — no change needed to imports.)

  After `@Input() streamUrl!: string;` (line 13), add:
  ```typescript
  @Input() hideOverlay = false;
  ```

- [ ] **Step 1.2: Gate the overlay div on `!hideOverlay`**

  In `camera-viewer.component.html`, change line 19 from:
  ```html
  <div class="overlay-controls" *ngIf="!isLoading && !hasError">
  ```
  to:
  ```html
  <div class="overlay-controls" *ngIf="!isLoading && !hasError && !hideOverlay">
  ```

- [ ] **Step 1.3: Verify no build errors**

  Run from `frontend/`:
  ```bash
  npx ng build --configuration=production 2>&1 | tail -20
  ```
  Expected: build succeeds (or only pre-existing warnings).

- [ ] **Step 1.4: Commit**

  ```bash
  git add frontend/src/app/components/camera-viewer/camera-viewer.component.ts \
          frontend/src/app/components/camera-viewer/camera-viewer.component.html
  git commit -m "feat(camera): add hideOverlay input to CameraViewerComponent"
  ```

---

### Task 2: Rewrite `cameras.component.ts` — Level 1 client-cards state

**Files:**
- Modify: `frontend/src/app/components/cameras/cameras.component.ts`

The existing file has `filterStatus`, `filterGateway`, `gridCols`, `filtered`, `camerasOnline`, `getGatewayName`, `viewStream` — all unused after the rewrite. The modal methods (`openCreate`, `openEdit`, `saveCamera`, `deleteCamera`) and `loadData`/`ngOnInit` are **kept**.

- [ ] **Step 2.1: Replace the full TypeScript file**

  Write `frontend/src/app/components/cameras/cameras.component.ts` with:

  ```typescript
  import { Component, OnInit, signal, inject, computed } from '@angular/core';
  import { CommonModule } from '@angular/common';
  import { HttpClient } from '@angular/common/http';
  import { FormsModule } from '@angular/forms';
  import { Router, RouterModule } from '@angular/router';

  const API_URL = '/api';

  @Component({
      selector: 'app-cameras',
      standalone: true,
      imports: [CommonModule, FormsModule, RouterModule],
      templateUrl: './cameras.component.html',
      styleUrls: ['./cameras.component.scss']
  })
  export class CamerasComponent implements OnInit {
      http = inject(HttpClient);
      router = inject(Router);

      cameras = signal<any[]>([]);
      clients = signal<any[]>([]);
      searchTerm = signal('');
      loading = signal(true);
      loadError = signal(false);

      clientCards = computed(() => {
          const q = this.searchTerm().toLowerCase();
          return this.clients()
              .map(client => {
                  const cams = this.cameras().filter(c => c.clientId === client.id);
                  const online = cams.filter(c => this.isOnline(c)).length;
                  return { id: client.id, name: client.name, total: cams.length, online, offline: cams.length - online };
              })
              .filter(c => !q || c.name.toLowerCase().includes(q));
      });

      // ── Modal (unchanged) ────────────────────────────────────────────────────
      showModal = signal(false);
      modalMode = signal<'create' | 'edit'>('create');
      currentCamera = signal<any>({});

      ngOnInit() {
          this.loadData();
      }

      loadData() {
          this.loading.set(true);
          this.loadError.set(false);
          this.http.get<any[]>(`${API_URL}/cameras`).subscribe({
              next: (res) => {
                  this.cameras.set(res || []);
                  this.loading.set(false);
              },
              error: () => {
                  this.loadError.set(true);
                  this.loading.set(false);
              }
          });
          this.http.get<any[]>(`${API_URL}/clients`).subscribe({
              next: (res) => this.clients.set(res || []),
              error: () => { this.loadError.set(true); this.loading.set(false); }
          });
      }

      openCreate() {
          this.currentCamera.set({ name: '', location: '', rtspUrl: '', clientId: '', streamType: 'nvr' });
          this.modalMode.set('create');
          this.showModal.set(true);
      }

      openEdit(cam: any) {
          this.currentCamera.set({ ...cam });
          this.modalMode.set('edit');
          this.showModal.set(true);
      }

      saveCamera() {
          const data = this.currentCamera();
          const req = this.modalMode() === 'create'
              ? this.http.post(`${API_URL}/cameras`, data)
              : this.http.put(`${API_URL}/cameras/${data.id}`, data);
          req.subscribe({
              next: () => { this.showModal.set(false); this.loadData(); },
              error: (err) => alert('Error al guardar la cámara: ' + (err.error?.message || err.message))
          });
      }

      deleteCamera(id: string) {
          if (confirm('¿Estás seguro de inhabilitar/eliminar esta cámara?')) {
              this.http.delete(`${API_URL}/cameras/${id}`).subscribe({
                  next: () => this.loadData(),
                  error: () => alert('Error al eliminar')
              });
          }
      }

      isOnline(cam: any): boolean {
          return !!cam.lastSeen && (Date.now() - new Date(cam.lastSeen).getTime()) < 90_000;
      }
  }
  ```

- [ ] **Step 2.2: Verify build**

  ```bash
  cd frontend && npx ng build --configuration=production 2>&1 | tail -20
  ```
  Expected: no new errors (the old template references `filtered()` etc. so it may error — that's fine, the template rewrite is next).

---

### Task 3: Rewrite `cameras.component.html` — Level 1 client-cards grid

**Files:**
- Modify: `frontend/src/app/components/cameras/cameras.component.html`

- [ ] **Step 3.1: Replace the full HTML template**

  Write `frontend/src/app/components/cameras/cameras.component.html` with:

  ```html
  <div class="cameras-layout">

    <!-- TOPBAR -->
    <div class="topbar">
      <div>
        <h1>Cámaras IP</h1>
        <p class="subtitle">Selecciona un cliente para ver su vista NVR</p>
      </div>
      <div class="topbar-actions">
        <div class="search-box">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input class="search-input" type="text" placeholder="Buscar cliente..." [ngModel]="searchTerm()" (ngModelChange)="searchTerm.set($event)">
        </div>
        <button class="btn-primary" (click)="openCreate()">+ Añadir Cámara</button>
      </div>
    </div>

    <!-- LOADING: 3 skeleton cards -->
    <div class="client-grid" *ngIf="loading()">
      <div class="skeleton-card" *ngFor="let i of [0,1,2]"></div>
    </div>

    <!-- ERROR -->
    <div class="error-banner" *ngIf="!loading() && loadError()">
      <span>⚠️ Error al cargar los datos.</span>
      <button class="btn-retry" (click)="loadData()">Reintentar</button>
    </div>

    <!-- EMPTY: no clients at all -->
    <div class="empty-state" *ngIf="!loading() && !loadError() && clients().length === 0">
      <span class="empty-icon">🏢</span>
      <p>No hay clientes registrados</p>
    </div>

    <!-- EMPTY: search yielded no results -->
    <div class="empty-state" *ngIf="!loading() && !loadError() && clients().length > 0 && clientCards().length === 0">
      <span class="empty-icon">🔍</span>
      <p>No hay clientes que coincidan con la búsqueda</p>
    </div>

    <!-- CLIENT GRID -->
    <div class="client-grid" *ngIf="!loading() && !loadError() && clientCards().length > 0">
      <div class="client-card"
           *ngFor="let card of clientCards()"
           [class.all-online]="card.total > 0 && card.offline === 0"
           [class.some-offline]="card.offline > 0"
           [class.no-cameras]="card.total === 0">

        <div class="card-header">
          <span class="client-icon">🏢</span>
          <span class="client-name">{{ card.name }}</span>
        </div>

        <div class="card-stats">
          <span class="stat online" *ngIf="card.total > 0">
            <span class="dot dot-green"></span>{{ card.online }} en vivo
          </span>
          <span class="stat offline" *ngIf="card.total > 0">
            <span class="dot dot-red"></span>{{ card.offline }} offline
          </span>
          <span class="stat total">
            📹 {{ card.total }} cámara{{ card.total !== 1 ? 's' : '' }}
          </span>
        </div>

        <div class="card-footer">
          <button class="btn-nvr"
                  [disabled]="card.total === 0"
                  (click)="router.navigate(['/cameras/client', card.id])">
            Ver NVR →
          </button>
        </div>
      </div>
    </div>

    <!-- MODAL (unchanged logic) -->
    <div class="modal-overlay" *ngIf="showModal()" (click)="showModal.set(false)">
      <div class="modal" (click)="$event.stopPropagation()">
        <h2>{{ modalMode() === 'create' ? 'Añadir Cámara' : 'Editar Cámara' }}</h2>
        <label>Nombre
          <input type="text"
            [ngModel]="currentCamera().name"
            (ngModelChange)="currentCamera.update(c => ({...c, name: $event}))">
        </label>
        <label>Ubicación
          <input type="text"
            [ngModel]="currentCamera().location"
            (ngModelChange)="currentCamera.update(c => ({...c, location: $event}))">
        </label>
        <label>RTSP URL
          <input type="text"
            [ngModel]="currentCamera().rtspUrl"
            (ngModelChange)="currentCamera.update(c => ({...c, rtspUrl: $event}))">
        </label>
        <label>Cliente
          <select
            [ngModel]="currentCamera().clientId"
            (ngModelChange)="currentCamera.update(c => ({...c, clientId: $event}))">
            <option value="">-- Seleccionar --</option>
            <option *ngFor="let cl of clients()" [value]="cl.id">{{ cl.name }}</option>
          </select>
        </label>
        <div class="modal-actions">
          <button class="btn-danger" *ngIf="modalMode() === 'edit'"
                  (click)="deleteCamera(currentCamera().id); showModal.set(false)">
            Eliminar
          </button>
          <div style="flex:1"></div>
          <button class="btn-secondary" (click)="showModal.set(false)">Cancelar</button>
          <button class="btn-primary" (click)="saveCamera()">Guardar</button>
        </div>
      </div>
    </div>

  </div>
  ```

- [ ] **Step 3.2: Verify build**

  ```bash
  cd frontend && npx ng build --configuration=production 2>&1 | tail -20
  ```
  Expected: build succeeds.

---

### Task 4: Rewrite `cameras.component.scss` — Level 1 styles

**Files:**
- Modify: `frontend/src/app/components/cameras/cameras.component.scss`

- [ ] **Step 4.1: Replace the full SCSS file**

  Write `frontend/src/app/components/cameras/cameras.component.scss` with:

  ```scss
  .cameras-layout {
    padding: 24px 28px;
    max-width: 1400px;
    margin: 0 auto;
  }

  // ── Topbar ────────────────────────────────────────────────────────────────
  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 28px;
    gap: 16px;
    flex-wrap: wrap;

    h1 {
      font-size: 22px;
      font-weight: 700;
      color: var(--ink);
      margin: 0 0 2px;
    }

    .subtitle {
      font-size: 13px;
      color: var(--muted);
      margin: 0;
    }
  }

  .topbar-actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  // ── Search ────────────────────────────────────────────────────────────────
  .search-box {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--surface);
    border: 1px solid var(--outline);
    border-radius: 10px;
    padding: 8px 14px;
    min-width: 200px;

    svg { color: var(--muted); flex-shrink: 0; }

    .search-input {
      background: transparent;
      border: none;
      color: var(--ink);
      font-size: 13px;
      width: 100%;
      outline: none;

      &::placeholder { color: var(--muted); }
    }
  }

  // ── Client grid ───────────────────────────────────────────────────────────
  .client-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 16px;
  }

  // ── Client card ───────────────────────────────────────────────────────────
  .client-card {
    background: var(--surface);
    border: 1px solid var(--outline);
    border-left: 4px solid var(--outline);
    border-radius: 12px;
    padding: 18px 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    cursor: pointer;
    transition: background 0.15s;

    &:hover { background: rgba(var(--ink-rgb), 0.03); }

    &.all-online  { border-left-color: var(--green); }
    &.some-offline { border-left-color: var(--red); }
    &.no-cameras  { border-left-color: var(--outline); }
  }

  .card-header {
    display: flex;
    align-items: center;
    gap: 10px;

    .client-icon { font-size: 20px; }

    .client-name {
      font-size: 15px;
      font-weight: 600;
      color: var(--ink);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .card-stats {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;

    .stat {
      font-size: 12px;
      color: var(--muted);
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .stat.online { color: var(--green); }
    .stat.offline { color: var(--red); }
  }

  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    display: inline-block;

    &.dot-green { background: var(--green); }
    &.dot-red   { background: var(--red); }
  }

  .card-footer {
    margin-top: auto;
  }

  .btn-nvr {
    background: var(--accent);
    color: #fff;
    border: none;
    border-radius: 8px;
    padding: 7px 16px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s;

    &:hover:not(:disabled) { opacity: 0.85; }
    &:disabled { opacity: 0.4; cursor: not-allowed; }
  }

  // ── Skeleton ──────────────────────────────────────────────────────────────
  .skeleton-card {
    background: rgba(var(--ink-rgb), 0.06);
    border-radius: 12px;
    height: 140px;
    animation: pulse 1.4s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.45; }
  }

  // ── Error banner ──────────────────────────────────────────────────────────
  .error-banner {
    display: flex;
    align-items: center;
    gap: 12px;
    background: rgba(var(--red-rgb), 0.1);
    border: 1px solid var(--red);
    border-radius: 10px;
    padding: 14px 20px;
    color: var(--ink);
    font-size: 14px;
    margin-bottom: 20px;
  }

  .btn-retry {
    background: var(--red);
    color: #fff;
    border: none;
    border-radius: 7px;
    padding: 6px 14px;
    font-size: 12px;
    cursor: pointer;
    margin-left: auto;
  }

  // ── Empty state ───────────────────────────────────────────────────────────
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 20px;
    color: var(--muted);

    .empty-icon { font-size: 48px; margin-bottom: 16px; }
    p { font-size: 15px; margin: 0; }
  }

  // ── Primary button ────────────────────────────────────────────────────────
  .btn-primary {
    background: var(--accent);
    color: #fff;
    border: none;
    border-radius: 8px;
    padding: 9px 18px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    transition: opacity 0.15s;
    &:hover { opacity: 0.85; }
  }

  .btn-secondary {
    background: transparent;
    color: var(--ink);
    border: 1px solid var(--outline);
    border-radius: 8px;
    padding: 9px 18px;
    font-size: 13px;
    cursor: pointer;
    &:hover { background: rgba(var(--ink-rgb), 0.04); }
  }

  // ── Modal ─────────────────────────────────────────────────────────────────
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal {
    background: var(--surface);
    border: 1px solid var(--outline);
    border-radius: 14px;
    padding: 28px;
    width: 420px;
    max-width: 95vw;
    display: flex;
    flex-direction: column;
    gap: 14px;

    h2 {
      font-size: 18px;
      font-weight: 700;
      color: var(--ink);
      margin: 0 0 4px;
    }

    label {
      display: flex;
      flex-direction: column;
      gap: 5px;
      font-size: 13px;
      color: var(--muted);

      input, select {
        background: rgba(var(--ink-rgb), 0.04);
        border: 1px solid var(--outline);
        border-radius: 8px;
        padding: 8px 12px;
        color: var(--ink);
        font-size: 14px;
        outline: none;

        &:focus { border-color: var(--accent); }
      }
    }
  }

  .modal-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 6px;
  }

  .btn-danger {
    background: rgba(var(--red-rgb), 0.12);
    color: var(--red);
    border: 1px solid var(--red);
    border-radius: 8px;
    padding: 9px 18px;
    font-size: 13px;
    cursor: pointer;
    &:hover { background: rgba(var(--red-rgb), 0.22); }
  }
  ```

- [ ] **Step 4.2: Build and verify**

  ```bash
  cd frontend && npx ng build --configuration=production 2>&1 | tail -20
  ```
  Expected: build succeeds with no errors.

- [ ] **Step 4.3: Commit Level 1 changes**

  ```bash
  git add frontend/src/app/components/cameras/cameras.component.ts \
          frontend/src/app/components/cameras/cameras.component.html \
          frontend/src/app/components/cameras/cameras.component.scss
  git commit -m "feat(camera): rewrite cameras view as Level 1 client-cards grid"
  ```

---

## Chunk 2: ClientNvrComponent (Level 2) + Route registration

### Task 5: Create `client-nvr.component.ts`

**Files:**
- Create: `frontend/src/app/components/cameras/client-nvr.component.ts`

- [ ] **Step 5.1: Create the TypeScript class**

  Write `frontend/src/app/components/cameras/client-nvr.component.ts`:

  ```typescript
  import { Component, OnInit, signal, inject, computed } from '@angular/core';
  import { CommonModule } from '@angular/common';
  import { ActivatedRoute, Router, RouterModule } from '@angular/router';
  import { HttpClient } from '@angular/common/http';
  import { CameraViewerComponent } from '../camera-viewer/camera-viewer.component';

  const API_URL = '/api';

  @Component({
      selector: 'app-client-nvr',
      standalone: true,
      imports: [CommonModule, RouterModule, CameraViewerComponent],
      templateUrl: './client-nvr.component.html',
      styleUrls: ['./client-nvr.component.scss']
  })
  export class ClientNvrComponent implements OnInit {
      route  = inject(ActivatedRoute);
      http   = inject(HttpClient);
      router = inject(Router);

      clientId = 0;
      clientName = signal('');
      cameras = signal<any[]>([]);
      loading = signal(true);
      loadError = signal(false);

      onlineCount = computed(() => this.cameras().filter(c => this.isOnline(c)).length);
      offlineCount = computed(() => this.cameras().length - this.onlineCount());

      gridCols = computed(() => {
          const n = this.cameras().length;
          if (n <= 1) return 1;
          if (n <= 4) return 2;
          if (n <= 9) return 3;
          return 4;
      });

      skeletonCells = [0, 1, 2, 3]; // 4 cells for loading state

      ngOnInit() {
          this.clientId = +this.route.snapshot.paramMap.get('clientId')!;
          this.loadData();
      }

      loadData() {
          this.loading.set(true);
          this.loadError.set(false);

          this.http.get<any[]>(`${API_URL}/cameras`).subscribe({
              next: (allCams) => {
                  const filtered = (allCams || []).filter(c => c.clientId === this.clientId);
                  this.cameras.set(filtered);
                  this.loading.set(false);
              },
              error: () => {
                  this.loadError.set(true);
                  this.loading.set(false);
              }
          });

          this.http.get<any[]>(`${API_URL}/clients`).subscribe({
              next: (clients) => {
                  const client = (clients || []).find(c => c.id === this.clientId);
                  this.clientName.set(client?.name ?? `Cliente #${this.clientId}`);
              },
              error: () => {}
          });
      }

      isOnline(cam: any): boolean {
          return !!cam.lastSeen && (Date.now() - new Date(cam.lastSeen).getTime()) < 90_000;
      }

      getHlsUrl(cam: any): string {
          try {
              const s = JSON.parse(cam.streams ?? '{}');
              return s.centralHls ?? s.hls ?? '';
          } catch {
              return '';
          }
      }

      goToDetail(id: number) {
          this.router.navigate(['/cameras', id]);
      }

      toggleFullscreen(event: MouseEvent, cell: HTMLDivElement) {
          event.stopPropagation();
          cell.requestFullscreen().catch(() => {});
      }
  }
  ```

---

### Task 6: Create `client-nvr.component.html`

**Files:**
- Create: `frontend/src/app/components/cameras/client-nvr.component.html`

- [ ] **Step 6.1: Create the NVR template**

  Write `frontend/src/app/components/cameras/client-nvr.component.html`:

  ```html
  <div class="nvr-layout">

    <!-- NVR TOPBAR -->
    <div class="nvr-topbar">
      <button class="btn-back" (click)="router.navigate(['/cameras'])">← Clientes</button>
      <span class="nvr-client-name">{{ clientName() }}</span>
      <div class="nvr-status-badges" *ngIf="!loading() && !loadError()">
        <span class="status-badge online" *ngIf="onlineCount() > 0">
          ● {{ onlineCount() }} EN VIVO
        </span>
        <span class="status-badge offline" *ngIf="offlineCount() > 0">
          ○ {{ offlineCount() }} Offline
        </span>
        <span class="status-badge muted" *ngIf="cameras().length === 0">
          Sin cámaras
        </span>
      </div>
      <div class="nvr-topbar-spacer"></div>
      <button class="btn-add" (click)="router.navigate(['/cameras'])">+ Añadir Cámara</button>
    </div>

    <!-- LOADING: 4 skeleton cells in 2×2 grid -->
    <div class="nvr-grid nvr-grid-2" *ngIf="loading()">
      <div class="nvr-skeleton" *ngFor="let i of skeletonCells"></div>
    </div>

    <!-- ERROR -->
    <div class="nvr-center-msg" *ngIf="!loading() && loadError()">
      <p class="msg-text">Error al cargar cámaras.</p>
      <button class="btn-retry" (click)="loadData()">Reintentar</button>
    </div>

    <!-- EMPTY: no cameras for this client -->
    <div class="nvr-center-msg" *ngIf="!loading() && !loadError() && cameras().length === 0">
      <p class="msg-text">Este cliente no tiene cámaras configuradas.</p>
      <button class="btn-add-cam" (click)="router.navigate(['/cameras'])">Añadir Cámara</button>
    </div>

    <!-- NVR GRID -->
    <div class="nvr-grid"
         *ngIf="!loading() && !loadError() && cameras().length > 0"
         [class.nvr-grid-1]="gridCols() === 1"
         [class.nvr-grid-2]="gridCols() === 2"
         [class.nvr-grid-3]="gridCols() === 3"
         [class.nvr-grid-4]="gridCols() === 4">

      <div class="nvr-cell" #cell
           *ngFor="let cam of cameras()"
           (click)="goToDetail(cam.id)">

        <app-camera-viewer
          [streamUrl]="getHlsUrl(cam)"
          [hideOverlay]="true">
        </app-camera-viewer>

        <!-- NVR overlays — siblings of viewer, always dark regardless of theme -->
        <div class="nvr-overlay">
          <div class="nvr-badge-top">
            <span class="live-dot" [class.online]="isOnline(cam)"></span>
            {{ isOnline(cam) ? 'EN VIVO' : 'OFFLINE' }}
          </div>
          <div class="nvr-cam-name">{{ cam.name }}</div>
          <button class="nvr-fullscreen-btn"
                  (click)="toggleFullscreen($event, cell)"
                  title="Pantalla completa">⛶</button>
        </div>

      </div>
    </div>

  </div>
  ```

---

### Task 7: Create `client-nvr.component.scss`

**Files:**
- Create: `frontend/src/app/components/cameras/client-nvr.component.scss`

- [ ] **Step 7.1: Create the NVR styles**

  Write `frontend/src/app/components/cameras/client-nvr.component.scss`:

  ```scss
  // ── Layout ────────────────────────────────────────────────────────────────
  .nvr-layout {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
    background: #000;
  }

  // ── Topbar ────────────────────────────────────────────────────────────────
  .nvr-topbar {
    display: flex;
    align-items: center;
    gap: 14px;
    height: 56px;
    padding: 0 20px;
    background: var(--surface);
    border-bottom: 1px solid var(--outline);
    flex-shrink: 0;
    z-index: 10;
  }

  .btn-back {
    background: transparent;
    border: 1px solid var(--outline);
    border-radius: 7px;
    padding: 6px 12px;
    font-size: 13px;
    color: var(--ink);
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.15s;
    &:hover { background: rgba(var(--ink-rgb), 0.06); }
  }

  .nvr-client-name {
    font-size: 15px;
    font-weight: 600;
    color: var(--ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 200px;
  }

  .nvr-status-badges {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .status-badge {
    font-size: 12px;
    font-weight: 600;
    padding: 3px 10px;
    border-radius: 20px;
    white-space: nowrap;

    &.online  { color: var(--green); background: rgba(var(--green-rgb), 0.12); }
    &.offline { color: var(--red);   background: rgba(var(--red-rgb), 0.12); }
    &.muted   { color: var(--muted); }
  }

  .nvr-topbar-spacer { flex: 1; }

  .btn-add {
    background: var(--accent);
    color: #fff;
    border: none;
    border-radius: 8px;
    padding: 7px 16px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    transition: opacity 0.15s;
    &:hover { opacity: 0.85; }
  }

  // ── NVR Grid ──────────────────────────────────────────────────────────────
  .nvr-grid {
    flex: 1;
    display: grid;
    overflow: hidden;
    gap: 2px;
    background: #111;

    &.nvr-grid-1 {
      grid-template-columns: 1fr;
      max-width: 900px;
      margin: 0 auto;
      width: 100%;
    }
    &.nvr-grid-2 { grid-template-columns: repeat(2, 1fr); }
    &.nvr-grid-3 { grid-template-columns: repeat(3, 1fr); }
    &.nvr-grid-4 { grid-template-columns: repeat(4, 1fr); }
  }

  // ── NVR Cell ──────────────────────────────────────────────────────────────
  .nvr-cell {
    position: relative;
    aspect-ratio: 16 / 9;
    overflow: hidden;
    cursor: pointer;
    background: #000;

    app-camera-viewer {
      display: block;
      width: 100%;
      height: 100%;
    }

    &:hover .nvr-overlay { opacity: 1; }
  }

  // ── Overlays — ALWAYS dark, never CSS theme variables ─────────────────────
  .nvr-overlay {
    position: absolute;
    inset: 0;
    opacity: 0;
    transition: opacity 0.2s;
    pointer-events: none;

    // Pointer events only on interactive children
    .nvr-fullscreen-btn { pointer-events: auto; }
  }

  .nvr-badge-top {
    position: absolute;
    top: 8px;
    left: 8px;
    display: flex;
    align-items: center;
    gap: 5px;
    background: rgba(0, 0, 0, 0.55);
    color: #fff;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
    padding: 3px 8px;
    border-radius: 5px;
    opacity: 1; // always visible (not gated by hover)
    pointer-events: none;
  }

  .live-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #666;
    display: inline-block;
    flex-shrink: 0;

    &.online {
      background: #22c55e;
      box-shadow: 0 0 5px #22c55e88;
    }
  }

  .nvr-cam-name {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    background: rgba(0, 0, 0, 0.45);
    color: #fff;
    font-size: 12px;
    font-weight: 500;
    padding: 6px 10px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    opacity: 1; // always visible
    pointer-events: none;
  }

  .nvr-fullscreen-btn {
    position: absolute;
    top: 8px;
    right: 8px;
    background: rgba(0, 0, 0, 0.55);
    color: #fff;
    border: none;
    border-radius: 5px;
    padding: 4px 8px;
    font-size: 14px;
    cursor: pointer;
    opacity: 0; // only visible on hover (parent governs)
    transition: opacity 0.2s, background 0.15s;

    &:hover { background: rgba(0, 0, 0, 0.8); }
  }

  .nvr-cell:hover .nvr-fullscreen-btn { opacity: 1; }

  // ── Skeleton ──────────────────────────────────────────────────────────────
  .nvr-skeleton {
    aspect-ratio: 16 / 9;
    background: rgba(var(--ink-rgb), 0.06);
    animation: pulse 1.4s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.4; }
  }

  // ── Center messages (empty / error) ───────────────────────────────────────
  .nvr-center-msg {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 40px;

    .msg-text {
      font-size: 16px;
      color: var(--muted);
      margin: 0;
    }
  }

  .btn-retry, .btn-add-cam {
    background: var(--accent);
    color: #fff;
    border: none;
    border-radius: 8px;
    padding: 8px 20px;
    font-size: 14px;
    cursor: pointer;
    &:hover { opacity: 0.85; }
  }
  ```

- [ ] **Step 7.2: Build and verify**

  ```bash
  cd frontend && npx ng build --configuration=production 2>&1 | tail -20
  ```
  Expected: build succeeds (the component exists but isn't routed yet — no errors expected).

- [ ] **Step 7.3: Commit NVR component files**

  ```bash
  git add frontend/src/app/components/cameras/client-nvr.component.ts \
          frontend/src/app/components/cameras/client-nvr.component.html \
          frontend/src/app/components/cameras/client-nvr.component.scss
  git commit -m "feat(camera): add ClientNvrComponent with auto-grid and overlays"
  ```

---

### Task 8: Register route in `app.routes.ts`

**Files:**
- Modify: `frontend/src/app/app.routes.ts`

**Critical:** `cameras/client/:clientId` must be declared **before** `cameras/:id` — both are 2-segment paths, Angular matches first-declared wins. `adminAuthGuard` is a `const` defined inline in this file and cannot be imported.

- [ ] **Step 8.1: Add import for `ClientNvrComponent`**

  In `app.routes.ts`, after line 12 (`import { CameraDetailComponent }...`), add:
  ```typescript
  import { ClientNvrComponent } from './components/cameras/client-nvr.component';
  ```

- [ ] **Step 8.2: Insert the new route before `cameras/:id`**

  In `app.routes.ts`, find the existing route block:
  ```typescript
  { path: 'cameras', component: CamerasComponent, canActivate: [adminAuthGuard] },
  { path: 'cameras/:id', component: CameraDetailComponent, canActivate: [adminAuthGuard] },
  ```

  Replace with:
  ```typescript
  { path: 'cameras', component: CamerasComponent, canActivate: [adminAuthGuard] },
  { path: 'cameras/client/:clientId', component: ClientNvrComponent, canActivate: [adminAuthGuard] },
  { path: 'cameras/:id', component: CameraDetailComponent, canActivate: [adminAuthGuard] },
  ```

- [ ] **Step 8.3: Build and verify**

  ```bash
  cd frontend && npx ng build --configuration=production 2>&1 | tail -20
  ```
  Expected: build succeeds with zero errors.

- [ ] **Step 8.4: Commit route**

  ```bash
  git add frontend/src/app/app.routes.ts
  git commit -m "feat(camera): register cameras/client/:clientId NVR route"
  ```

---

### Task 9: End-to-end verification

- [ ] **Step 9.1: Start dev server**

  ```bash
  cd frontend && npx ng serve --open
  ```

- [ ] **Step 9.2: Verify Level 1 — client cards**

  Navigate to `/cameras` (requires admin login).
  - [ ] Grid shows one card per client
  - [ ] Each card shows online/offline count and total camera count
  - [ ] Card border is green if all online, red if any offline, gray if no cameras
  - [ ] Search box filters cards by client name in real-time
  - [ ] Skeleton animation shows during initial load
  - [ ] "+ Añadir Cámara" button opens the modal
  - [ ] "Ver NVR →" button is disabled when `total === 0`

- [ ] **Step 9.3: Verify Level 2 — NVR grid**

  Click "Ver NVR →" on a client with cameras.
  - [ ] URL changes to `/cameras/client/:id`
  - [ ] Topbar shows "← Clientes" | client name | EN VIVO/Offline counts | "+ Añadir Cámara"
  - [ ] Camera cells render in auto-selected grid layout (1/2/3/4 cols by count)
  - [ ] Each cell shows live stream via `CameraViewerComponent`
  - [ ] Overlay badges (EN VIVO / OFFLINE) always visible over video (no LIVE badge from viewer)
  - [ ] Camera name visible at bottom of each cell
  - [ ] On hover: fullscreen button ⛶ appears at top-right
  - [ ] Fullscreen button works (cell fills screen, ESC returns)
  - [ ] Click on a cell (not on fullscreen button) navigates to `/cameras/:id`
  - [ ] "← Clientes" returns to `/cameras`

- [ ] **Step 9.4: Verify dark/light theme**

  Toggle theme (if available in the app).
  - [ ] Client cards adapt correctly (no white backgrounds in light mode)
  - [ ] Overlays on video remain dark regardless of theme

- [ ] **Step 9.5: Final commit (if any fixes needed)**

  ```bash
  git add -A
  git commit -m "fix(camera): post-verification adjustments"
  ```
  (Only commit if there were actual fixes.)

---

## Summary

| Task | Files | Commit |
|------|-------|--------|
| 1 — CameraViewer hideOverlay | `camera-viewer.component.ts/html` | `feat(camera): add hideOverlay input` |
| 2–4 — Level 1 rewrite | `cameras.component.ts/html/scss` | `feat(camera): rewrite cameras view as Level 1 client-cards grid` |
| 5–7 — Level 2 NVR | `client-nvr.component.ts/html/scss` | `feat(camera): add ClientNvrComponent with auto-grid and overlays` |
| 8 — Route | `app.routes.ts` | `feat(camera): register cameras/client/:clientId NVR route` |
