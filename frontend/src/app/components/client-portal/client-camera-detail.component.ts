import { Component, OnInit, OnDestroy, inject, signal, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { WebrtcViewerComponent } from '../camera-viewer/webrtc-viewer.component';

const API_URL = '/api';

@Component({
  selector: 'app-client-camera-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, WebrtcViewerComponent],
  template: `
    <div class="detail-container" *ngIf="camera()">
      <div class="detail-topbar">
        <div>
          <a routerLink="/client/cameras" class="back-link">← Volver a Cámaras</a>
          <h1>{{ camera().name || 'Cámara' }}</h1>
          <p class="meta">
            <span class="status-dot" [class.online]="isOnline()"></span>
            {{ isOnline() ? 'En Vivo' : 'Sin Señal' }}
            <span class="sep">|</span>
            {{ camera().location || 'Ubicación desconocida' }}
          </p>
        </div>
        <div class="detail-actions">
          <a [routerLink]="camera().recordingCameraId ? ['/client/recordings', camera().recordingCameraId] : null" 
             class="btn-recordings" [class.disabled]="!camera().recordingCameraId"
             [title]="!camera().recordingCameraId ? 'Esta cámara no tiene almacenamiento en nube configurado' : ''">
             🎞 Grabaciones
          </a>
        </div>
      </div>

      <div class="video-wrapper">
        <app-webrtc-viewer *ngIf="streamPath()" [streamPath]="streamPath()" class="full-viewer"></app-webrtc-viewer>
      </div>

      <!-- PTZ Controls -->
      <div class="ptz-panel" *ngIf="camera().ptz">
        <h3>Control PTZ</h3>
        <div class="ptz-grid">
          <button class="ptz-btn" (mousedown)="ptzMove(-70,70,0)" (mouseup)="ptzStop()" (mouseleave)="ptzStop()">↖</button>
          <button class="ptz-btn" (mousedown)="ptzMove(0,100,0)" (mouseup)="ptzStop()" (mouseleave)="ptzStop()">⬆️</button>
          <button class="ptz-btn" (mousedown)="ptzMove(70,70,0)" (mouseup)="ptzStop()" (mouseleave)="ptzStop()">↗</button>
          <button class="ptz-btn" (mousedown)="ptzMove(-100,0,0)" (mouseup)="ptzStop()" (mouseleave)="ptzStop()">⬅️</button>
          <button class="ptz-btn stop" (click)="ptzStop()">⏹️</button>
          <button class="ptz-btn" (mousedown)="ptzMove(100,0,0)" (mouseup)="ptzStop()" (mouseleave)="ptzStop()">➡️</button>
          <button class="ptz-btn" (mousedown)="ptzMove(-70,-70,0)" (mouseup)="ptzStop()" (mouseleave)="ptzStop()">↙</button>
          <button class="ptz-btn" (mousedown)="ptzMove(0,-100,0)" (mouseup)="ptzStop()" (mouseleave)="ptzStop()">⬇️</button>
          <button class="ptz-btn" (mousedown)="ptzMove(70,-70,0)" (mouseup)="ptzStop()" (mouseleave)="ptzStop()">↘</button>
        </div>
        <div class="zoom-controls">
          <button class="ptz-btn" (mousedown)="ptzMove(0,0,100)" (mouseup)="ptzStop()" (mouseleave)="ptzStop()">🔍+</button>
          <button class="ptz-btn" (mousedown)="ptzMove(0,0,-100)" (mouseup)="ptzStop()" (mouseleave)="ptzStop()">🔍−</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .detail-container { color: rgba(var(--ink-rgb), 1); }
    .detail-topbar {
      display: flex; justify-content: space-between; align-items: flex-start;
      margin-bottom: 20px;
    }
    .back-link {
      color: var(--accent); text-decoration: none; font-size: 13px; font-weight: 600;
      display: inline-block; margin-bottom: 8px;
      &:hover { text-decoration: underline; }
    }
    h1 { font-family: 'Space Grotesk', sans-serif; font-size: 1.5rem; margin: 0 0 6px; }
    .meta {
      color: var(--muted); font-size: 13px;
      display: flex; align-items: center; gap: 6px;
    }
    .status-dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: #ef4444; display: inline-block;
      &.online { background: #10b981; box-shadow: 0 0 6px rgba(16,185,129,0.5); }
    }
    .sep { margin: 0 6px; }
    .btn-recordings {
      padding: 8px 16px; border-radius: 8px;
      background: rgba(var(--ink-rgb), 0.06); border: 1px solid var(--outline);
      color: var(--accent); font-size: 13px; font-weight: 600;
      text-decoration: none;
      &:hover:not(.disabled) { background: rgba(var(--accent-rgb), 0.12); }
      &.disabled { opacity: 0.5; pointer-events: none; cursor: not-allowed; }
    }
    .video-wrapper {
      border-radius: 16px; overflow: hidden;
      background: #0a0e1a; aspect-ratio: 16/9;
      border: 1px solid var(--outline);
      margin-bottom: 20px;
    }
    .full-viewer { width: 100%; height: 100%; display: block; }
    .ptz-panel {
      background: var(--surface); border-radius: 16px;
      padding: 20px; border: 1px solid var(--outline);
      h3 { font-size: 14px; margin: 0 0 12px; color: var(--muted); }
    }
    .ptz-grid {
      display: grid; grid-template-columns: repeat(3, 44px);
      gap: 4px; justify-content: center; margin-bottom: 12px;
    }
    .ptz-btn {
      width: 44px; height: 44px; border-radius: 8px;
      background: rgba(var(--ink-rgb), 0.06); border: 1px solid var(--outline);
      color: rgba(var(--ink-rgb), 1); font-size: 16px; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      &:hover { background: rgba(37,99,235,0.25); }
      &.stop { background: rgba(239,68,68,0.15); border-color: rgba(239,68,68,0.3); }
    }
    .zoom-controls {
      display: flex; gap: 6px; justify-content: center;
    }
  `]
})
export class ClientCameraDetailComponent implements OnInit {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);

  camera = signal<any>(null);
  streamPath = signal('');

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.http.get<any>(`${API_URL}/cameras/${id}`).subscribe({
        next: (cam) => {
          this.camera.set(cam);
          this.http.get<any>(`${API_URL}/client/me`).subscribe({
            next: (me) => {
              const cameraKey = cam.cameraId ?? cam.cameraKey ?? cam.name;
              if (me.gatewayId) {
                this.streamPath.set(`${me.gatewayId}/${cameraKey}`);
              }
            },
            error: (err) => console.error('Error loading client profile:', err)
          });
        },
        error: (err) => console.error('Error loading camera:', err)
      });
    }
  }

  isOnline(): boolean {
    const cam = this.camera();
    return cam.lastSeen && (Date.now() - new Date(cam.lastSeen).getTime()) < 60000;
  }

  ptzMove(pan: number, tilt: number, zoom: number) {
    const id = this.camera().id;
    this.http.post(`/api/cameras/${id}/ptz/move`, { pan, tilt, zoom }).subscribe();
  }

  ptzStop() {
    const id = this.camera().id;
    this.http.post(`/api/cameras/${id}/ptz/stop`, {}).subscribe();
  }
}
