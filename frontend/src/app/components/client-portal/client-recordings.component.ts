import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-client-recordings',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="recordings-container">

      <!-- === LANDING: sin ID — lista de cámaras === -->
      <ng-container *ngIf="!cameraId()">
        <div class="rec-topbar">
          <h1>Grabaciones en Nube</h1>
          <p class="rec-subtitle">Selecciona una cámara para ver sus grabaciones almacenadas</p>
        </div>
        <div class="cameras-list" *ngIf="cloudCameras().length > 0">
          <a class="cam-card" *ngFor="let c of cloudCameras()"
             [routerLink]="['/client/recordings', c.id]">
            <div class="cam-card-icon">🎬</div>
            <div class="cam-card-info">
              <span class="cam-card-name">{{ c.name }}</span>
              <span class="cam-card-sub">Almacenamiento cloud activo</span>
            </div>
            <span class="cam-card-arrow">→</span>
          </a>
        </div>
        <div class="empty-state" *ngIf="!loadingCameras() && cloudCameras().length === 0">
          <div class="empty-icon">📂</div>
          <p class="empty-title">Sin grabaciones en nube</p>
          <p class="empty-msg">Ninguna de tus cámaras tiene almacenamiento cloud configurado actualmente.</p>
        </div>
        <p class="empty-msg" *ngIf="loadingCameras()">Cargando cámaras...</p>
      </ng-container>

      <!-- === DETALLE: con ID — grabaciones de una cámara === -->
      <ng-container *ngIf="cameraId()">
        <div class="rec-topbar">
          <div>
            <a routerLink="/client/recordings" class="back-link">← Volver a Grabaciones</a>
            <h1>Grabaciones — {{ cameraName() }}</h1>
          </div>
        </div>

        <!-- Date Selector -->
        <div class="date-selector">
          <h3>Fechas Disponibles</h3>
          <div class="date-chips" *ngIf="availableDates().length > 0">
            <button class="date-chip" *ngFor="let d of availableDates()"
                    [class.active]="selectedDate() === d"
                    (click)="selectDate(d)">{{ d }}</button>
          </div>
          <p class="empty-msg" *ngIf="availableDates().length === 0">
            {{ loadingDates() ? 'Cargando fechas...' : 'No hay grabaciones disponibles para esta cámara' }}
          </p>
        </div>

        <!-- Recordings List -->
        <div class="rec-list" *ngIf="recordings().length > 0">
          <h3>Grabaciones del {{ selectedDate() }}</h3>
          <div class="rec-grid">
            <div class="rec-item"
                 *ngFor="let rec of recordings()"
                 [class.playing]="currentRecordingName() === rec.filename"
                 (click)="playRecording(rec)">
              <div class="rec-icon">
                <svg *ngIf="currentRecordingName() !== rec.filename" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M15 10l-4-2v8l4-2V10z"/><rect x="2" y="4" width="20" height="16" rx="2"/></svg>
                <svg *ngIf="currentRecordingName() === rec.filename" width="20" height="20" viewBox="0 0 24 24" fill="#3b82f6" stroke="#3b82f6" stroke-width="1.5"><polygon points="6 4 20 12 6 20 6 4"/></svg>
              </div>
              <div class="rec-info">
                <span class="rec-name">{{ rec.filename || rec.startTime }}</span>
                <span class="rec-size">{{ rec.sizeMb ? (rec.sizeMb | number:'1.1-1') + ' MB' : '' }}</span>
              </div>
              <span class="rec-play-hint" *ngIf="currentRecordingName() !== rec.filename">Reproducir</span>
              <span class="rec-now-playing" *ngIf="currentRecordingName() === rec.filename">● En reproducción</span>
            </div>
          </div>
        </div>
      </ng-container>

    </div>

    <!-- ═══════════════════════════════════════════════
         FLOATING VIDEO POPUP
    ═══════════════════════════════════════════════ -->
    <div class="video-popup"
         *ngIf="popupVisible()"
         [class.expanded]="popupExpanded()"
         [style.left.px]="popupX()"
         [style.top.px]="popupY()">

      <!-- Barra de título / drag handle -->
      <div class="popup-header" (mousedown)="onDragStart($event)">
        <svg class="popup-drag-icon" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/>
          <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
          <circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/>
        </svg>
        <span class="popup-title">{{ currentRecordingName() }}</span>
        <button class="popup-btn" (click)="toggleExpand()" [title]="popupExpanded() ? 'Modo ventana' : 'Pantalla completa'">
          <svg *ngIf="!popupExpanded()" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
            <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
          </svg>
          <svg *ngIf="popupExpanded()" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/>
            <line x1="10" y1="14" x2="3" y2="21"/><line x1="21" y1="3" x2="14" y2="10"/>
          </svg>
        </button>
        <button class="popup-btn close-btn" (click)="closePopup()" title="Cerrar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <!-- Estado de carga -->
      <div class="popup-loading" *ngIf="loadingVideo()">
        <div class="spinner"></div>
        <span>Cargando grabación...</span>
      </div>

      <!-- Video -->
      <video *ngIf="currentVideo() && !loadingVideo()"
             class="popup-video"
             controls
             autoplay
             [src]="currentVideo()">
      </video>
    </div>
  `,
  styles: [`
    .recordings-container { color: rgba(var(--ink-rgb), 1); }
    .rec-subtitle { color: var(--muted); font-size: 13px; margin-top: 4px; }

    /* Landing — lista de cámaras */
    .cameras-list { display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px; }
    .cam-card {
      display: flex; align-items: center; gap: 14px;
      padding: 16px 20px; border-radius: 14px;
      background: var(--surface); border: 1px solid var(--outline);
      text-decoration: none; color: rgba(var(--ink-rgb), 1);
      transition: all 0.15s;
      &:hover { border-color: rgba(37,99,235,0.4); background: rgba(37,99,235,0.06); }
    }
    .cam-card-icon { font-size: 24px; flex-shrink: 0; }
    .cam-card-info { flex: 1; display: flex; flex-direction: column; gap: 2px; }
    .cam-card-name { font-size: 14px; font-weight: 600; }
    .cam-card-sub { font-size: 12px; color: var(--muted); }
    .cam-card-arrow { color: var(--muted); font-size: 18px; }
    .empty-state {
      text-align: center; padding: 60px 20px;
      background: var(--surface); border-radius: 16px; border: 1px solid var(--outline);
    }
    .empty-icon { font-size: 48px; opacity: 0.4; margin-bottom: 12px; }
    .empty-title { font-size: 16px; font-weight: 600; margin-bottom: 6px; }

    .rec-topbar { margin-bottom: 24px; }
    .back-link {
      color: var(--accent); text-decoration: none; font-size: 13px; font-weight: 600;
      display: inline-block; margin-bottom: 8px;
      &:hover { text-decoration: underline; }
    }
    h1 { font-family: 'Space Grotesk', sans-serif; font-size: 1.4rem; margin: 0; }
    h3 { font-size: 14px; color: var(--muted); margin: 0 0 12px; }

    .date-selector {
      background: var(--surface); border-radius: 16px;
      padding: 20px; border: 1px solid var(--outline); margin-bottom: 20px;
    }
    .date-chips { display: flex; flex-wrap: wrap; gap: 8px; }
    .date-chip {
      padding: 8px 16px; border-radius: 8px;
      background: rgba(var(--ink-rgb), 0.05); border: 1px solid var(--outline);
      color: var(--muted); font-size: 13px; cursor: pointer; transition: all 0.15s;
      &:hover { background: rgba(var(--ink-rgb), 0.1); }
      &.active { background: rgba(37,99,235,0.25); border-color: #3b82f6; color: #93c5fd; }
    }
    .empty-msg { color: var(--muted); font-size: 13px; }

    /* Lista de grabaciones */
    .rec-list {
      background: var(--surface); border-radius: 16px;
      padding: 20px; border: 1px solid var(--outline); margin-bottom: 20px;
    }
    .rec-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 8px; }
    .rec-item {
      display: flex; align-items: center; gap: 12px;
      padding: 11px 14px; border-radius: 10px;
      background: rgba(var(--ink-rgb), 0.03); border: 1px solid var(--outline);
      cursor: pointer; transition: all 0.15s;
      &:hover { background: rgba(37,99,235,0.08); border-color: rgba(37,99,235,0.3); }
      &.playing {
        background: rgba(37,99,235,0.12);
        border-color: #3b82f6;
      }
    }
    .rec-icon { flex-shrink: 0; color: var(--muted); display: flex; align-items: center; }
    .rec-info { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .rec-name {
      font-size: 13px; font-weight: 600; color: rgba(var(--ink-rgb), 1);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .rec-size { font-size: 11px; color: var(--muted); }
    .rec-play-hint { font-size: 11px; color: var(--muted); flex-shrink: 0; opacity: 0; transition: opacity 0.15s; }
    .rec-item:hover .rec-play-hint { opacity: 1; }
    .rec-now-playing { font-size: 11px; color: #3b82f6; font-weight: 600; flex-shrink: 0; }

    /* ═══ POPUP FLOTANTE ═══ */
    .video-popup {
      position: fixed;
      z-index: 1000;
      width: 660px;
      height: 420px;
      background: #111114;
      border-radius: 14px;
      box-shadow: 0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.08);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transition: border-radius 0.2s, box-shadow 0.2s;

      &.expanded {
        left: 0 !important;
        top: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        border-radius: 0 !important;
        box-shadow: none !important;
      }
    }

    .popup-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      background: rgba(255,255,255,0.05);
      border-bottom: 1px solid rgba(255,255,255,0.07);
      cursor: grab;
      user-select: none;
      flex-shrink: 0;
      &:active { cursor: grabbing; }
      .expanded & { cursor: default; }
    }
    .popup-drag-icon { color: rgba(255,255,255,0.3); flex-shrink: 0; }
    .popup-title {
      flex: 1; color: rgba(255,255,255,0.9); font-size: 12px; font-weight: 600;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .popup-btn {
      background: rgba(255,255,255,0.08); border: none; border-radius: 6px;
      color: rgba(255,255,255,0.7); width: 26px; height: 26px;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; flex-shrink: 0; transition: background 0.15s, color 0.15s;
      &:hover { background: rgba(255,255,255,0.18); color: #fff; }
    }
    .close-btn:hover { background: rgba(239,68,68,0.4) !important; color: #fff !important; }

    .popup-loading {
      flex: 1; display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 14px;
      color: rgba(255,255,255,0.5); font-size: 13px;
    }
    .spinner {
      width: 32px; height: 32px; border-radius: 50%;
      border: 3px solid rgba(255,255,255,0.1);
      border-top-color: #3b82f6;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    .popup-video {
      flex: 1; width: 100%; display: block;
      background: #000; min-height: 0;
      object-fit: contain;
    }
  `]
})
export class ClientRecordingsComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);

  cameraId = signal('');
  cameraName = signal('Cámara');
  availableDates = signal<string[]>([]);
  selectedDate = signal('');
  recordings = signal<any[]>([]);
  currentVideo = signal('');
  loadingDates = signal(true);
  cloudCameras = signal<any[]>([]);
  loadingCameras = signal(true);
  private blobUrl = '';

  // Popup
  popupVisible = signal(false);
  popupExpanded = signal(false);
  loadingVideo = signal(false);
  currentRecordingName = signal('');
  popupX = signal(Math.max(20, Math.floor((window.innerWidth - 660) / 2)));
  popupY = signal(Math.max(20, Math.floor((window.innerHeight - 420) / 2)));

  // Drag
  private isDragging = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  private readonly boundMouseMove = (e: MouseEvent) => this.onMouseMove(e);
  private readonly boundMouseUp   = () => this.onMouseUp();

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id') || '';
    this.cameraId.set(id);

    if (!id) {
      this.http.get<any[]>(`/api/recordings/cameras`).subscribe({
        next: (cams) => { this.cloudCameras.set(cams || []); this.loadingCameras.set(false); },
        error: () => this.loadingCameras.set(false)
      });
      return;
    }

    this.http.get<any[]>(`/api/recordings/cameras`).subscribe({
      next: (cams) => {
        const cam = (cams || []).find((c: any) => String(c.id) === id);
        if (cam) this.cameraName.set(cam.name);
      },
      error: () => {}
    });

    this.http.get<any>(`/api/recordings/cloud/${id}/dates`).subscribe({
      next: (res) => {
        this.availableDates.set(res.dates || []);
        this.loadingDates.set(false);
        if (this.availableDates().length > 0) this.selectDate(this.availableDates()[0]);
      },
      error: () => this.loadingDates.set(false)
    });
  }

  ngOnDestroy() {
    document.removeEventListener('mousemove', this.boundMouseMove);
    document.removeEventListener('mouseup', this.boundMouseUp);
    if (this.blobUrl) URL.revokeObjectURL(this.blobUrl);
  }

  selectDate(date: string) {
    this.selectedDate.set(date);
    this.http.get<any>(`/api/recordings/cloud/${this.cameraId()}?date=${date}`).subscribe({
      next: (res) => this.recordings.set(res.files || []),
      error: () => this.recordings.set([])
    });
  }

  async playRecording(rec: any) {
    this.currentRecordingName.set(rec.filename || rec.startTime || '');
    this.loadingVideo.set(true);
    this.popupVisible.set(true);

    const token = localStorage.getItem('motor_control_token');
    try {
      const response = await fetch(
        `/api/recordings/cloud/video?path=${encodeURIComponent(rec.path)}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (this.blobUrl) URL.revokeObjectURL(this.blobUrl);
      const blob = await response.blob();
      this.blobUrl = URL.createObjectURL(blob);
      this.currentVideo.set(this.blobUrl);
    } catch (e) {
      console.error('Error playing recording:', e);
    } finally {
      this.loadingVideo.set(false);
    }
  }

  closePopup() {
    this.popupVisible.set(false);
    this.popupExpanded.set(false);
    this.currentVideo.set('');
    this.currentRecordingName.set('');
    if (this.blobUrl) { URL.revokeObjectURL(this.blobUrl); this.blobUrl = ''; }
  }

  toggleExpand() {
    this.popupExpanded.update(v => !v);
  }

  // ── Drag ──────────────────────────────────────────
  onDragStart(e: MouseEvent) {
    if (this.popupExpanded()) return;
    e.preventDefault();
    this.isDragging = true;
    this.dragOffsetX = e.clientX - this.popupX();
    this.dragOffsetY = e.clientY - this.popupY();
    document.addEventListener('mousemove', this.boundMouseMove);
    document.addEventListener('mouseup', this.boundMouseUp);
  }

  private onMouseMove(e: MouseEvent) {
    if (!this.isDragging) return;
    const newX = Math.max(0, Math.min(window.innerWidth  - 660, e.clientX - this.dragOffsetX));
    const newY = Math.max(0, Math.min(window.innerHeight -  50, e.clientY - this.dragOffsetY));
    this.popupX.set(newX);
    this.popupY.set(newY);
  }

  private onMouseUp() {
    this.isDragging = false;
    document.removeEventListener('mousemove', this.boundMouseMove);
    document.removeEventListener('mouseup', this.boundMouseUp);
  }
}

