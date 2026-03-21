import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { timer, Subscription, switchMap } from 'rxjs';
import { CameraGridComponent } from '../shared/camera-grid/camera-grid.component';

const API_URL = '/api';

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

  cameras  = signal<any[]>([]);
  gatewayId = signal('');
  onlineCount = computed(() => this.cameras().filter(c => c.status === 'active').length);

  ngOnInit() {
    this.pollSub = timer(0, 20000).pipe(
      switchMap(() => this.http.get<any>(`${API_URL}/client/me`))
    ).subscribe({
      next: (me) => {
        this.cameras.set(me.cameras || []);
        if (me.gatewayId) this.gatewayId.set(me.gatewayId);
      },
      error: (err) => console.error('Error loading client profile:', err)
    });
  }

  ngOnDestroy() { this.pollSub?.unsubscribe(); }
}
