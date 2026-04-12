import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { timer, Subscription, switchMap, forkJoin, catchError, of } from 'rxjs';
import { CameraGridComponent } from '../shared/camera-grid/camera-grid.component';
import { ClientLayoutService } from '../../services/client-layout.service';
import { ClientLayout, LayoutConfig, LayoutCell } from '../../models/client-layout.model';

const API_URL = '/api';

export type CameraAlertStatus = 'online' | 'offline' | 'alert' | 'unknown';

@Component({
  selector: 'app-client-cameras',
  standalone: true,
  imports: [CommonModule, FormsModule, CameraGridComponent],
  template: `
    <div class="nvr-panel">

      <!-- Status banner -->
      <div class="system-status" [ngClass]="systemStatusClass()" [class.hidden]="!controlsVisible()">
        <div class="status-indicator">
          <span class="status-dot"></span>
          <span class="status-text">{{ systemStatusText() }}</span>
        </div>
        <div class="status-stats">
          <div class="stat">
            <span class="stat-value">{{ onlineCount() }}</span>
            <span class="stat-label">En línea</span>
          </div>
          <div class="stat-divider"></div>
          <div class="stat">
            <span class="stat-value">{{ cameras().length }}</span>
            <span class="stat-label">Total</span>
          </div>
        </div>
      </div>

      <!-- Toolbar: layout tabs + fullscreen -->
      <div class="nvr-toolbar" [class.hidden]="!controlsVisible()">
        <div class="layout-tabs" #tabsContainer>
          <button class="tab-add" (click)="startNewLayout()" title="Nuevo layout">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Nuevo
          </button>
          @for (layout of layouts(); track layout.id) {
            <div class="tab" [class.active]="activeLayoutId() === layout.id">
              <button class="tab-name" (click)="activateLayout(layout)">
                {{ layout.name }}
                @if (layout.isDefault) { <span class="tab-default">●</span> }
              </button>
              <button class="tab-menu" (click)="openLayoutMenu($event, layout)" title="Opciones">⋯</button>
            </div>
          }
        </div>

        <div class="toolbar-right">
          <button class="btn-edit" (click)="toggleEditMode()" [class.active]="editMode()">
            @if (editMode()) {
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
              Cancelar
            } @else {
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
              Editar layout
            }
          </button>
          <button class="btn-fullscreen" (click)="toggleFullscreen()" title="Pantalla completa">
            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
              <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
              <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- Layout menu dropdown -->
      @if (menuLayout()) {
        <div class="layout-menu-overlay" (click)="closeLayoutMenu()"></div>
        <div class="layout-menu" [style.top.px]="menuY()" [style.left.px]="menuX()">
          <button (click)="renameLayout(menuLayout()!)">Renombrar</button>
          <button (click)="setDefaultLayout(menuLayout()!)">Poner como predeterminado</button>
          <button class="danger" (click)="deleteLayout(menuLayout()!)">Eliminar</button>
        </div>
      }

      <!-- Main content: grid -->
      <app-camera-grid
        [cameras]="cameras()"
        [gatewayId]="gatewayId()"
        [alertStatusMap]="alertStatusMap()"
        [showLayoutPicker]="false"
        [clientMode]="true"
        emptyMessage="Sin cámaras asignadas — contacta al administrador">
      </app-camera-grid>

    </div>
  `,
  styles: [`
    .nvr-panel {
      background: var(--bg);
      border-radius: 20px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      border: 1px solid var(--outline);
      min-height: 500px;
    }

    /* ── Status banner ── */
    .system-status {
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 20px; border-bottom: 1px solid var(--outline);
      flex-wrap: wrap; gap: 12px; transition: background 0.3s, border-color 0.3s;
    }
    .system-status.status-ok    { background: rgba(var(--green-rgb), 0.06); border-color: rgba(var(--green-rgb), 0.25); }
    .system-status.status-warn  { background: rgba(245,158,11, 0.06); border-color: rgba(245,158,11, 0.3); }
    .system-status.status-error { background: rgba(var(--red-rgb), 0.06); border-color: rgba(var(--red-rgb), 0.25); }
    .system-status.status-unknown { background: rgba(var(--ink-rgb), 0.02); }
    .status-indicator { display: flex; align-items: center; gap: 10px; }
    .status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .status-ok    .status-dot { background: var(--green); animation: pulse-green 2s infinite; }
    .status-warn  .status-dot { background: #f59e0b; animation: pulse-warn 2s infinite; }
    .status-error .status-dot { background: var(--red); animation: pulse-red 2s infinite; }
    .status-unknown .status-dot { background: var(--muted); }
    @keyframes pulse-green { 0%,100%{box-shadow:0 0 0 0 rgba(var(--green-rgb),.5)} 50%{box-shadow:0 0 0 6px rgba(var(--green-rgb),0)} }
    @keyframes pulse-warn  { 0%,100%{box-shadow:0 0 0 0 rgba(245,158,11,.5)} 50%{box-shadow:0 0 0 6px rgba(245,158,11,0)} }
    @keyframes pulse-red   { 0%,100%{box-shadow:0 0 0 0 rgba(var(--red-rgb),.5)} 50%{box-shadow:0 0 0 6px rgba(var(--red-rgb),0)} }
    .status-text { font-size: 13px; font-weight: 600; }
    .status-ok    .status-text { color: var(--green); }
    .status-warn  .status-text { color: #f59e0b; }
    .status-error .status-text { color: var(--red); }
    .status-unknown .status-text { color: var(--muted); }
    .status-stats { display: flex; align-items: center; gap: 16px; }
    .stat { display: flex; flex-direction: column; align-items: center; gap: 1px; }
    .stat-value { font-size: 18px; font-weight: 700; color: rgba(var(--ink-rgb), 1); line-height: 1; }
    .stat-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
    .stat-divider { width: 1px; height: 28px; background: var(--outline); }

    /* ── Toolbar ── */
    .nvr-toolbar {
      display: flex; align-items: center; gap: 12px;
      padding: 10px 16px; background: rgba(var(--ink-rgb), 0.02);
      border-bottom: 1px solid var(--outline);
    }
    .layout-tabs {
      display: flex; align-items: center; gap: 6px;
      flex: 1; overflow-x: auto; scrollbar-width: none;
    }
    .layout-tabs::-webkit-scrollbar { display: none; }
    .tab-add {
      display: flex; align-items: center; gap: 5px;
      padding: 5px 10px; border-radius: 8px; border: 1px dashed var(--outline);
      background: transparent; color: var(--muted); font-size: 12px; cursor: pointer;
      white-space: nowrap; transition: border-color 0.2s, color 0.2s; flex-shrink: 0;
    }
    .tab-add:hover { border-color: var(--accent); color: var(--accent); }
    .tab {
      display: flex; align-items: center; gap: 0;
      border-radius: 8px; border: 1px solid var(--outline);
      overflow: hidden; flex-shrink: 0; transition: border-color 0.2s;
    }
    .tab.active { border-color: var(--accent); background: rgba(var(--accent-rgb,0,120,255), 0.06); }
    .tab-name {
      padding: 5px 10px; background: transparent; border: none;
      font-size: 12px; font-weight: 500; color: rgba(var(--ink-rgb), 0.8);
      cursor: pointer; display: flex; align-items: center; gap: 5px; white-space: nowrap;
    }
    .tab.active .tab-name { color: var(--accent); }
    .tab-default { color: var(--accent); font-size: 8px; }
    .tab-menu {
      padding: 5px 7px; background: transparent; border: none;
      border-left: 1px solid var(--outline); color: var(--muted);
      cursor: pointer; font-size: 14px; line-height: 1;
    }
    .tab-menu:hover { background: rgba(var(--ink-rgb), 0.05); }

    .toolbar-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; margin-left: auto; }
    .btn-edit {
      display: flex; align-items: center; gap: 6px;
      padding: 6px 12px; border-radius: 8px; border: 1px solid var(--outline);
      background: transparent; font-size: 12px; font-weight: 500;
      color: rgba(var(--ink-rgb), 0.8); cursor: pointer; white-space: nowrap;
      transition: border-color 0.2s, color 0.2s;
    }
    .btn-edit:hover, .btn-edit.active { border-color: var(--accent); color: var(--accent); }
    .btn-fullscreen {
      width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;
      border-radius: 8px; border: 1px solid var(--outline); background: transparent;
      color: var(--muted); cursor: pointer; transition: border-color 0.2s, color 0.2s;
    }
    .btn-fullscreen:hover { border-color: var(--accent); color: var(--accent); }

    /* ── Layout context menu ── */
    .layout-menu-overlay { position: fixed; inset: 0; z-index: 900; }
    .layout-menu {
      position: fixed; z-index: 901; min-width: 180px;
      background: var(--surface); border: 1px solid var(--outline);
      border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,0.15);
      overflow: hidden;
    }
    .layout-menu button {
      display: block; width: 100%; padding: 10px 14px; text-align: left;
      background: transparent; border: none; font-size: 13px;
      color: rgba(var(--ink-rgb), 0.85); cursor: pointer;
    }
    .layout-menu button:hover { background: rgba(var(--ink-rgb), 0.05); }
    .layout-menu button.danger { color: var(--red); }

    /* ── Fullscreen ── */
    .nvr-panel.fullscreen-mode {
      position: fixed; inset: 0; z-index: 9999;
      border-radius: 0; border: none; background: #000;
    }
    .nvr-panel.fullscreen-mode .system-status,
    .nvr-panel.fullscreen-mode .nvr-toolbar {
      position: absolute; top: 0; left: 0; right: 0; z-index: 10;
      background: rgba(0,0,0,0.55); border-color: transparent;
      transition: opacity 0.3s;
    }
    .nvr-panel.fullscreen-mode .nvr-toolbar { top: auto; }
    .hidden { opacity: 0; pointer-events: none; transition: opacity 0.3s; }

    @media (max-width: 768px) {
      .nvr-toolbar { padding: 8px 12px; }
      .system-status { padding: 10px 14px; }
      .stat-value { font-size: 15px; }
    }
  `]
})
export class ClientCamerasComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private layoutService = inject(ClientLayoutService);
  private pollSub?: Subscription;
  private hideTimer?: ReturnType<typeof setTimeout>;

  cameras        = signal<any[]>([]);
  gatewayId      = signal('');
  alertStatusMap = signal<Record<string, CameraAlertStatus>>({});
  layouts        = signal<ClientLayout[]>([]);
  activeLayoutId = signal<number | null>(null);
  editMode       = signal(false);
  menuLayout     = signal<ClientLayout | null>(null);
  menuX          = signal(0);
  menuY          = signal(0);
  isFullscreen   = signal(false);
  controlsVisible = signal(true);

  onlineCount = computed(() =>
    this.cameras().filter(c => this.alertStatusMap()[String(c.id)] === 'online').length
  );

  systemStatusClass = computed(() => {
    if (this.cameras().length === 0) return 'status-unknown';
    const offline = Object.values(this.alertStatusMap()).filter(s => s === 'offline').length;
    if (offline > 0) return 'status-error';
    const alerts = Object.values(this.alertStatusMap()).filter(s => s === 'alert').length;
    if (alerts > 0) return 'status-warn';
    return 'status-ok';
  });

  systemStatusText = computed(() => {
    const cls = this.systemStatusClass();
    if (cls === 'status-ok')    return 'Sistema operando con normalidad';
    if (cls === 'status-warn')  return 'Algunas cámaras requieren atención';
    if (cls === 'status-error') return 'Cámaras offline detectadas';
    return 'Verificando estado del sistema...';
  });

  activeConfig = computed((): LayoutConfig => {
    const layout = this.layouts().find(l => l.id === this.activeLayoutId());
    if (!layout) return { totalCols: 2, cells: [] };
    try { return JSON.parse(layout.config) as LayoutConfig; }
    catch { return { totalCols: 2, cells: [] }; }
  });

  restrictedCameraIds = computed(() => {
    return new Set(this.cameras().filter((c: any) => c.isClientRestricted).map((c: any) => c.id as number));
  });

  ngOnInit() {
    this.loadLayouts();
    document.addEventListener('fullscreenchange', () => {
      this.isFullscreen.set(!!document.fullscreenElement);
      if (!document.fullscreenElement) {
        this.controlsVisible.set(true);
        clearTimeout(this.hideTimer);
      }
    });
    this.pollSub = timer(0, 20000).pipe(
      switchMap(() => forkJoin({
        me: this.http.get<any>(`${API_URL}/client/me`),
        alerts: this.http.get<any[]>(`${API_URL}/client/me/alerts`).pipe(catchError(() => of([] as any[])))
      }))
    ).subscribe({
      next: ({ me, alerts }) => {
        const cams: any[] = me.cameras || [];
        this.cameras.set(cams);
        if (me.gatewayId) this.gatewayId.set(me.gatewayId);
        this.alertStatusMap.set(this.buildStatusMap(cams, alerts ?? []));
      },
      error: (err) => console.error('Error loading client profile:', err)
    });
  }

  ngOnDestroy() {
    this.pollSub?.unsubscribe();
    clearTimeout(this.hideTimer);
  }

  onMouseMove() {
    this.controlsVisible.set(true);
    clearTimeout(this.hideTimer);
    if (document.fullscreenElement) {
      this.hideTimer = setTimeout(() => this.controlsVisible.set(false), 2000);
    }
  }

  loadLayouts() {
    this.layoutService.getLayouts().subscribe(layouts => {
      this.layouts.set(layouts);
      const def = layouts.find(l => l.isDefault) ?? layouts[0];
      if (def) this.activeLayoutId.set(def.id);
    });
  }

  activateLayout(layout: ClientLayout) {
    this.activeLayoutId.set(layout.id);
    this.editMode.set(false);
  }

  toggleEditMode() {
    this.editMode.update(v => !v);
  }

  toggleFullscreen() {
    const el = document.documentElement;
    if (!document.fullscreenElement) {
      el.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }

  startNewLayout() {
    const name = prompt('Nombre del nuevo layout:');
    if (!name?.trim()) return;
    const emptyConfig = JSON.stringify({ totalCols: 2, cells: [] });
    this.layoutService.createLayout(name.trim(), emptyConfig, this.layouts().length === 0).subscribe(created => {
      this.layouts.update(ls => [...ls, created]);
      this.activeLayoutId.set(created.id);
    });
  }

  openLayoutMenu(event: MouseEvent, layout: ClientLayout) {
    event.stopPropagation();
    this.menuLayout.set(layout);
    this.menuX.set(event.clientX);
    this.menuY.set(event.clientY);
  }

  closeLayoutMenu() { this.menuLayout.set(null); }

  renameLayout(layout: ClientLayout) {
    const name = prompt('Nuevo nombre:', layout.name);
    if (!name?.trim() || name.trim() === layout.name) { this.closeLayoutMenu(); return; }
    this.layoutService.updateLayout(layout.id, { name: name.trim() }).subscribe(updated => {
      this.layouts.update(ls => ls.map(l => l.id === updated.id ? updated : l));
      this.closeLayoutMenu();
    });
  }

  setDefaultLayout(layout: ClientLayout) {
    this.layoutService.updateLayout(layout.id, { isDefault: true }).subscribe(() => {
      this.layouts.update(ls => ls.map(l => ({ ...l, isDefault: l.id === layout.id })));
      this.closeLayoutMenu();
    });
  }

  deleteLayout(layout: ClientLayout) {
    if (!confirm(`¿Eliminar el layout "${layout.name}"?`)) { this.closeLayoutMenu(); return; }
    this.layoutService.deleteLayout(layout.id).subscribe(() => {
      const remaining = this.layouts().filter(l => l.id !== layout.id);
      this.layouts.set(remaining);
      if (this.activeLayoutId() === layout.id) {
        this.activeLayoutId.set(remaining[0]?.id ?? null);
      }
      this.closeLayoutMenu();
    });
  }

  onBuilderSave(config: LayoutConfig) {
    const activeId = this.activeLayoutId();
    const configStr = JSON.stringify(config);
    if (activeId) {
      const choice = confirm('¿Sobreescribir el layout actual?\n\nAceptar = Sobreescribir\nCancelar = Guardar como nuevo');
      if (choice) {
        this.layoutService.updateLayout(activeId, { config: configStr }).subscribe(updated => {
          this.layouts.update(ls => ls.map(l => l.id === updated.id ? updated : l));
          this.editMode.set(false);
        });
      } else {
        const name = prompt('Nombre del nuevo layout:');
        if (!name?.trim()) return;
        this.layoutService.createLayout(name.trim(), configStr, false).subscribe(created => {
          this.layouts.update(ls => [...ls, created]);
          this.activeLayoutId.set(created.id);
          this.editMode.set(false);
        });
      }
    } else {
      const name = prompt('Nombre del layout:');
      if (!name?.trim()) return;
      this.layoutService.createLayout(name.trim(), configStr, true).subscribe(created => {
        this.layouts.update(ls => [...ls, created]);
        this.activeLayoutId.set(created.id);
        this.editMode.set(false);
      });
    }
  }

  onRestrictedChange(event: { cameraId: number; restricted: boolean }) {
    this.layoutService.setRestricted(event.cameraId, event.restricted).subscribe(() => {
      this.cameras.update(cams =>
        cams.map(c => c.id === event.cameraId ? { ...c, isClientRestricted: event.restricted } : c)
      );
    });
  }

  private buildStatusMap(cameras: any[], alerts: any[]): Record<string, CameraAlertStatus> {
    const map: Record<string, CameraAlertStatus> = {};
    for (const cam of cameras) map[String(cam.id)] = 'unknown';
    for (const alert of alerts) {
      const isCamera = alert.entityType === 'Camera' || alert.entityType === 0;
      if (!isCamera) continue;
      const alertStatus: string = alert.status;
      if (alertStatus === 'Resolved') continue;
      const camId = String(alert.entityId);
      if (!(camId in map)) continue;
      if (alertStatus === 'Active') map[camId] = 'offline';
      else if (alertStatus === 'Acknowledged' && map[camId] !== 'offline') map[camId] = 'alert';
    }
    for (const cam of cameras) {
      const key = String(cam.id);
      if (map[key] === 'unknown' && cam.status === 'active') map[key] = 'online';
    }
    return map;
  }
}
