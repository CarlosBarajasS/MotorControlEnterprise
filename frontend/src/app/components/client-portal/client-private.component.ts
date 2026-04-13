import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { WebrtcViewerComponent } from '../camera-viewer/webrtc-viewer.component';

const API_URL = '/api';

@Component({
  selector: 'app-client-private',
  standalone: true,
  imports: [CommonModule, WebrtcViewerComponent],
  template: `
    <div class="private-panel">

      <!-- Header -->
      <div class="private-header">
        <div class="header-title">
          <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          <span>Acceso Privado</span>
        </div>
        <p class="header-sub">Cámaras con acceso restringido — solo visibles en esta sección.</p>
      </div>

      <!-- Loading -->
      @if (loading()) {
        <div class="state-msg">
          <span class="spinner"></span>
          <span>Cargando cámaras privadas...</span>
        </div>
      }

      <!-- Empty -->
      @if (!loading() && cameras().length === 0) {
        <div class="state-msg empty">
          <svg width="40" height="40" fill="none" stroke="currentColor" stroke-width="1" viewBox="0 0 24 24" style="opacity:0.3">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          <p>No hay cámaras privadas configuradas.</p>
          <p class="empty-hint">Activa el candado 🔒 en el editor de layouts para mover cámaras aquí.</p>
        </div>
      }

      <!-- Grid -->
      @if (!loading() && cameras().length > 0) {
        <div class="cameras-grid" [class.single]="cameras().length === 1">
          @for (cam of cameras(); track cam.id) {
            <div class="camera-card">
              <div class="camera-stream">
                <app-webrtc-viewer
                  [streamPath]="streamPath(cam)">
                </app-webrtc-viewer>
              </div>
              <div class="camera-footer">
                <div class="cam-info">
                  <span class="cam-name">{{ cam.name }}</span>
                  @if (cam.location) {
                    <span class="cam-location">{{ cam.location }}</span>
                  }
                </div>
                <div class="cam-status" [class.online]="cam.status === 'active'" [class.offline]="cam.status !== 'active'">
                  <span class="status-dot"></span>
                  <span>{{ cam.status === 'active' ? 'En línea' : 'Offline' }}</span>
                </div>
              </div>
            </div>
          }
        </div>
      }

    </div>
  `,
  styles: [`
    .private-panel {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    /* ── Header ── */
    .private-header {
      padding: 20px 24px;
      background: var(--surface);
      border: 1px solid var(--outline);
      border-radius: 16px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .header-title {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 16px;
      font-weight: 700;
      color: rgba(var(--ink-rgb), 1);
      svg { color: var(--accent); }
    }
    .header-sub {
      font-size: 13px;
      color: var(--muted);
      margin: 0;
      padding-left: 28px;
    }

    /* ── States ── */
    .state-msg {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding: 60px 24px;
      color: var(--muted);
      font-size: 14px;
      text-align: center;
    }
    .state-msg p { margin: 0; }
    .empty-hint { font-size: 12px; opacity: 0.7; }

    .spinner {
      width: 24px; height: 24px;
      border: 2px solid var(--outline);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
      display: inline-block;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* ── Grid ── */
    .cameras-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 16px;
    }
    .cameras-grid.single {
      grid-template-columns: minmax(320px, 640px);
    }

    /* ── Card ── */
    .camera-card {
      background: var(--surface);
      border: 1px solid var(--outline);
      border-radius: 14px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      transition: box-shadow 0.2s;
    }
    .camera-card:hover {
      box-shadow: 0 4px 20px rgba(0,0,0,0.1);
    }

    .camera-stream {
      aspect-ratio: 16/9;
      background: #000;
      overflow: hidden;
    }
    .camera-stream app-webrtc-viewer {
      display: block;
      width: 100%;
      height: 100%;
    }

    .camera-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px;
      gap: 8px;
    }
    .cam-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
      overflow: hidden;
    }
    .cam-name {
      font-size: 13px;
      font-weight: 600;
      color: rgba(var(--ink-rgb), 0.9);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .cam-location {
      font-size: 11px;
      color: var(--muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .cam-status {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 11px;
      font-weight: 500;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .cam-status .status-dot {
      width: 6px; height: 6px; border-radius: 50%;
    }
    .cam-status.online { color: var(--green); }
    .cam-status.online .status-dot { background: var(--green); }
    .cam-status.offline { color: var(--muted); }
    .cam-status.offline .status-dot { background: var(--muted); }

    @media (max-width: 768px) {
      .cameras-grid { grid-template-columns: 1fr; }
      .cameras-grid.single { grid-template-columns: 1fr; }
      .private-header { padding: 14px 16px; }
    }
  `]
})
export class ClientPrivateComponent implements OnInit {
  private http = inject(HttpClient);

  cameras = signal<any[]>([]);
  loading = signal(true);
  gatewayId = signal('');

  ngOnInit() {
    // Load gatewayId from /client/me and private cameras in parallel
    this.http.get<any>(`${API_URL}/client/me`).subscribe({
      next: (me) => {
        if (me.gatewayId) this.gatewayId.set(me.gatewayId);
      },
      error: () => {}
    });

    this.http.get<any[]>(`${API_URL}/client/private`).subscribe({
      next: (cams) => {
        this.cameras.set(cams);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  streamPath(cam: any): string {
    const gw = this.gatewayId();
    const key = cam.cameraId ?? cam.cameraKey ?? '';
    return gw && key ? `${gw}/${key}` : '';
  }
}
