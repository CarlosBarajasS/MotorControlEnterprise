import {
  Component, OnInit, OnDestroy, HostListener, inject,
  signal, computed, ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { WebrtcViewerComponent } from '../camera-viewer/webrtc-viewer.component';

const API_URL = '/api';
const GRID_COLS = 12;
const GRID_ROWS = 8;
const GW_TIMEOUT_MS = 5 * 60 * 1000;

export interface GridCell {
  id: string;
  camId: number | string;
  x: number; y: number;
  w: number; h: number;
}

export interface MonitorLayout {
  id: string;
  name: string;
  cells: GridCell[];
}

const DEFAULT_LAYOUT: MonitorLayout = { id: 'default', name: 'Vista principal', cells: [] };

const GRADIENT_PALETTE = [
  'radial-gradient(130% 80% at 20% 10%, #1a2e5c 0%, #0a1220 100%)',
  'radial-gradient(130% 80% at 70% 20%, #1c2a4a 0%, #0c1428 100%)',
  'radial-gradient(130% 80% at 40% 60%, #162040 0%, #08101e 100%)',
  'radial-gradient(130% 80% at 10% 80%, #1a2848 0%, #0d1626 100%)',
  'radial-gradient(130% 80% at 80% 10%, #1c2a4e 0%, #0e1530 100%)',
  'radial-gradient(130% 80% at 30% 30%, #1e2e54 0%, #0f1628 100%)',
  'radial-gradient(130% 80% at 60% 70%, #141e3c 0%, #0a1020 100%)',
  'radial-gradient(130% 80% at 85% 50%, #182644 0%, #0c1422 100%)',
];
const OFFLINE_GRADIENT =
  'repeating-linear-gradient(45deg,#131a2e,#131a2e 4px,#161e34 4px,#161e34 8px)';

@Component({
  selector: 'app-live-monitor',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, WebrtcViewerComponent],
  templateUrl: './live-monitor.component.html',
  styleUrls: ['./live-monitor.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LiveMonitorComponent implements OnInit, OnDestroy {
  private router = inject(Router);
  private route  = inject(ActivatedRoute);
  private http = inject(HttpClient);

  // ── Core state ─────────────────────────────────────────────────────────
  cameras          = signal<any[]>([]);
  cells            = signal<GridCell[]>([]);
  editMode         = signal(false);
  showDrawer       = signal(false);
  showTemplates    = signal(false);
  templates        = signal<MonitorLayout[]>(this.loadTemplates());
  activeLayoutId   = signal('default');
  toastMsg         = signal('');
  clock            = signal(new Date());
  camQuery         = signal('');

  // ── Role / client selector ─────────────────────────────────────────────
  userRole         = signal<string>('');
  clients          = signal<any[]>([]);
  selectedClientId = signal<number | null>(null);

  // PTZ state (preserved from camera-grid)
  selectedCam  = signal<any>(null);
  ptzPresets   = signal<any[]>([]);
  showPtzPanel = signal(false);

  // Drag / resize state
  dragging = signal<{
    cellId: string; startX: number; startY: number;
    startCellX: number; startCellY: number;
  } | null>(null);
  resizing = signal<{
    cellId: string; startX: number; startY: number;
    startW: number; startH: number;
  } | null>(null);

  private canvasEl: HTMLElement | null = null;
  private clockInterval: ReturnType<typeof setInterval> | null = null;
  private toastTimer:    ReturnType<typeof setTimeout>  | null = null;

  // ── Computed ───────────────────────────────────────────────────────────
  filteredCameras = computed(() => {
    const cams     = this.cameras();
    const clientId = this.selectedClientId();
    if (!clientId || this.userRole() === 'client') return cams;
    return cams.filter(c => c.clientId === clientId);
  });

  onlineCount = computed(() => this.filteredCameras().filter(c => this.isOnline(c)).length);
  offlineCount = computed(() => this.filteredCameras().filter(c => !this.isOnline(c)).length);
  alertCount  = computed(() => this.filteredCameras().filter(c => c.alertActive && this.isOnline(c)).length);

  usedCamIds = computed(() => new Set(this.cells().map(c => String(c.camId))));

  camerasByZone = computed(() => {
    const q    = this.camQuery().toLowerCase().trim();
    const cams = q
      ? this.filteredCameras().filter(c =>
          (c.name || '').toLowerCase().includes(q) ||
          this.getCamZone(c).toLowerCase().includes(q))
      : this.filteredCameras();
    const map = new Map<string, any[]>();
    for (const cam of cams) {
      const zone = this.getCamZone(cam);
      if (!map.has(zone)) map.set(zone, []);
      map.get(zone)!.push(cam);
    }
    return [...map.entries()].map(([zone, cams]) => ({ zone, cams }));
  });

  cellsWithCams = computed(() =>
    this.cells()
      .map(cell => ({
        ...cell,
        cam: this.cameras().find(c => String(c.id) === String(cell.camId))!,
      }))
      .filter(c => !!c.cam)
  );

  timeStr = computed(() =>
    this.clock().toLocaleTimeString('es-MX', { hour12: false }));
  dateStr = computed(() =>
    this.clock().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }));

  readonly GRID_COLS = GRID_COLS;
  readonly GRID_ROWS = GRID_ROWS;

  // ── Lifecycle ──────────────────────────────────────────────────────────
  ngOnInit() {
    try {
      const token = localStorage.getItem('motor_control_token');
      if (token) {
        const payload = JSON.parse(atob(token.split('.')[1]));
        this.userRole.set(payload.role || '');
      }
    } catch {}

    if (this.userRole() !== 'client') {
      this.loadClients();
      const qp = this.route.snapshot.queryParamMap.get('client');
      if (qp) this.selectedClientId.set(+qp);
    }

    this.loadCameras();
    this.clockInterval = setInterval(() => this.clock.set(new Date()), 1000);
  }

  ngOnDestroy() {
    if (this.clockInterval) clearInterval(this.clockInterval);
    if (this.toastTimer)    clearTimeout(this.toastTimer);
  }

  // ── API ────────────────────────────────────────────────────────────────
  loadCameras() {
    this.http.get<any[]>(`${API_URL}/cameras`).subscribe({
      next: cams => {
        this.cameras.set(cams || []);
        const saved = this.templates().find(t => t.id !== 'default' && t.cells.length > 0);
        if (saved) {
          this.selectLayout(saved, false);
        } else if (this.filteredCameras().length > 0) {
          this.applyQuickLayout(2);
        }
      },
      error: () => console.warn('[LiveMonitor] Could not load cameras'),
    });
  }

  loadClients() {
    this.http.get<any[]>(`${API_URL}/clients`).subscribe({
      next: c  => this.clients.set(c || []),
      error: () => {}
    });
  }

  onClientChange(clientId: number | null) {
    this.selectedClientId.set(clientId ? +clientId : null);
    this.cells.set([]);
    this.selectedCam.set(null);
    this.showPtzPanel.set(false);
    const visible = this.filteredCameras();
    if (visible.length > 0) this.applyQuickLayout(2);
  }

  // ── Camera helpers (preserved from camera-grid) ────────────────────────
  isOnline(cam: any): boolean {
    if (cam.status !== 'active') return false;
    const hb = cam.gatewayLastHeartbeat;
    if (!hb) return true;
    return (Date.now() - new Date(hb).getTime()) < GW_TIMEOUT_MS;
  }

  getCamZone(cam: any): string {
    return cam.location || cam.zone || 'Sin zona';
  }

  getCamResolution(cam: any): string {
    return cam.metadata?.discovery?.resolution || cam.resolution || '1080p';
  }

  /** Derives WHEP path from cam.streams.webrtc URL (same logic as camera-grid) */
  getWebrtcPath(cam: any): string {
    const raw     = cam.streams ?? cam.Streams;
    const streams = typeof raw === 'string'
      ? (() => { try { return JSON.parse(raw); } catch { return null; } })()
      : raw;
    const webrtcUrl: string | undefined = streams?.webrtc;
    if (webrtcUrl) {
      try { return new URL(webrtcUrl).pathname.replace(/^\//, ''); } catch {}
    }
    const key = cam.cameraKey ?? cam.cameraId ?? cam.name;
    const gw  = (cam.gatewayId ?? '').replace(/:/g, '-');
    return `${gw}/${key}`;
  }

  hasStream(cam: any): boolean {
    const raw     = cam.streams ?? cam.Streams;
    const streams = typeof raw === 'string'
      ? (() => { try { return JSON.parse(raw); } catch { return null; } })()
      : raw;
    return !!(streams?.webrtc);
  }

  getCamGradient(cam: any): string {
    if (!this.isOnline(cam)) return OFFLINE_GRADIENT;
    const id   = String(cam.id ?? '');
    const hash = [...id].reduce((a, c) => a + c.charCodeAt(0), 0);
    return GRADIENT_PALETTE[hash % GRADIENT_PALETTE.length];
  }

  camSummary(cam: any): string {
    const d = cam?.metadata?.discovery;
    if (!d) return '';
    const parts: string[] = [];
    if (d.brand)      parts.push(d.brand);
    if (d.model)      parts.push(d.model);
    if (d.resolution) parts.push(d.fps ? `${d.resolution} @ ${d.fps}fps` : d.resolution);
    return parts.join(' · ');
  }

  // ── Grid actions ────────────────────────────────────────────────────────
  applyQuickLayout(cols: number) {
    const camsToShow = this.filteredCameras().slice(0, cols * cols);
    const cw = Math.floor(GRID_COLS / cols);
    const ch = Math.floor(GRID_ROWS / cols);
    const newCells: GridCell[] = camsToShow.map((cam, i) => ({
      id:    `cell-${Date.now()}-${i}`,
      camId: cam.id,
      x: (i % cols) * cw,
      y: Math.floor(i / cols) * ch,
      w: cw, h: ch,
    }));
    this.cells.set(newCells);
    this.showToast(`Vista ${cols}×${cols} aplicada`);
  }

  addCamera(cam: any) {
    if (this.usedCamIds().has(String(cam.id))) return;
    this.cells.update(prev => [...prev, {
      id: `cell-${Date.now()}`, camId: cam.id,
      x: 0, y: 0, w: 4, h: 4,
    }]);
    this.showToast(`${cam.name} agregada al canvas`);
  }

  removeCell(cellId: string) {
    this.cells.update(prev => prev.filter(c => c.id !== cellId));
    const stillPresent = this.cellsWithCams().some(
      c => String(c.camId) === String(this.selectedCam()?.id));
    if (!stillPresent) { this.selectedCam.set(null); this.showPtzPanel.set(false); }
  }

  toggleEditMode() {
    const next = !this.editMode();
    this.editMode.set(next);
    if (next) {
      this.selectedCam.set(null);
      this.showPtzPanel.set(false);
    } else {
      this.showDrawer.set(false);
    }
  }

  // ── PTZ (preserved from camera-grid) ─────────────────────────────────
  selectCamForPtz(cam: any) {
    if (this.editMode()) return;
    if (String(this.selectedCam()?.id) === String(cam.id)) {
      this.selectedCam.set(null);
      this.showPtzPanel.set(false);
      return;
    }
    this.selectedCam.set(cam);
    this.ptzPresets.set([]);
    this.showPtzPanel.set(!!cam.ptz);
    if (cam.ptz) {
      this.http.get<any[]>(`${API_URL}/cameras/${cam.id}/ptz/presets`).subscribe({
        next: p  => this.ptzPresets.set(p || []),
        error: () => {}
      });
    }
  }

  ptzMove(pan: number, tilt: number, zoom: number) {
    const cam = this.selectedCam();
    if (!cam) return;
    this.http.post(`${API_URL}/cameras/${cam.id}/ptz/move`, { pan, tilt, zoom }).subscribe();
  }

  ptzStop() {
    const cam = this.selectedCam();
    if (!cam) return;
    this.http.post(`${API_URL}/cameras/${cam.id}/ptz/stop`, {}).subscribe();
  }

  gotoPreset(presetId: string) {
    const cam = this.selectedCam();
    if (!cam) return;
    this.http.post(`${API_URL}/cameras/${cam.id}/ptz/presets/${presetId}/goto`, {}).subscribe();
  }

  takeSnapshot() {
    const cam = this.selectedCam();
    if (!cam) return;
    window.open(`${API_URL}/stream/${cam.id}/snapshot`, '_blank');
  }

  // ── Layout persistence ──────────────────────────────────────────────────
  loadTemplates(): MonitorLayout[] {
    try {
      const raw = localStorage.getItem('nirm_monitor_templates');
      return raw ? JSON.parse(raw) : [DEFAULT_LAYOUT];
    } catch { return [DEFAULT_LAYOUT]; }
  }

  saveLayout(name: string) {
    if (!name.trim()) return;
    const layout: MonitorLayout = {
      id: `tpl-${Date.now()}`, name: name.trim(), cells: [...this.cells()],
    };
    const updated = [...this.templates(), layout];
    this.templates.set(updated);
    localStorage.setItem('nirm_monitor_templates', JSON.stringify(updated));
    this.activeLayoutId.set(layout.id);
    this.showToast(`Layout "${layout.name}" guardado`);
  }

  selectLayout(layout: MonitorLayout, withToast = true) {
    this.cells.set([...layout.cells]);
    this.activeLayoutId.set(layout.id);
    this.showTemplates.set(false);
    if (withToast) this.showToast(`Layout "${layout.name}" cargado`);
  }

  deleteLayout(id: string) {
    const updated = this.templates().filter(t => t.id !== id);
    this.templates.set(updated);
    localStorage.setItem('nirm_monitor_templates', JSON.stringify(updated));
  }

  // ── Drag & Resize ───────────────────────────────────────────────────────
  onCellMouseDown(cellId: string, e: MouseEvent, canvasEl: HTMLElement) {
    if (!this.editMode()) return;
    e.preventDefault();
    const cell = this.cells().find(c => c.id === cellId);
    if (!cell) return;
    this.canvasEl = canvasEl;
    this.dragging.set({
      cellId, startX: e.clientX, startY: e.clientY,
      startCellX: cell.x, startCellY: cell.y,
    });
  }

  onResizeMouseDown(cellId: string, e: MouseEvent, canvasEl: HTMLElement) {
    e.preventDefault();
    e.stopPropagation();
    const cell = this.cells().find(c => c.id === cellId);
    if (!cell) return;
    this.canvasEl = canvasEl;
    this.resizing.set({
      cellId, startX: e.clientX, startY: e.clientY,
      startW: cell.w, startH: cell.h,
    });
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(e: MouseEvent) {
    const drag   = this.dragging();
    const resize = this.resizing();
    if (!drag && !resize) return;
    const canvas = this.canvasEl;
    if (!canvas) return;
    const cw = canvas.clientWidth  / GRID_COLS;
    const ch = canvas.clientHeight / GRID_ROWS;

    if (drag) {
      const dx   = e.clientX - drag.startX;
      const dy   = e.clientY - drag.startY;
      const cell = this.cells().find(c => c.id === drag.cellId);
      if (!cell) return;
      const newX = this.snap(drag.startCellX + dx / cw, GRID_COLS - cell.w, 0);
      const newY = this.snap(drag.startCellY + dy / ch, GRID_ROWS - cell.h, 0);
      this.cells.update(cells =>
        cells.map(c => c.id === drag.cellId ? { ...c, x: newX, y: newY } : c));
    }

    if (resize) {
      const dx   = e.clientX - resize.startX;
      const dy   = e.clientY - resize.startY;
      const cell = this.cells().find(c => c.id === resize.cellId);
      if (!cell) return;
      const newW = this.snap(resize.startW + dx / cw, GRID_COLS - cell.x, 1);
      const newH = this.snap(resize.startH + dy / ch, GRID_ROWS - cell.y, 1);
      this.cells.update(cells =>
        cells.map(c => c.id === resize.cellId ? { ...c, w: newW, h: newH } : c));
    }
  }

  @HostListener('document:mouseup')
  onMouseUp() {
    this.dragging.set(null);
    this.resizing.set(null);
  }

  private snap(val: number, max: number, min = 1): number {
    return Math.min(max, Math.max(min, Math.round(val)));
  }

  // ── Navigation ─────────────────────────────────────────────────────────
  goToRecordings(camId: string | number) {
    this.router.navigate(['/recordings', camId]);
  }

  // ── UI helpers ──────────────────────────────────────────────────────────
  showToast(msg: string) {
    this.toastMsg.set(msg);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastMsg.set(''), 2500);
  }

  isDragging(cellId: string): boolean {
    return this.dragging()?.cellId === cellId || this.resizing()?.cellId === cellId;
  }

  isSelected(camId: any): boolean {
    return String(this.selectedCam()?.id) === String(camId);
  }

  trackByCell(_: number, cell: GridCell) { return cell.id; }
  trackByZone(_: number, g: { zone: string }) { return g.zone; }
  trackByCam(_: number, cam: any) { return cam.id; }
}
