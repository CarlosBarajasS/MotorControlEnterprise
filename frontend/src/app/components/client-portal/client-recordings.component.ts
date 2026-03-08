import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-client-recordings',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="recordings-container">

      <!-- === LANDING === -->
      <ng-container *ngIf="!cameraId()">
        <div class="rec-topbar">
          <h1>Grabaciones en Nube</h1>
          <p class="rec-subtitle">Selecciona una cámara para ver sus grabaciones almacenadas</p>
        </div>
        <div class="cameras-list" *ngIf="cloudCameras().length > 0">
          <a class="cam-card" *ngFor="let c of cloudCameras()" [routerLink]="['/client/recordings', c.id]">
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

      <!-- === DETALLE === -->
      <ng-container *ngIf="cameraId()">
        <div class="rec-topbar">
          <div>
            <a routerLink="/client/recordings" class="back-link">← Volver a Grabaciones</a>
            <h1>Grabaciones — {{ cameraName() }}</h1>
          </div>
        </div>

        <div class="date-selector">
          <h3>Fechas Disponibles</h3>
          <div class="date-chips" *ngIf="availableDates().length > 0">
            <button class="date-chip" *ngFor="let d of availableDates()"
                    [class.active]="selectedDate() === d" (click)="selectDate(d)">{{ d }}</button>
          </div>
          <p class="empty-msg" *ngIf="availableDates().length === 0">
            {{ loadingDates() ? 'Cargando fechas...' : 'No hay grabaciones disponibles para esta cámara' }}
          </p>
        </div>

        <div class="rec-list" *ngIf="recordings().length > 0">
          <h3>{{ recordings().length }} segmentos — {{ selectedDate() }}</h3>
          <div class="rec-grid">
            <div class="rec-item" *ngFor="let rec of recordings()"
                 [class.playing]="currentRecordingName() === rec.filename"
                 (click)="playRecording(rec)">
              <div class="rec-icon">
                <svg *ngIf="currentRecordingName() !== rec.filename" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                <svg *ngIf="currentRecordingName() === rec.filename" width="18" height="18" viewBox="0 0 24 24" fill="#3b82f6" stroke="none"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
              </div>
              <div class="rec-info">
                <span class="rec-name">{{ formatSegmentTime(rec.filename) }}</span>
                <span class="rec-size">{{ rec.sizeMb ? (rec.sizeMb | number:'1.1-1') + ' MB' : '15 min' }}</span>
              </div>
              <span class="rec-now-playing" *ngIf="currentRecordingName() === rec.filename">● reproduciendo</span>
            </div>
          </div>
        </div>
      </ng-container>
    </div>

    <!-- ═══════════════════════ FLOATING VIDEO POPUP ═══════════════════════ -->
    <div class="video-popup" *ngIf="popupVisible()"
         [class.expanded]="popupExpanded()"
         [style.left.px]="popupX()"
         [style.top.px]="popupY()">

      <!-- Header / drag handle -->
      <div class="popup-header" (mousedown)="onDragStart($event)">
        <svg class="drag-dots" width="12" height="18" viewBox="0 0 12 18" fill="currentColor">
          <circle cx="3" cy="3" r="1.5"/><circle cx="9" cy="3" r="1.5"/>
          <circle cx="3" cy="9" r="1.5"/><circle cx="9" cy="9" r="1.5"/>
          <circle cx="3" cy="15" r="1.5"/><circle cx="9" cy="15" r="1.5"/>
        </svg>
        <div class="popup-title-block">
          <span class="popup-cam">{{ cameraName() }}</span>
          <span class="popup-seg">{{ formatSegmentTime(currentRecordingName()) }}</span>
        </div>
        <button class="popup-btn" (click)="toggleExpand()" [title]="popupExpanded() ? 'Modo ventana' : 'Pantalla completa'">
          <svg *ngIf="!popupExpanded()" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
            <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
            <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
          </svg>
          <svg *ngIf="popupExpanded()" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
            <polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/>
            <line x1="10" y1="14" x2="3" y2="21"/><line x1="21" y1="3" x2="14" y2="10"/>
          </svg>
        </button>
        <button class="popup-btn close-btn" (click)="closePopup()" title="Cerrar">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <!-- Loading -->
      <div class="popup-loading" *ngIf="loadingVideo()">
        <div class="spinner"></div>
        <span>Iniciando reproducción...</span>
      </div>

      <!-- Video -->
      <video *ngIf="currentVideo()"
             class="popup-video"
             [class.hidden]="loadingVideo()"
             controls autoplay
             [src]="currentVideo()"
             (loadeddata)="onVideoLoaded()"
             (error)="loadingVideo.set(false)"
             (timeupdate)="onTimeUpdate($event)"
             (ended)="onVideoEnded()">
      </video>

      <!-- ── Timeline ── -->
      <div class="popup-timeline" *ngIf="recordings().length > 0">
        <div class="tl-track" (click)="onTimelineClick($event)">
          <!-- Segmentos -->
          <div class="tl-seg" *ngFor="let rec of recordings()"
               [class.tl-played]="isSegmentPast(rec)"
               [class.tl-active]="currentRecordingName() === rec.filename"
               [style.left.%]="segmentLeftPct(rec)"
               [style.width.%]="segmentWidthPct()"
               [title]="formatSegmentTime(rec.filename)">
          </div>
          <!-- Playhead -->
          <div class="tl-playhead" [style.left.%]="playheadPct()" *ngIf="currentVideo()"></div>
        </div>
        <div class="tl-labels">
          <span class="tl-label" *ngFor="let lbl of timelineLabels()"
                [style.left.%]="lbl.pct">{{ lbl.text }}</span>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .recordings-container { color: rgba(var(--ink-rgb), 1); }
    .rec-subtitle { color: var(--muted); font-size: 13px; margin-top: 4px; }

    .cameras-list { display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px; }
    .cam-card {
      display: flex; align-items: center; gap: 14px; padding: 16px 20px; border-radius: 14px;
      background: var(--surface); border: 1px solid var(--outline);
      text-decoration: none; color: rgba(var(--ink-rgb), 1); transition: all 0.15s;
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

    .rec-list { background: var(--surface); border-radius: 16px; padding: 20px; border: 1px solid var(--outline); margin-bottom: 20px; }
    .rec-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 7px; }
    .rec-item {
      display: flex; align-items: center; gap: 10px; padding: 10px 13px; border-radius: 9px;
      background: rgba(var(--ink-rgb), 0.03); border: 1px solid var(--outline);
      cursor: pointer; transition: all 0.12s;
      &:hover { background: rgba(37,99,235,0.08); border-color: rgba(37,99,235,0.3); }
      &.playing { background: rgba(37,99,235,0.12); border-color: #3b82f6; }
    }
    .rec-icon { flex-shrink: 0; color: var(--muted); display: flex; align-items: center; }
    .rec-info { flex: 1; display: flex; flex-direction: column; gap: 1px; min-width: 0; }
    .rec-name { font-size: 13px; font-weight: 600; color: rgba(var(--ink-rgb), 1); }
    .rec-size { font-size: 11px; color: var(--muted); }
    .rec-now-playing { font-size: 10px; color: #3b82f6; font-weight: 700; flex-shrink: 0; letter-spacing: 0.02em; }

    /* ═══ POPUP ═══ */
    .video-popup {
      position: fixed; z-index: 1000;
      width: 680px; height: 480px;
      background: #0e0e11;
      border-radius: 14px;
      box-shadow: 0 28px 80px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.09);
      display: flex; flex-direction: column; overflow: hidden;
      &.expanded {
        left: 0 !important; top: 0 !important;
        width: 100vw !important; height: 100vh !important;
        border-radius: 0 !important; box-shadow: none !important;
      }
    }

    .popup-header {
      display: flex; align-items: center; gap: 9px;
      padding: 9px 12px; flex-shrink: 0;
      background: rgba(255,255,255,0.04);
      border-bottom: 1px solid rgba(255,255,255,0.07);
      cursor: grab; user-select: none;
      &:active { cursor: grabbing; }
      .expanded & { cursor: default; }
    }
    .drag-dots { color: rgba(255,255,255,0.22); flex-shrink: 0; }
    .popup-title-block { flex: 1; display: flex; flex-direction: column; gap: 1px; min-width: 0; }
    .popup-cam { font-size: 11px; color: rgba(255,255,255,0.45); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .popup-seg { font-size: 13px; font-weight: 700; color: rgba(255,255,255,0.92); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .popup-btn {
      background: rgba(255,255,255,0.07); border: none; border-radius: 6px;
      color: rgba(255,255,255,0.65); width: 26px; height: 26px;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; flex-shrink: 0; transition: background 0.12s, color 0.12s;
      &:hover { background: rgba(255,255,255,0.16); color: #fff; }
    }
    .close-btn:hover { background: rgba(239,68,68,0.5) !important; color: #fff !important; }

    .popup-loading {
      flex: 1; display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 14px;
      color: rgba(255,255,255,0.4); font-size: 13px;
    }
    .spinner {
      width: 30px; height: 30px; border-radius: 50%;
      border: 3px solid rgba(255,255,255,0.08); border-top-color: #3b82f6;
      animation: spin 0.75s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    .popup-video {
      flex: 1; width: 100%; display: block;
      background: #000; min-height: 0; object-fit: contain;
      &.hidden { opacity: 0; position: absolute; pointer-events: none; }
    }

    /* ── Timeline ── */
    .popup-timeline {
      flex-shrink: 0; padding: 10px 14px 8px;
      background: rgba(0,0,0,0.35);
      border-top: 1px solid rgba(255,255,255,0.06);
    }
    .tl-track {
      position: relative; height: 22px;
      background: rgba(255,255,255,0.06); border-radius: 4px;
      cursor: pointer; overflow: visible;
      &:hover { background: rgba(255,255,255,0.09); }
    }
    .tl-seg {
      position: absolute; top: 2px; bottom: 2px;
      background: rgba(59,130,246,0.35); border-radius: 2px;
      transition: background 0.15s;
      border-right: 1px solid rgba(0,0,0,0.4);
      &.tl-played { background: rgba(59,130,246,0.2); }
      &.tl-active { background: #3b82f6 !important; box-shadow: 0 0 6px rgba(59,130,246,0.6); }
      &:hover { background: rgba(99,153,255,0.55); }
    }
    .tl-playhead {
      position: absolute; top: -3px; bottom: -3px;
      width: 2px; background: #fff;
      border-radius: 1px;
      box-shadow: 0 0 4px rgba(255,255,255,0.6);
      pointer-events: none;
      transform: translateX(-50%);
      transition: left 0.5s linear;
    }
    .tl-labels {
      position: relative; height: 16px; margin-top: 3px;
    }
    .tl-label {
      position: absolute; transform: translateX(-50%);
      font-size: 9px; color: rgba(255,255,255,0.3);
      white-space: nowrap; pointer-events: none;
    }
  `]
})
export class ClientRecordingsComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);

  cameraId      = signal('');
  cameraName    = signal('Cámara');
  availableDates = signal<string[]>([]);
  selectedDate   = signal('');
  recordings     = signal<any[]>([]);
  loadingDates   = signal(true);
  cloudCameras   = signal<any[]>([]);
  loadingCameras = signal(true);

  // Popup / player
  popupVisible         = signal(false);
  popupExpanded        = signal(false);
  loadingVideo         = signal(false);
  currentVideo         = signal('');
  currentRecordingName = signal('');
  videoCurrentTime     = signal(0);  // seconds within current segment

  // Popup position
  popupX = signal(Math.max(20, Math.floor((window.innerWidth  - 680) / 2)));
  popupY = signal(Math.max(20, Math.floor((window.innerHeight - 480) / 2)));

  // Internal
  private pendingSeek: number | null = null;   // seconds to seek after loadeddata

  // Drag
  private isDragging  = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  private readonly boundMouseMove = (e: MouseEvent) => this.onMouseMove(e);
  private readonly boundMouseUp   = () => this.onMouseUp();

  // ── Timeline computed helpers ──────────────────────────────────
  private readonly SEG_DURATION = 900; // 15 min in seconds

  private tlRange = computed(() => {
    const recs = this.recordings();
    if (!recs.length) return { start: 0, span: this.SEG_DURATION };
    const start = this.filenameToSeconds(recs[0].filename);
    const last  = this.filenameToSeconds(recs[recs.length - 1].filename);
    return { start, span: Math.max(last - start + this.SEG_DURATION, this.SEG_DURATION) };
  });

  segmentLeftPct  = (rec: any) => {
    const { start, span } = this.tlRange();
    return ((this.filenameToSeconds(rec.filename) - start) / span) * 100;
  };
  segmentWidthPct = () => (this.SEG_DURATION / this.tlRange().span) * 100;

  isSegmentPast = (rec: any) => {
    const cur = this.currentRecordingName();
    if (!cur) return false;
    return this.filenameToSeconds(rec.filename) < this.filenameToSeconds(cur);
  };

  playheadPct = computed(() => {
    const cur = this.currentRecordingName();
    if (!cur) return 0;
    const { start, span } = this.tlRange();
    const absSec = this.filenameToSeconds(cur) + this.videoCurrentTime();
    return Math.min(((absSec - start) / span) * 100, 100);
  });

  timelineLabels = computed(() => {
    const { start, span } = this.tlRange();
    const end = start + span;
    const labels: { text: string; pct: number }[] = [];
    // Show a label roughly every 1 hour, max ~8 labels
    const stepSec = Math.ceil(span / (7 * 3600)) * 3600;
    const firstH  = Math.ceil(start / stepSec) * stepSec;
    for (let t = firstH; t <= end; t += stepSec) {
      const h = Math.floor(t / 3600);
      const m = Math.floor((t % 3600) / 60);
      labels.push({
        text: `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`,
        pct:  ((t - start) / span) * 100
      });
    }
    return labels;
  });

  // ── Lifecycle ─────────────────────────────────────────────────
  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id') || '';
    this.cameraId.set(id);

    if (!id) {
      this.http.get<any[]>('/api/recordings/cameras').subscribe({
        next: (c) => { this.cloudCameras.set(c || []); this.loadingCameras.set(false); },
        error: () => this.loadingCameras.set(false)
      });
      return;
    }

    this.http.get<any[]>('/api/recordings/cameras').subscribe({
      next: (c) => {
        const cam = (c || []).find((x: any) => String(x.id) === id);
        if (cam) this.cameraName.set(cam.name);
      }
    });

    this.http.get<any>(`/api/recordings/cloud/${id}/dates`).subscribe({
      next: (res) => {
        this.availableDates.set(res.dates || []);
        this.loadingDates.set(false);
        if (this.availableDates().length) this.selectDate(this.availableDates()[0]);
      },
      error: () => this.loadingDates.set(false)
    });
  }

  ngOnDestroy() {
    document.removeEventListener('mousemove', this.boundMouseMove);
    document.removeEventListener('mouseup',   this.boundMouseUp);
  }

  selectDate(date: string) {
    this.selectedDate.set(date);
    this.http.get<any>(`/api/recordings/cloud/${this.cameraId()}?date=${date}`).subscribe({
      next: (res) => this.recordings.set(res.files || []),
      error: () => this.recordings.set([])
    });
  }

  // ── Playback ──────────────────────────────────────────────────
  playRecording(rec: any, seekToSec?: number) {
    this.currentVideo.set('');
    this.currentRecordingName.set(rec.filename || rec.startTime || '');
    this.videoCurrentTime.set(0);
    this.loadingVideo.set(true);
    this.popupVisible.set(true);
    this.pendingSeek = seekToSec ?? null;

    const token = localStorage.getItem('motor_control_token') ?? '';
    const url = `/api/recordings/cloud/video?path=${encodeURIComponent(rec.path)}`
              + (token ? `&token=${encodeURIComponent(token)}` : '');
    this.currentVideo.set(url);
  }

  onVideoLoaded() {
    this.loadingVideo.set(false);
  }

  // ── Video events ──────────────────────────────────────────────
  onTimeUpdate(e: Event) {
    const v = e.target as HTMLVideoElement;
    this.videoCurrentTime.set(v.currentTime);
    // Apply pending seek after video is ready
    if (this.pendingSeek !== null && v.duration > 0) {
      v.currentTime = Math.min(this.pendingSeek, v.duration - 1);
      this.pendingSeek = null;
    }
  }

  onVideoEnded() {
    const list = this.recordings();
    const idx  = list.findIndex(r => r.filename === this.currentRecordingName());
    if (idx >= 0 && idx < list.length - 1) this.playRecording(list[idx + 1]);
  }

  // ── Timeline click ────────────────────────────────────────────
  onTimelineClick(e: MouseEvent) {
    const track = e.currentTarget as HTMLElement;
    const ratio  = (e.clientX - track.getBoundingClientRect().left) / track.offsetWidth;
    const { start, span } = this.tlRange();
    const clickedSec = start + ratio * span;

    // Find the segment that contains this second
    const recs = this.recordings();
    let target = recs[0];
    for (const rec of recs) {
      if (this.filenameToSeconds(rec.filename) <= clickedSec) target = rec;
      else break;
    }
    if (!target) return;
    const offsetInSeg = clickedSec - this.filenameToSeconds(target.filename);
    this.playRecording(target, Math.max(0, offsetInSeg));
  }

  // ── Popup controls ────────────────────────────────────────────
  closePopup() {
    this.currentVideo.set('');
    this.loadingVideo.set(false);
    this.popupVisible.set(false);
    this.popupExpanded.set(false);
    this.currentRecordingName.set('');
    this.videoCurrentTime.set(0);
  }

  toggleExpand() { this.popupExpanded.update(v => !v); }

  // ── Drag ──────────────────────────────────────────────────────
  onDragStart(e: MouseEvent) {
    if (this.popupExpanded()) return;
    e.preventDefault();
    this.isDragging  = true;
    this.dragOffsetX = e.clientX - this.popupX();
    this.dragOffsetY = e.clientY - this.popupY();
    document.addEventListener('mousemove', this.boundMouseMove);
    document.addEventListener('mouseup',   this.boundMouseUp);
  }

  private onMouseMove(e: MouseEvent) {
    if (!this.isDragging) return;
    this.popupX.set(Math.max(0, Math.min(window.innerWidth  - 680, e.clientX - this.dragOffsetX)));
    this.popupY.set(Math.max(0, Math.min(window.innerHeight -  50, e.clientY - this.dragOffsetY)));
  }

  private onMouseUp() {
    this.isDragging = false;
    document.removeEventListener('mousemove', this.boundMouseMove);
    document.removeEventListener('mouseup',   this.boundMouseUp);
  }

  // ── Helpers ───────────────────────────────────────────────────
  filenameToSeconds(filename: string): number {
    const m = (filename || '').match(/^(\d{2})-(\d{2})-(\d{2})/);
    return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0;
  }

  formatSegmentTime(filename: string): string {
    const m = (filename || '').match(/^(\d{2})-(\d{2})-(\d{2})/);
    if (!m) return filename || '';
    const hh = m[1], mm = m[2];
    const endMin = (+m[2] + 15) % 60;
    const endH   = +m[1] + Math.floor((+m[2] + 15) / 60);
    return `${hh}:${mm} – ${String(endH).padStart(2,'0')}:${String(endMin).padStart(2,'0')}`;
  }
}

