import {
    Component, Input, OnChanges, SimpleChanges,
    inject, signal, computed, Output, EventEmitter, HostBinding
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { WebrtcViewerComponent } from '../../camera-viewer/webrtc-viewer.component';

const API_URL = '/api';

@Component({
    selector: 'app-camera-grid',
    standalone: true,
    imports: [CommonModule, RouterModule, WebrtcViewerComponent],
    templateUrl: './camera-grid.component.html',
    styleUrls: ['./camera-grid.component.scss']
})
export class CameraGridComponent implements OnChanges {
    private http = inject(HttpClient);

    @Input() cameras: any[] = [];
    @Input() gatewayId = '';
    /** Muestra botones 1×1/2×2/3×3 para override manual */
    @Input() showLayoutPicker = false;
    /** Modo portal cliente: botones de acción (Expandir, Grabaciones) en lugar de panel PTZ */
    @Input() clientMode = false;

    @HostBinding('class.admin-mode') get adminMode() { return !this.clientMode; }
    @Input() loading = false;
    @Input() loadError = false;
    @Input() emptyMessage = 'Sin cámaras configuradas';

    @Output() retryClick = new EventEmitter<void>();

    // ── Reactivo interno ──────────────────────────────────────────────────
    private cams = signal<any[]>([]);
    private manualCols = signal<number | null>(null);

    gridCols = computed(() => {
        const override = this.manualCols();
        if (override !== null) return override;
        const n = this.cams().length;
        if (n <= 1) return 1;
        if (n <= 4) return 2;
        if (n <= 9) return 3;
        return 4;
    });

    skeletonCells = [0, 1, 2, 3];

    // ── Panel lateral (admin) ─────────────────────────────────────────────
    selectedCam = signal<any>(null);
    ptzPresets  = signal<any[]>([]);

    ngOnChanges(changes: SimpleChanges) {
        if (changes['cameras']) {
            this.cams.set(this.cameras ?? []);
        }
    }

    get camsValue() { return this.cams(); }

    setManualCols(n: number) { this.manualCols.set(n); }

    selectCam(cam: any | null) {
        if (this.clientMode) return;
        this.selectedCam.set(cam);
        this.ptzPresets.set([]);
        if (cam?.ptz) {
            this.http.get<any[]>(`${API_URL}/cameras/${cam.id}/ptz/presets`).subscribe({
                next: p  => this.ptzPresets.set(p || []),
                error: () => {}
            });
        }
    }

    isOnline(cam: any): boolean { return cam.status === 'active'; }

    getWebrtcPath(cam: any): string {
        const key = cam.cameraId ?? cam.cameraKey ?? cam.name;
        return `${this.gatewayId}/${key}`;
    }

    toggleFullscreen(event: MouseEvent, cell: HTMLDivElement) {
        event.stopPropagation();
        cell.requestFullscreen().catch(() => {});
    }

    trackByCamId(_: number, cam: any): number | string {
        return cam.id ?? cam.cameraId ?? cam.cameraKey;
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

    // ── PTZ ───────────────────────────────────────────────────────────────
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
}
