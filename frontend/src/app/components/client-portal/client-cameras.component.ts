import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { CameraViewerComponent } from '../camera-viewer/camera-viewer.component';

@Component({
    selector: 'app-client-cameras',
    standalone: true,
    imports: [CommonModule, RouterModule, CameraViewerComponent],
    template: `
    <!-- NVR Monitor -->
    <div class="nvr-panel">
      <div class="nvr-toolbar">
        <span class="nvr-toolbar-title">
          Monitor en Vivo
          <span class="nvr-sub">{{ cameras().length }} cámara(s)</span>
        </span>
        <div class="nvr-layout-btns">
          <button class="layout-btn" [class.active]="gridCols === 1" (click)="gridCols = 1">1×1</button>
          <button class="layout-btn" [class.active]="gridCols === 2" (click)="gridCols = 2">2×2</button>
          <button class="layout-btn" [class.active]="gridCols === 3" (click)="gridCols = 3">3×3</button>
        </div>
      </div>

      <div class="camera-grid" [style.grid-template-columns]="'repeat(' + gridCols + ', 1fr)'">
        <div class="camera-cell" *ngFor="let cam of cameras(); let i = index">
          <app-camera-viewer [streamUrl]="'/api/stream/' + cam.id + '/hls'"
                             class="cell-viewer"></app-camera-viewer>
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
          <div class="cell-actions">
            <a [routerLink]="['/client/cameras', cam.id]" class="cell-action-btn">⛶ Expandir</a>
            <a [routerLink]="['/client/recordings', cam.id]" class="cell-action-btn">🎞 Grabaciones</a>
          </div>
        </div>

        <div class="nvr-state" *ngIf="cameras().length === 0">
          <div class="nvr-state-icon">📷</div>
          <div class="nvr-state-title">Sin Cámaras Asignadas</div>
          <div class="nvr-state-sub">Contacta al administrador para vincular cámaras a tu cuenta</div>
        </div>
      </div>

      <div class="nvr-statusbar">
        <span><span class="dot online"></span> En Línea</span>
        <span>|</span>
        <span>{{ onlineCount() }}/{{ cameras().length }} cámaras activas</span>
      </div>
    </div>
  `,
    styles: [`
    $nvr-bg: #0a0e1a;
    $nvr-cell: #0f1628;

    .nvr-panel {
      background: $nvr-bg;
      border-radius: 20px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      border: 1px solid rgba(255,255,255,0.06);
      box-shadow: 0 24px 48px rgba(0,0,0,0.4);
    }
    .nvr-toolbar {
      display: flex; align-items: center; gap: 12px;
      padding: 14px 20px;
      background: rgba(255,255,255,0.03);
      border-bottom: 1px solid rgba(255,255,255,0.06);
      flex-wrap: wrap;
    }
    .nvr-toolbar-title {
      font-size: 14px; font-weight: 600; color: #f1f5f9;
      margin-right: auto;
      display: flex; align-items: center; gap: 10px;
    }
    .nvr-sub { font-size: 12px; color: rgba(248,250,252,0.5); font-weight: 400; }
    .nvr-layout-btns { display: flex; gap: 6px; }
    .layout-btn {
      padding: 5px 10px; border-radius: 7px;
      background: transparent; border: 1px solid rgba(255,255,255,0.12);
      color: rgba(255,255,255,0.5); font-size: 12px; cursor: pointer;
      transition: all 0.15s;
      &:hover { background: rgba(255,255,255,0.08); color: #fff; }
      &.active { background: rgba(37,99,235,0.25); border-color: #3b82f6; color: #93c5fd; }
    }
    .camera-grid {
      display: grid; gap: 3px; padding: 3px;
      background: #060a12; min-height: 400px;
    }
    .camera-cell {
      position: relative; aspect-ratio: 16/9;
      background: $nvr-cell; overflow: hidden;
      &:hover { outline: 2px solid #3b82f6; }
      &:hover .cell-actions { opacity: 1; }
    }
    .cell-viewer { width: 100%; height: 100%; display: block; }
    .cell-overlay {
      position: absolute; bottom: 0; left: 0; right: 0;
      background: linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 100%);
      padding: 20px 10px 8px;
    }
    .cell-info { display: flex; justify-content: space-between; align-items: flex-end; }
    .cell-name { font-size: 11px; font-weight: 600; color: #f1f5f9; text-shadow: 0 1px 3px rgba(0,0,0,0.8); }
    .cell-status {
      font-size: 10px; font-weight: 700;
      display: flex; align-items: center; gap: 4px;
      &.online { color: #10b981; }
      &.offline { color: #ef4444; }
    }
    .dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; display: inline-block; }
    .cell-index {
      position: absolute; top: 6px; left: 8px;
      font-size: 10px; font-weight: 700;
      color: rgba(255,255,255,0.5);
      background: rgba(0,0,0,0.4);
      padding: 1px 5px; border-radius: 3px;
    }
    .cell-actions {
      position: absolute; top: 6px; right: 8px;
      display: flex; gap: 4px; opacity: 0;
      transition: opacity 0.2s;
    }
    .cell-action-btn {
      font-size: 10px; padding: 3px 8px; border-radius: 5px;
      background: rgba(0,0,0,0.6); color: #93c5fd; text-decoration: none;
      border: 1px solid rgba(255,255,255,0.15);
      &:hover { background: rgba(37,99,235,0.4); }
    }
    .nvr-state {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 10px; padding: 80px 20px; grid-column: 1/-1;
      color: rgba(255,255,255,0.4);
    }
    .nvr-state-icon { font-size: 48px; opacity: 0.4; }
    .nvr-state-title { font-size: 18px; font-weight: 600; }
    .nvr-state-sub { font-size: 14px; text-align: center; max-width: 300px; }
    .nvr-statusbar {
      display: flex; align-items: center; gap: 16px;
      padding: 8px 20px;
      background: rgba(255,255,255,0.02);
      border-top: 1px solid rgba(255,255,255,0.06);
      font-size: 11px; color: rgba(248,250,252,0.5);
      .dot.online { background: #10b981; box-shadow: 0 0 6px #10b981; }
    }
  `]
})
export class ClientCamerasComponent implements OnInit {
    private http = inject(HttpClient);
    private router = inject(Router);

    cameras = signal<any[]>([]);
    gridCols = 2;

    onlineCount = computed(() => this.cameras().filter(c => this.isOnline(c)).length);

    ngOnInit() {
        this.http.get<any[]>('/api/cameras').subscribe({
            next: (cams) => this.cameras.set(cams || []),
            error: (err) => console.error('Error loading cameras:', err)
        });
    }

    isOnline(cam: any): boolean {
        return cam.lastSeen && (Date.now() - new Date(cam.lastSeen).getTime()) < 60000;
    }
}
