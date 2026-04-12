import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { timer, Subscription, switchMap, forkJoin, catchError, of } from 'rxjs';
import { CameraGridComponent } from '../shared/camera-grid/camera-grid.component';

const API_URL = '/api';

export type CameraAlertStatus = 'online' | 'offline' | 'alert' | 'unknown';

@Component({
  selector: 'app-client-cameras',
  standalone: true,
  imports: [CommonModule, CameraGridComponent],
  template: `
    <div class="nvr-panel">

      <!-- Status banner -->
      <div class="system-status" [ngClass]="systemStatusClass()">
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

      <div class="nvr-toolbar">
        <span class="nvr-toolbar-title">
          Monitor en Vivo
          <span class="nvr-sub">{{ cameras().length }} cámara(s)</span>
        </span>
      </div>

      <app-camera-grid
        [cameras]="cameras()"
        [gatewayId]="gatewayId()"
        [alertStatusMap]="alertStatusMap()"
        [showLayoutPicker]="true"
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
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 20px;
      border-bottom: 1px solid var(--outline);
      flex-wrap: wrap;
      gap: 12px;
      transition: background 0.3s, border-color 0.3s;
    }
    .system-status.status-ok    { background: rgba(var(--green-rgb), 0.06); border-color: rgba(var(--green-rgb), 0.25); }
    .system-status.status-warn  { background: rgba(245,158,11, 0.06); border-color: rgba(245,158,11, 0.3); }
    .system-status.status-error { background: rgba(var(--red-rgb), 0.06); border-color: rgba(var(--red-rgb), 0.25); }
    .system-status.status-unknown { background: rgba(var(--ink-rgb), 0.02); }

    .status-indicator { display: flex; align-items: center; gap: 10px; }

    .status-dot {
      width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
    }
    .status-ok    .status-dot { background: var(--green); animation: pulse-green 2s infinite; }
    .status-warn  .status-dot { background: #f59e0b; animation: pulse-warn 2s infinite; }
    .status-error .status-dot { background: var(--red); animation: pulse-red 2s infinite; }
    .status-unknown .status-dot { background: var(--muted); }

    @keyframes pulse-green {
      0%, 100% { box-shadow: 0 0 0 0 rgba(var(--green-rgb), 0.5); }
      50%       { box-shadow: 0 0 0 6px rgba(var(--green-rgb), 0); }
    }
    @keyframes pulse-warn {
      0%, 100% { box-shadow: 0 0 0 0 rgba(245,158,11, 0.5); }
      50%       { box-shadow: 0 0 0 6px rgba(245,158,11, 0); }
    }
    @keyframes pulse-red {
      0%, 100% { box-shadow: 0 0 0 0 rgba(var(--red-rgb), 0.5); }
      50%       { box-shadow: 0 0 0 6px rgba(var(--red-rgb), 0); }
    }

    .status-text { font-size: 13px; font-weight: 600; }
    .status-ok    .status-text { color: var(--green); }
    .status-warn  .status-text { color: #f59e0b; }
    .status-error .status-text { color: var(--red); }
    .status-unknown .status-text { color: var(--muted); }

    .status-stats  { display: flex; align-items: center; gap: 16px; }
    .stat          { display: flex; flex-direction: column; align-items: center; gap: 1px; }
    .stat-value    { font-size: 18px; font-weight: 700; color: rgba(var(--ink-rgb), 1); line-height: 1; }
    .stat-label    { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
    .stat-divider  { width: 1px; height: 28px; background: var(--outline); }

    /* ── Toolbar ── */
    .nvr-toolbar {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 20px;
      background: rgba(var(--ink-rgb), 0.02);
      border-bottom: 1px solid var(--outline);
    }
    .nvr-toolbar-title {
      font-size: 14px; font-weight: 600;
      color: rgba(var(--ink-rgb), 1);
      display: flex; align-items: center; gap: 10px;
    }
    .nvr-sub { font-size: 12px; color: var(--muted); font-weight: 400; }

    @media (max-width: 768px) {
      .nvr-toolbar { padding: 10px 14px; }
      .system-status { padding: 10px 14px; }
      .stat-value { font-size: 15px; }
    }
  `]
})
export class ClientCamerasComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private pollSub?: Subscription;

  cameras        = signal<any[]>([]);
  gatewayId      = signal('');
  alertStatusMap = signal<Record<string, CameraAlertStatus>>({});

  onlineCount = computed(() =>
    this.cameras().filter(c => {
      const s = this.alertStatusMap()[String(c.id)];
      return s === 'online';
    }).length
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

  ngOnInit() {
    this.pollSub = timer(0, 20000).pipe(
      switchMap(() =>
        forkJoin({
          me: this.http.get<any>(`${API_URL}/client/me`),
          alerts: this.http.get<any[]>(`${API_URL}/client/me/alerts`).pipe(
            catchError(() => of([] as any[]))
          )
        })
      )
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

  ngOnDestroy() { this.pollSub?.unsubscribe(); }

  private buildStatusMap(
    cameras: any[],
    alerts: any[]
  ): Record<string, CameraAlertStatus> {
    const map: Record<string, CameraAlertStatus> = {};

    // Initialise every known camera as unknown
    for (const cam of cameras) {
      map[String(cam.id)] = 'unknown';
    }

    // Apply alert-derived states (skip Resolved alerts)
    for (const alert of alerts) {
      // entityType can be the string 'Camera' or enum int 0
      const isCamera = alert.entityType === 'Camera' || alert.entityType === 0;
      if (!isCamera) continue;

      const alertStatus: string = alert.status;
      if (alertStatus === 'Resolved') continue;

      const camId = String(alert.entityId);
      if (!(camId in map)) continue;

      if (alertStatus === 'Active') {
        map[camId] = 'offline';                              // Red
      } else if (alertStatus === 'Acknowledged' && map[camId] !== 'offline') {
        map[camId] = 'alert';                                // Amber
      }
    }

    // Camera with no unresolved alert and DB status active → green
    for (const cam of cameras) {
      const key = String(cam.id);
      if (map[key] === 'unknown' && cam.status === 'active') {
        map[key] = 'online';
      }
    }

    return map;
  }
}
