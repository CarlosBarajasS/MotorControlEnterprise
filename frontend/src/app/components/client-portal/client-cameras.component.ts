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
      <div class="nvr-toolbar">
        <span class="nvr-toolbar-title">
          Monitor en Vivo
          <span class="nvr-sub">{{ cameras().length }} cámara(s)</span>
        </span>
        <span class="nvr-sub">{{ onlineCount() }}/{{ cameras().length }} activas</span>
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
      box-shadow: 0 24px 48px rgba(0,0,0,0.4);
      min-height: 500px;
    }
    .nvr-toolbar {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 20px;
      background: rgba(var(--ink-rgb), 0.02);
      border-bottom: 1px solid var(--outline);
      flex-wrap: wrap;
    }
    .nvr-toolbar-title {
      font-size: 14px;
      font-weight: 600;
      color: rgba(var(--ink-rgb), 1);
      margin-right: auto;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .nvr-sub {
      font-size: 12px;
      color: rgba(var(--ink-rgb), 0.5);
      font-weight: 400;
    }
    @media (max-width: 768px) {
      .nvr-toolbar { padding: 10px 14px; gap: 8px; }
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
