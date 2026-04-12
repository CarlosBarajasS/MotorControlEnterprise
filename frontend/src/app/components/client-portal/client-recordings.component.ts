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
          <div class="rec-pills" *ngIf="cloudCameras().length > 0">
            <span class="rec-pill">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M15 10l4.553-2.069A1 1 0 0 1 21 8.82v6.36a1 1 0 0 1-1.447.89L15 14"/>
                <rect x="1" y="6" width="14" height="12" rx="2"/>
              </svg>
              {{ cloudCameras().length }} canales
            </span>
            <span class="rec-pill rec-pill--active">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>
              </svg>
              Cloud activo
            </span>
          </div>
        </div>

        <div class="cameras-grid" *ngIf="cloudCameras().length > 0">
          <a class="cam-card" *ngFor="let c of cloudCameras()" [routerLink]="['/client/recordings', c.id]">
            <div class="cam-card-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <path d="M15 10l4.553-2.069A1 1 0 0 1 21 8.82v6.36a1 1 0 0 1-1.447.89L15 14"/>
                <rect x="1" y="6" width="14" height="12" rx="2"/>
              </svg>
            </div>
            <div class="cam-card-info">
              <span class="cam-card-name">{{ c.name }}</span>
              <span class="cam-card-sub">Almacenamiento cloud activo</span>
            </div>
            <span class="cam-card-cta">Ver grabaciones</span>
          </a>
        </div>

        <div class="empty-state" *ngIf="!loadingCameras() && cloudCameras().length === 0">
          <div class="empty-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <p class="empty-title">Sin grabaciones en nube</p>
          <p class="empty-msg">Ninguna de tus cámaras tiene almacenamiento cloud configurado actualmente.</p>
        </div>
        <p class="empty-msg" *ngIf="loadingCameras()">Cargando cámaras...</p>
      </ng-container>

      <!-- === DETALLE === -->
      <ng-container *ngIf="cameraId()">
        <div class="rec-header">
          <a routerLink="/client/recordings" class="back-link">← Grabaciones</a>
          <div class="rec-header-main">
            <h1>{{ cameraName() }}</h1>
            <div class="rec-header-badges">
              <span class="rec-badge" *ngIf="recordings().length > 0">{{ recordings().length }} segmentos</span>
              <span class="rec-badge" *ngIf="selectedDate()">{{ selectedDate() }}</span>
            </div>
          </div>
        </div>

        <!-- Date tabs -->
        <div class="date-tabs" *ngIf="availableDates().length > 0">
          <button class="date-tab" *ngFor="let d of availableDates()"
                  [class.active]="selectedDate() === d" (click)="selectDate(d)">
            <span class="date-tab-day">{{ d.split('-')[2] }}</span>
            <span class="date-tab-month">{{ monthLabel(d) }}</span>
          </button>
        </div>
        <p class="empty-msg" *ngIf="availableDates().length === 0">
          {{ loadingDates() ? 'Cargando fechas...' : 'No hay grabaciones disponibles para esta cámara' }}
        </p>

        <!-- Segments list -->
        <div class="seg-list" *ngIf="recordings().length > 0">
          <div class="seg-item" *ngFor="let rec of recordings(); let i = index"
               [class.playing]="currentRecordingName() === rec.filename"
               (click)="playRecording(rec)">
            <div class="seg-index">{{ i + 1 }}</div>
            <div class="seg-time-block">
              <span class="seg-time">{{ formatSegmentTime(rec.filename) }}</span>
              <div class="seg-bar">
                <div class="seg-bar-fill" [class.playing]="currentRecordingName() === rec.filename"></div>
              </div>
            </div>
            <div class="seg-meta">{{ rec.sizeMb ? (rec.sizeMb | number:'1.1-1') + ' MB' : '—' }}</div>
            <button class="seg-play-btn" (click)="$event.stopPropagation(); playRecording(rec)">
              <svg *ngIf="currentRecordingName() !== rec.filename" width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              <svg *ngIf="currentRecordingName() === rec.filename" width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
            </button>
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
             controls autoplay playsinline
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

    /* ── Landing header ── */
    .rec-topbar { margin-bottom: 24px; }
    h1 { font-family: 'Space Grotesk', sans-serif; font-size: 1.5rem; font-weight: 700; margin: 0 0 4px; }
    .rec-subtitle { color: var(--muted); font-size: 13px; margin: 0 0 14px; }

    .rec-pills { display: flex; flex-wrap: wrap; gap: 8px; }
    .rec-pill {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 5px 14px; border-radius: 20px;
      background: var(--surface); border: 1px solid var(--outline);
      font-size: 12px; font-weight: 600; color: var(--muted);
      svg { opacity: 0.7; }
    }
    .rec-pill--active {
      background: rgba(var(--green-rgb), 0.08);
      border-color: rgba(var(--green-rgb), 0.3);
      color: var(--green);
      svg { opacity: 1; }
    }

    /* ── Camera grid (landing) ── */
    .cameras-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
      margin-bottom: 24px;
    }
    .cam-card {
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: center;
      gap: 16px;
      padding: 18px 20px;
      border-radius: 14px;
      background: var(--surface);
      border: 1px solid var(--outline);
      border-top: 3px solid var(--accent);
      text-decoration: none;
      color: rgba(var(--ink-rgb), 1);
      transition: all 0.18s;
    }
    .cam-card:hover {
      border-color: var(--accent);
      background: rgba(var(--accent-rgb), 0.04);
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(0,0,0,0.08);
    }
    .cam-card-icon {
      width: 42px; height: 42px;
      background: rgba(var(--accent-rgb), 0.1);
      border-radius: 10px;
      color: var(--accent);
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .cam-card-info { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
    .cam-card-name { font-size: 14px; font-weight: 700; color: rgba(var(--ink-rgb), 1); }
    .cam-card-sub  { font-size: 12px; color: var(--muted); }
    .cam-card-cta  {
      padding: 5px 13px; border-radius: 20px; flex-shrink: 0;
      background: rgba(var(--accent-rgb), 0.12);
      border: 1px solid rgba(var(--accent-rgb), 0.25);
      color: var(--accent); font-size: 11px; font-weight: 600;
    }

    /* ── Empty state ── */
    .empty-state {
      text-align: center; padding: 60px 20px;
      background: var(--surface); border-radius: 16px; border: 1px solid var(--outline);
    }
    .empty-icon { color: var(--muted); opacity: 0.35; margin-bottom: 16px; display: block; }
    .empty-title { font-size: 16px; font-weight: 600; margin: 0 0 6px; }
    .empty-msg { color: var(--muted); font-size: 13px; margin: 0; }

    /* ── Detail header ── */
    .rec-header { margin-bottom: 24px; }
    .back-link {
      color: var(--accent); text-decoration: none; font-size: 13px; font-weight: 600;
      display: inline-block; margin-bottom: 10px;
      &:hover { text-decoration: underline; }
    }
    .rec-header-main { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
    .rec-header-main h1 { font-size: 1.6rem; font-weight: 700; margin: 0; }
    .rec-header-badges { display: flex; gap: 8px; flex-wrap: wrap; }
    .rec-badge {
      padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600;
      background: var(--surface); border: 1px solid var(--outline); color: var(--muted);
    }

    /* ── Date tabs ── */
    .date-tabs { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 20px; }
    .date-tab {
      display: flex; flex-direction: column; align-items: center;
      padding: 10px 16px; border-radius: 10px; min-width: 58px;
      background: var(--surface); border: 1px solid var(--outline);
      cursor: pointer; transition: all 0.15s; gap: 2px;
    }
    .date-tab:hover { border-color: rgba(var(--accent-rgb), 0.4); background: rgba(var(--accent-rgb), 0.04); }
    .date-tab.active { background: var(--accent); border-color: var(--accent); }
    .date-tab-day {
      font-size: 20px; font-weight: 700; color: rgba(var(--ink-rgb), 0.85); line-height: 1;
    }
    .date-tab-month {
      font-size: 9px; font-weight: 600; letter-spacing: 0.07em; color: var(--muted); text-transform: uppercase;
    }
    .date-tab.active .date-tab-day,
    .date-tab.active .date-tab-month { color: #fff; }

    /* ── Segments list ── */
    .seg-list { display: flex; flex-direction: column; gap: 4px; margin-bottom: 20px; }
    .seg-item {
      display: grid;
      grid-template-columns: 28px 1fr auto 36px;
      align-items: center; gap: 12px;
      padding: 11px 16px; border-radius: 10px;
      background: var(--surface); border: 1px solid var(--outline);
      cursor: pointer; transition: all 0.12s;
    }
    .seg-item:hover { border-color: rgba(var(--accent-rgb), 0.4); background: rgba(var(--accent-rgb), 0.04); }
    .seg-item.playing { border-color: var(--accent); background: rgba(var(--accent-rgb), 0.07); }

    .seg-index { font-size: 11px; font-weight: 700; color: var(--muted); text-align: center; }

    .seg-time-block { min-width: 0; }
    .seg-time { font-size: 13px; font-weight: 600; color: rgba(var(--ink-rgb), 1); display: block; margin-bottom: 5px; }
    .seg-bar { height: 3px; border-radius: 2px; background: rgba(var(--ink-rgb), 0.08); overflow: hidden; }
    .seg-bar-fill { height: 100%; width: 0; border-radius: 2px; background: var(--accent); transition: width 0.3s; }
    .seg-bar-fill.playing { width: 45%; }

    .seg-meta { font-size: 11px; color: var(--muted); text-align: right; white-space: nowrap; }

    .seg-play-btn {
      width: 32px; height: 32px; border-radius: 50%; flex-shrink: 0;
      background: rgba(var(--accent-rgb), 0.1);
      border: 1px solid rgba(var(--accent-rgb), 0.2);
      color: var(--accent);
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; transition: all 0.15s;
    }
    .seg-play-btn:hover,
    .seg-item.playing .seg-play-btn { background: var(--accent); color: #fff; border-color: var(--accent); }

    /* ═══ POPUP ═══ */
    .video-popup {
      position: fixed; z-index: 1000;
      width: 680px; height: 480px;
      max-width: calc(100vw - 16px);
      max-height: calc(100vh - 40px);
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

    @media (max-width: 600px) {
      .cameras-grid { grid-template-columns: 1fr; }
      .cam-card-cta { display: none; }
      .seg-item { grid-template-columns: 24px 1fr auto 32px; gap: 8px; padding: 10px 12px; }
    }

    @media (max-width: 720px) {
      .video-popup {
        left: 8px !important;
        right: 8px !important;
        top: auto !important;
        bottom: 0 !important;
        width: calc(100vw - 16px) !important;
        height: auto !important;
        max-height: 85vh !important;
        border-radius: 16px 16px 0 0 !important;
      }
      .popup-header {
        cursor: default !important;
      }
    }
    @media (max-width: 480px) {
      .rec-grid { grid-template-columns: 1fr; }
      .rec-list { padding: 14px; }
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
  popupX = signal(Math.max(8, Math.floor((window.innerWidth  - 680) / 2)));
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
    if (window.innerWidth <= 720) return;
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
  monthLabel(dateStr: string): string {
    const months = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
    const m = (dateStr || '').match(/^\d{4}-(\d{2})-/);
    return m ? (months[+m[1] - 1] ?? '') : '';
  }

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

