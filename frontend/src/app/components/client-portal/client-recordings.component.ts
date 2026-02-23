import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';

@Component({
    selector: 'app-client-recordings',
    standalone: true,
    imports: [CommonModule, RouterModule, DatePipe],
    template: `
    <div class="recordings-container">
      <div class="rec-topbar">
        <div>
          <a routerLink="/client/cameras" class="back-link">← Volver a Cámaras</a>
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
              <span class="rec-name">{{ rec.name || rec.startTime }}</span>
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

      <!-- SD Card Recordings -->
      <div class="sd-section">
        <h3>Grabaciones en SD Card (Dispositivo Local)</h3>
        <div class="sd-list" *ngIf="sdRecordings().length > 0">
          <div class="rec-item" *ngFor="let rec of sdRecordings()" (click)="playSdRecording(rec)">
            <div class="rec-icon">💾</div>
            <div class="rec-info">
              <span class="rec-name">{{ rec.name }}</span>
              <span class="rec-size">{{ rec.duration || '' }}</span>
            </div>
          </div>
        </div>
        <p class="empty-msg" *ngIf="sdRecordings().length === 0">Sin grabaciones locales disponibles</p>
      </div>
    </div>
  `,
    styles: [`
    .recordings-container { color: #f1f5f9; }
    .rec-topbar { margin-bottom: 24px; }
    .back-link {
      color: #93c5fd; text-decoration: none; font-size: 13px; font-weight: 600;
      display: inline-block; margin-bottom: 8px;
      &:hover { text-decoration: underline; }
    }
    h1 { font-family: 'Space Grotesk', sans-serif; font-size: 1.4rem; margin: 0; }
    h3 { font-size: 14px; color: rgba(248,250,252,0.6); margin: 0 0 12px; }

    .date-selector {
      background: rgba(15,23,42,0.6); border-radius: 16px;
      padding: 20px; border: 1px solid rgba(255,255,255,0.06);
      margin-bottom: 20px;
    }
    .date-chips { display: flex; flex-wrap: wrap; gap: 8px; }
    .date-chip {
      padding: 8px 16px; border-radius: 8px;
      background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
      color: rgba(248,250,252,0.7); font-size: 13px; cursor: pointer;
      transition: all 0.15s;
      &:hover { background: rgba(255,255,255,0.1); }
      &.active { background: rgba(37,99,235,0.25); border-color: #3b82f6; color: #93c5fd; }
    }
    .empty-msg { color: rgba(248,250,252,0.4); font-size: 13px; }

    .rec-list, .sd-section {
      background: rgba(15,23,42,0.6); border-radius: 16px;
      padding: 20px; border: 1px solid rgba(255,255,255,0.06);
      margin-bottom: 20px;
    }
    .rec-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 10px; }
    .rec-item {
      display: flex; align-items: center; gap: 12px;
      padding: 12px 16px; border-radius: 10px;
      background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);
      cursor: pointer; transition: all 0.15s;
      &:hover { background: rgba(37,99,235,0.1); border-color: rgba(37,99,235,0.3); }
    }
    .rec-icon { font-size: 24px; }
    .rec-info { display: flex; flex-direction: column; gap: 2px; }
    .rec-name { font-size: 13px; font-weight: 600; color: #f1f5f9; }
    .rec-size { font-size: 11px; color: rgba(248,250,252,0.4); }

    .video-player {
      background: rgba(15,23,42,0.6); border-radius: 16px;
      padding: 20px; border: 1px solid rgba(255,255,255,0.06);
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
    sdRecordings = signal<any[]>([]);
    currentVideo = signal('');
    loadingDates = signal(true);
    private blobUrl = '';

    ngOnInit() {
        const id = this.route.snapshot.paramMap.get('id') || '';
        this.cameraId.set(id);

        // Load camera name
        this.http.get<any>(`/api/cameras/${id}`).subscribe({
            next: (cam) => this.cameraName.set(cam.name || 'Cámara'),
            error: () => { }
        });

        // Load cloud dates
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

        // Load SD recordings
        this.http.get<any>(`/api/recordings/sd/${id}`).subscribe({
            next: (res) => this.sdRecordings.set(Array.isArray(res) ? res : (res.files || [])),
            error: () => { }
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

    playSdRecording(rec: any) {
        // SD recordings are served directly
        this.currentVideo.set(`/api/recordings/sd/video?path=${encodeURIComponent(rec.path || rec.filename)}`);
    }
}
