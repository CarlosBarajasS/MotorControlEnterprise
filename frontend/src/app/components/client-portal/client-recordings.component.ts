import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-client-recordings',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="recordings-container">

      <!-- === LANDING: sin ID — lista de cámaras con cloud storage === -->
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
                    (click)="selectDate(d)">
              {{ d }}
            </button>
          </div>
          <p class="empty-msg" *ngIf="availableDates().length === 0">
            {{ loadingDates() ? 'Cargando fechas...' : 'No hay grabaciones disponibles para esta cámara' }}
          </p>
        </div>

        <!-- Recordings List -->
        <div class="rec-list" *ngIf="recordings().length > 0">
          <h3>Grabaciones del {{ selectedDate() }}</h3>
          <div class="rec-grid">
            <div class="rec-item" *ngFor="let rec of recordings()" (click)="playRecording(rec)">
              <div class="rec-icon">🎬</div>
              <div class="rec-info">
                <span class="rec-name">{{ rec.filename || rec.startTime }}</span>
                <span class="rec-size">{{ rec.sizeMb ? (rec.sizeMb | number:'1.1-1') + ' MB' : '' }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Video Player -->
        <div class="video-player" *ngIf="currentVideo()">
          <h3>Reproduciendo</h3>
          <video #videoPlayer controls autoplay [src]="currentVideo()" class="video-el"></video>
        </div>
      </ng-container>

    </div>
  `,
  styles: [`
    .recordings-container { color: rgba(var(--ink-rgb), 1); }
    .rec-subtitle { color: var(--muted); font-size: 13px; margin-top: 4px; }

    /* Camera picker (landing sin ID) */
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
      padding: 20px; border: 1px solid var(--outline);
      margin-bottom: 20px;
    }
    .date-chips { display: flex; flex-wrap: wrap; gap: 8px; }
    .date-chip {
      padding: 8px 16px; border-radius: 8px;
      background: rgba(var(--ink-rgb), 0.05); border: 1px solid var(--outline);
      color: var(--muted); font-size: 13px; cursor: pointer;
      transition: all 0.15s;
      &:hover { background: rgba(var(--ink-rgb), 0.1); }
      &.active { background: rgba(37,99,235,0.25); border-color: #3b82f6; color: #93c5fd; }
    }
    .empty-msg { color: var(--muted); font-size: 13px; }

    .rec-list {
      background: var(--surface); border-radius: 16px;
      padding: 20px; border: 1px solid var(--outline);
      margin-bottom: 20px;
    }
    .rec-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 10px; }
    .rec-item {
      display: flex; align-items: center; gap: 12px;
      padding: 12px 16px; border-radius: 10px;
      background: rgba(var(--ink-rgb), 0.03); border: 1px solid var(--outline);
      cursor: pointer; transition: all 0.15s;
      &:hover { background: rgba(37,99,235,0.1); border-color: rgba(37,99,235,0.3); }
    }
    .rec-icon { font-size: 24px; }
    .rec-info { display: flex; flex-direction: column; gap: 2px; }
    .rec-name { font-size: 13px; font-weight: 600; color: rgba(var(--ink-rgb), 1); }
    .rec-size { font-size: 11px; color: var(--muted); }

    .video-player {
      background: var(--surface); border-radius: 16px;
      padding: 20px; border: 1px solid var(--outline);
      margin-bottom: 20px;
    }
    .video-el {
      width: 100%; border-radius: 12px; background: #000;
      max-height: 500px;
    }
  `]
})
export class ClientRecordingsComponent implements OnInit {
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

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id') || '';
    this.cameraId.set(id);

    if (!id) {
      // Landing: cargar lista de cámaras con cloud storage
      this.http.get<any[]>(`/api/recordings/cameras`).subscribe({
        next: (cams) => { this.cloudCameras.set(cams || []); this.loadingCameras.set(false); },
        error: () => this.loadingCameras.set(false)
      });
      return;
    }

    // Detalle: cargar nombre y fechas de la cámara
    this.http.get<any[]>(`/api/recordings/cameras`).subscribe({
      next: (cams) => {
        const cam = (cams || []).find((c: any) => String(c.id) === id);
        if (cam) this.cameraName.set(cam.name);
      },
      error: () => { }
    });

    this.http.get<any>(`/api/recordings/cloud/${id}/dates`).subscribe({
      next: (res) => {
        this.availableDates.set(res.dates || []);
        this.loadingDates.set(false);
        if (this.availableDates().length > 0) {
          this.selectDate(this.availableDates()[0]);
        }
      },
      error: () => this.loadingDates.set(false)
    });
  }

  selectDate(date: string) {
    this.selectedDate.set(date);
    this.http.get<any>(`/api/recordings/cloud/${this.cameraId()}?date=${date}`).subscribe({
      next: (res) => this.recordings.set(res.files || []),
      error: () => this.recordings.set([])
    });
  }

  async playRecording(rec: any) {
    const token = localStorage.getItem('motor_control_token');
    try {
      const response = await fetch(`/api/recordings/cloud/video?path=${encodeURIComponent(rec.path)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (this.blobUrl) URL.revokeObjectURL(this.blobUrl);
      const blob = await response.blob();
      this.blobUrl = URL.createObjectURL(blob);
      this.currentVideo.set(this.blobUrl);
    } catch (e) {
      console.error('Error playing recording:', e);
    }
  }

}

