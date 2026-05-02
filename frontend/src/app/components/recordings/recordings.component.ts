import {
  Component, OnInit, OnDestroy, inject, signal, computed,
  ViewChild, ElementRef, effect
} from '@angular/core';
import { CommonModule, DecimalPipe, DatePipe } from '@angular/common';
import { ActivatedRoute, RouterModule, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';

const API_URL = '/api';

interface ClipMark {
  id: number;
  camera: string;
  date: string;
  range: string;
}

@Component({
  selector: 'app-recordings',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, DecimalPipe, DatePipe],
  templateUrl: './recordings.component.html',
  styleUrls: ['./recordings.component.scss']
})
export class RecordingsComponent implements OnInit, OnDestroy {

  route  = inject(ActivatedRoute);
  router = inject(Router);
  http   = inject(HttpClient);

  @ViewChild('videoEl')   videoEl?:   ElementRef<HTMLVideoElement>;
  @ViewChild('tlScroller') tlScroller?: ElementRef<HTMLElement>;

  // ── Cameras ────────────────────────────────────────────────────
  cameraId          = signal<string>('');
  recordingCameras  = signal<any[]>([]);
  camQuery          = signal('');

  cameraName = computed(() => {
    const id  = this.cameraId();
    const cam = this.recordingCameras().find(c => String(c.id) === id);
    return cam ? cam.name : (id ? `Cámara #${id}` : '');
  });

  clientName = computed(() => {
    const cam = this.recordingCameras().find(c => String(c.id) === this.cameraId());
    return cam?.clientName ?? '';
  });

  groupedCameras = computed(() => {
    const map = new Map<number, { clientId: number; clientName: string; cameras: any[] }>();
    for (const cam of this.recordingCameras()) {
      if (!map.has(cam.clientId))
        map.set(cam.clientId, { clientId: cam.clientId, clientName: cam.clientName ?? `Cliente #${cam.clientId}`, cameras: [] });
      map.get(cam.clientId)!.cameras.push(cam);
    }
    return Array.from(map.values());
  });

  filteredGroupedCameras = computed(() => {
    const q = this.camQuery().toLowerCase().trim();
    const groups = this.groupedCameras();
    if (!q) return groups;
    return groups
      .map(g => ({ ...g, cameras: g.cameras.filter(c => c.name.toLowerCase().includes(q) || String(c.id).includes(q)) }))
      .filter(g => g.cameras.length > 0);
  });

  // ── Recordings ─────────────────────────────────────────────────
  availableDates    = signal<string[]>([]);
  cloudRecordings   = signal<any[]>([]);
  selectedDate      = signal<string>('');
  loadingRecordings = signal(false);
  searchRec         = signal('');

  filteredRecordings = computed(() => {
    const q = this.searchRec().toLowerCase();
    if (!q) return this.cloudRecordings();
    return this.cloudRecordings().filter(r => (r.filename || r.name || '').toLowerCase().includes(q));
  });

  /** 96 slots of 15 min covering the full 24h day */
  daySlots = computed(() => {
    const recs = this.cloudRecordings();
    return Array.from({ length: 96 }, (_, i) => {
      const h      = Math.floor((i * 15) / 60);
      const m      = (i * 15) % 60;
      const prefix = `${String(h).padStart(2, '0')}-${String(m).padStart(2, '0')}`;
      const rec    = recs.find(r => (r.filename || '').startsWith(prefix)) ?? null;
      return { i, startMin: i * 15, rec, available: !!rec };
    });
  });

  nasStats    = signal<{ totalMb: number; capacityMb: number }>({ totalMb: 0, capacityMb: 0 });
  totalSizeMb = computed(() => this.nasStats().totalMb);
  cloudPct    = computed(() => {
    const { totalMb, capacityMb } = this.nasStats();
    if (capacityMb > 0) return Math.min((totalMb / capacityMb) * 100, 100);
    if (totalMb > 0)    return Math.min((totalMb / 10240) * 100, 100);
    return 0;
  });

  // ── Playback ───────────────────────────────────────────────────
  currentVideo          = signal('');
  currentRecordingName  = signal('');
  videoCurrentTime      = signal(0);
  loadingVideo          = signal(false);
  isPlaying             = signal(false);
  speed                 = signal(1);
  zoom                  = signal(1);
  private pendingSeek: number | null = null;

  currentRec = computed(() => {
    const name = this.currentRecordingName();
    return this.cloudRecordings().find(r => r.filename === name) ?? null;
  });

  /** Current playback position in minutes from midnight */
  currentMinute = computed(() => {
    const name = this.currentRecordingName();
    if (!name) return 0;
    return this.filenameToSeconds(name) / 60 + this.videoCurrentTime() / 60;
  });

  currentTimeDisplay = computed(() => {
    const min = this.currentMinute();
    const h   = Math.floor(min / 60);
    const m   = Math.floor(min % 60);
    const s   = Math.floor((min * 60) % 60);
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  });

  currentFragIndex = computed(() => Math.floor(this.currentMinute() / 15));

  // ── Calendar ───────────────────────────────────────────────────
  calYear  = signal(new Date().getFullYear());
  calMonth = signal(new Date().getMonth());

  readonly MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
    'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  readonly DOW_SHORT  = ['L','M','M','J','V','S','D'];
  readonly SPEEDS     = [0.5, 1, 2, 4];
  readonly hours25     = Array.from({ length: 25 }, (_, i) => i);
  readonly hours24     = Array.from({ length: 24 }, (_, i) => i);
  readonly SLOT_WIDTH  = `calc(${(15 / (24 * 60)) * 100}% - 1px)`;

  monthName = computed(() => this.MONTH_NAMES[this.calMonth()]);

  calDays = computed(() => {
    const year   = this.calYear();
    const month  = this.calMonth();
    const days   = new Date(year, month + 1, 0).getDate();
    const offset = (new Date(year, month, 1).getDay() + 6) % 7;
    const today  = new Date(); today.setHours(0, 0, 0, 0);
    const avail  = this.availableDates();

    const cells: Array<{ day: number | null; status: 'full' | 'none' | 'future' | 'empty' }> = [];
    for (let i = 0; i < offset; i++) cells.push({ day: null, status: 'empty' });
    for (let d = 1; d <= days; d++) {
      const date    = new Date(year, month, d);
      const dateStr = `${year}-${String(month + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      if (date > today)              cells.push({ day: d, status: 'future' });
      else if (avail.includes(dateStr)) cells.push({ day: d, status: 'full' });
      else                           cells.push({ day: d, status: 'none' });
    }
    return cells;
  });

  // ── Clips & toast ──────────────────────────────────────────────
  savedClips = signal<ClipMark[]>([]);
  topClips   = computed(() => this.savedClips().slice(0, 4));
  toastMsg   = signal('');
  private toastTimer: any;

  // ── Constructor: auto-scroll effect ───────────────────────────
  constructor() {
    effect(() => {
      const min      = this.currentMinute();
      const scroller = this.tlScroller?.nativeElement;
      if (!scroller || !this.currentVideo()) return;
      const totalPx  = 1200 * this.zoom();
      const headX    = (min / (24 * 60)) * totalPx;
      const vw       = scroller.clientWidth;
      const left     = scroller.scrollLeft;
      if (headX < left + 60 || headX > left + vw - 60)
        scroller.scrollLeft = Math.max(0, headX - vw / 2);
    });
  }

  // ── Lifecycle ──────────────────────────────────────────────────
  ngOnInit() {
    this.route.paramMap.subscribe(params => {
      const id = params.get('id') || '';
      this.cameraId.set(id);
      if (id) this.loadAvailableDates();
      else { this.availableDates.set([]); this.cloudRecordings.set([]); this.currentVideo.set(''); }
    });
    this.loadCameras();
    this.loadStorageStats();
  }

  ngOnDestroy() { clearTimeout(this.toastTimer); }

  // ── API ────────────────────────────────────────────────────────
  loadStorageStats() {
    this.http.get<{ totalMb: number; capacityMb: number }>(`${API_URL}/recordings/storage-stats`)
      .subscribe({ next: s => this.nasStats.set(s), error: () => {} });
  }

  loadCameras() {
    this.http.get<any[]>(`${API_URL}/recordings/cameras`).subscribe({
      next:  cams => this.recordingCameras.set(cams || []),
      error: err  => console.error('Error loading cameras', err)
    });
  }

  loadAvailableDates() {
    this.http.get<any>(`${API_URL}/recordings/cloud/${this.cameraId()}/dates`).subscribe({
      next: res => {
        const dates = res?.dates || [];
        this.availableDates.set(dates);
        const today = new Date().toISOString().split('T')[0];
        this.selectDate(dates.length > 0 ? dates[0] : today);
        if (dates.length > 0) {
          const d = new Date(dates[0]);
          this.calYear.set(d.getFullYear());
          this.calMonth.set(d.getMonth());
        }
      },
      error: () => this.selectDate(new Date().toISOString().split('T')[0])
    });
  }

  selectDate(date: string) {
    this.selectedDate.set(date);
    this.loadCloudRecordings(date);
  }

  loadCloudRecordings(date: string) {
    this.loadingRecordings.set(true);
    this.currentVideo.set('');
    this.currentRecordingName.set('');
    this.http.get<any>(`${API_URL}/recordings/cloud/${this.cameraId()}?date=${date}`).subscribe({
      next:  res => { this.cloudRecordings.set(res?.files || []); this.loadingRecordings.set(false); },
      error: ()  => { this.cloudRecordings.set([]);               this.loadingRecordings.set(false); }
    });
  }

  navigateToCamera(id: string | number) {
    this.currentVideo.set('');
    this.currentRecordingName.set('');
    this.router.navigate(['/recordings', id]);
  }

  // ── Playback ───────────────────────────────────────────────────
  playRecording(rec: any, seekToSec?: number) {
    this.currentVideo.set('');
    this.currentRecordingName.set(rec.filename || rec.startTime || '');
    this.videoCurrentTime.set(0);
    this.loadingVideo.set(true);
    this.pendingSeek = seekToSec ?? null;

    const token = localStorage.getItem('motor_control_token') || '';
    const url   = `${API_URL}/recordings/cloud/video?path=${encodeURIComponent(rec.path)}`
                + (token ? `&token=${encodeURIComponent(token)}` : '');
    this.currentVideo.set(url);
  }

  onVideoLoaded() {
    this.loadingVideo.set(false);
    const v = this.videoEl?.nativeElement;
    if (!v) return;
    v.playbackRate = this.speed();
    if (this.pendingSeek !== null && v.duration > 0) {
      v.currentTime  = Math.min(this.pendingSeek, v.duration - 1);
      this.pendingSeek = null;
    }
    v.play().then(() => this.isPlaying.set(true)).catch(() => {});
  }

  onTimeUpdate(e: Event) {
    const v = e.target as HTMLVideoElement;
    this.videoCurrentTime.set(v.currentTime);
    this.isPlaying.set(!v.paused);
    if (this.pendingSeek !== null && v.duration > 0) {
      v.currentTime    = Math.min(this.pendingSeek, v.duration - 1);
      this.pendingSeek = null;
    }
  }

  /** Auto-advance to next 15-min fragment when current one ends */
  onVideoEnded() {
    const list = this.cloudRecordings();
    const idx  = list.findIndex(r => r.filename === this.currentRecordingName());
    if (idx >= 0 && idx < list.length - 1) this.playRecording(list[idx + 1]);
    else this.isPlaying.set(false);
  }

  togglePlay() {
    const v = this.videoEl?.nativeElement;
    if (!v || !this.currentVideo()) return;
    if (v.paused) { v.play();  this.isPlaying.set(true);  }
    else          { v.pause(); this.isPlaying.set(false); }
  }

  zoomIn()  { this.zoom.update(z => Math.min(6, +(z + 0.5).toFixed(1))); }
  zoomOut() { this.zoom.update(z => Math.max(1, +(z - 0.5).toFixed(1))); }

  setSpeed(s: number) {
    this.speed.set(s);
    const v = this.videoEl?.nativeElement;
    if (v) v.playbackRate = s;
  }

  /** Seek the continuous timeline to a given minute-from-midnight */
  seekToMinute(min: number) {
    const slotIdx = Math.min(95, Math.floor(min / 15));
    const slot    = this.daySlots()[slotIdx];
    if (!slot?.rec) return;
    const offsetSec = (min - slot.startMin) * 60;
    this.playRecording(slot.rec, Math.max(0, offsetSec));
  }

  onMainTimelineClick(e: MouseEvent) {
    const track = e.currentTarget as HTMLElement;
    const ratio  = (e.clientX - track.getBoundingClientRect().left) / track.offsetWidth;
    this.seekToMinute(ratio * 24 * 60);
  }

  toggleFullscreen() {
    const v = this.videoEl?.nativeElement;
    if (!v) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else v.requestFullscreen();
  }

  getDownloadUrl(filePath: string): string {
    const token = localStorage.getItem('motor_control_token') || '';
    return `${API_URL}/recordings/cloud/video?path=${encodeURIComponent(filePath)}&token=${encodeURIComponent(token)}`;
  }

  // ── Clips ──────────────────────────────────────────────────────
  saveClip() {
    if (!this.currentRecordingName()) return;
    const clip: ClipMark = {
      id:     Date.now(),
      camera: this.cameraName(),
      date:   this.selectedDate(),
      range:  this.formatSegmentTime(this.currentRecordingName()),
    };
    this.savedClips.update(c => [clip, ...c]);
    this.showToast(`Clip guardado · ${clip.range}`);
  }

  showToast(msg: string) {
    this.toastMsg.set(msg);
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastMsg.set(''), 2500);
  }

  // ── Calendar helpers ───────────────────────────────────────────
  prevMonth() {
    if (this.calMonth() === 0) { this.calYear.update(y => y - 1); this.calMonth.set(11); }
    else this.calMonth.update(m => m - 1);
  }
  nextMonth() {
    if (this.calMonth() === 11) { this.calYear.update(y => y + 1); this.calMonth.set(0); }
    else this.calMonth.update(m => m + 1);
  }

  isSelectedDate(day: number): boolean { return this.selectedDate() === this.formatCalDate(day); }
  isToday(day: number): boolean {
    const t = new Date();
    return t.getFullYear() === this.calYear() && t.getMonth() === this.calMonth() && t.getDate() === day;
  }
  formatCalDate(day: number): string {
    return `${this.calYear()}-${String(this.calMonth() + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  }

  // ── Formatting ─────────────────────────────────────────────────
  filenameToSeconds(filename: string): number {
    const m = (filename || '').match(/^(\d{2})-(\d{2})-(\d{2})/);
    return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0;
  }

  formatSegmentTime(filename: string): string {
    const m = (filename || '').match(/^(\d{2})-(\d{2})-(\d{2})/);
    if (!m) return filename || '';
    const endMin = (+m[2] + 15) % 60;
    const endH   = +m[1] + Math.floor((+m[2] + 15) / 60);
    return `${m[1]}:${m[2]} – ${String(endH).padStart(2,'0')}:${String(endMin).padStart(2,'0')}`;
  }

  formatClock(totalMinutes: number): string {
    const h = Math.floor(totalMinutes / 60);
    const m = Math.floor(totalMinutes % 60);
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'00')}`;
  }

  hourLabel(h: number): string { return `${String(h).padStart(2,'0')}:00`; }
}
