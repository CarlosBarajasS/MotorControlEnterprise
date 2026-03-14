import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule, DecimalPipe, DatePipe } from '@angular/common';
import { ActivatedRoute, RouterModule, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';

const API_URL = '/api';

@Component({
    selector: 'app-recordings',
    standalone: true,
    imports: [CommonModule, RouterModule, FormsModule, DecimalPipe, DatePipe],
    templateUrl: './recordings.component.html',
    styleUrls: ['./recordings.component.scss']
})
export class RecordingsComponent implements OnInit, OnDestroy {

    route = inject(ActivatedRoute);
    router = inject(Router);
    http = inject(HttpClient);

    cameraId = signal<string>('');
    recordingCameras = signal<any[]>([]);
    cameraName = computed(() => {
        const id = this.cameraId();
        const cam = this.recordingCameras().find(c => String(c.id) === id);
        return cam ? cam.name : (id ? `Cámara #${id}` : 'Seleccionar Cámara');
    });

    // Cloud recordings
    availableDates = signal<string[]>([]);
    cloudRecordings = signal<any[]>([]);
    selectedDate = signal<string>('');
    loadingRecordings = signal<boolean>(false);

    // Filters
    searchRec = signal('');
    filterType = signal<'all' | 'cloud'>('all');

    filteredRecordings = computed(() => {
        let recs = this.cloudRecordings();
        const q = this.searchRec().toLowerCase();
        if (q) recs = recs.filter(r => (r.filename || r.name || '').toLowerCase().includes(q));
        return recs;
    });

    nasStats = signal<{ totalMb: number; capacityMb: number }>({ totalMb: 0, capacityMb: 0 });

    totalSizeMb = computed(() => this.nasStats().totalMb);

    cloudPct = computed(() => {
        const { totalMb, capacityMb } = this.nasStats();
        if (capacityMb > 0) return Math.min((totalMb / capacityMb) * 100, 100);
        if (totalMb > 0)    return Math.min((totalMb / 10240) * 100, 100); // fallback: assume 10 GB
        return 0;
    });

    // ── Popup / player ────────────────────────────────────────────
    popupVisible         = signal(false);
    popupExpanded        = signal(false);
    loadingVideo         = signal(false);
    currentVideo         = signal('');
    currentRecordingName = signal('');
    videoCurrentTime     = signal(0);

    popupX = signal(Math.max(8, Math.floor((window.innerWidth  - 680) / 2)));
    popupY = signal(Math.max(20, Math.floor((window.innerHeight - 480) / 2)));

    private pendingSeek: number | null = null;

    // ── Drag ──────────────────────────────────────────────────────
    private isDragging  = false;
    private dragOffsetX = 0;
    private dragOffsetY = 0;
    private readonly boundMouseMove = (e: MouseEvent) => this.onMouseMove(e);
    private readonly boundMouseUp   = () => this.onMouseUp();

    // ── Timeline computed ─────────────────────────────────────────
    private readonly SEG_DURATION = 900;

    private tlRange = computed(() => {
        const recs = this.cloudRecordings();
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
        this.route.paramMap.subscribe(params => {
            const id = params.get('id') || '';
            this.cameraId.set(id);
            if (id) {
                this.loadAvailableDates();
            } else {
                this.availableDates.set([]);
                this.cloudRecordings.set([]);
            }
        });
        this.loadCameras();
        this.loadStorageStats();
    }

    ngOnDestroy() {
        document.removeEventListener('mousemove', this.boundMouseMove);
        document.removeEventListener('mouseup',   this.boundMouseUp);
    }

    loadStorageStats() {
        this.http.get<{ totalMb: number; capacityMb: number }>(`${API_URL}/recordings/storage-stats`).subscribe({
            next: (s) => this.nasStats.set(s),
            error: () => {}
        });
    }

    loadCameras() {
        this.http.get<any[]>(`${API_URL}/recordings/cameras`).subscribe({
            next: (cams) => this.recordingCameras.set(cams || []),
            error: (err) => console.error('Error loading recording cameras', err)
        });
    }

    navigateToCamera(id: string | number) {
        this.router.navigate(['/recordings', id]);
    }

    loadAvailableDates() {
        this.http.get<any>(`${API_URL}/recordings/cloud/${this.cameraId()}/dates`).subscribe({
            next: (res) => {
                const dates = res?.dates || [];
                this.availableDates.set(dates);
                const today = new Date().toISOString().split('T')[0];
                this.selectDate(dates.length > 0 ? dates[0] : today);
            },
            error: () => {
                this.selectDate(new Date().toISOString().split('T')[0]);
            }
        });
    }

    selectDate(date: string) {
        this.selectedDate.set(date);
        this.loadCloudRecordings(date);
    }

    loadCloudRecordings(date: string) {
        this.loadingRecordings.set(true);
        this.http.get<any>(`${API_URL}/recordings/cloud/${this.cameraId()}?date=${date}`).subscribe({
            next: (res) => {
                this.cloudRecordings.set(res?.files || []);
                this.loadingRecordings.set(false);
            },
            error: () => {
                this.cloudRecordings.set([]);
                this.loadingRecordings.set(false);
            }
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

        const token = localStorage.getItem('motor_control_token') || '';
        const url = `${API_URL}/recordings/cloud/video?path=${encodeURIComponent(rec.path)}`
                  + (token ? `&token=${encodeURIComponent(token)}` : '');
        this.currentVideo.set(url);
    }

    onVideoLoaded() {
        this.loadingVideo.set(false);
    }

    onTimeUpdate(e: Event) {
        const v = e.target as HTMLVideoElement;
        this.videoCurrentTime.set(v.currentTime);
        if (this.pendingSeek !== null && v.duration > 0) {
            v.currentTime = Math.min(this.pendingSeek, v.duration - 1);
            this.pendingSeek = null;
        }
    }

    onVideoEnded() {
        const list = this.cloudRecordings();
        const idx  = list.findIndex(r => r.filename === this.currentRecordingName());
        if (idx >= 0 && idx < list.length - 1) this.playRecording(list[idx + 1]);
    }

    onTimelineClick(e: MouseEvent) {
        const track = e.currentTarget as HTMLElement;
        const ratio  = (e.clientX - track.getBoundingClientRect().left) / track.offsetWidth;
        const { start, span } = this.tlRange();
        const clickedSec = start + ratio * span;

        const recs = this.cloudRecordings();
        let target = recs[0];
        for (const rec of recs) {
            if (this.filenameToSeconds(rec.filename) <= clickedSec) target = rec;
            else break;
        }
        if (!target) return;
        const offsetInSeg = clickedSec - this.filenameToSeconds(target.filename);
        this.playRecording(target, Math.max(0, offsetInSeg));
    }

    closePopup() {
        this.currentVideo.set('');
        this.loadingVideo.set(false);
        this.popupVisible.set(false);
        this.popupExpanded.set(false);
        this.currentRecordingName.set('');
        this.videoCurrentTime.set(0);
    }

    toggleExpand() { this.popupExpanded.update(v => !v); }

    getDownloadUrl(filePath: string): string {
        const token = localStorage.getItem('motor_control_token') || '';
        return `${API_URL}/recordings/cloud/video?path=${encodeURIComponent(filePath)}&token=${encodeURIComponent(token)}`;
    }

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
