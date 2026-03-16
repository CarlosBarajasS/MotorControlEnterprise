import { Component, OnInit, OnDestroy, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { timer, Subscription, switchMap } from 'rxjs';
import { WebrtcViewerComponent } from '../camera-viewer/webrtc-viewer.component';

const API_URL = '/api';

@Component({
    selector: 'app-client-nvr',
    standalone: true,
    imports: [CommonModule, RouterModule, WebrtcViewerComponent],
    templateUrl: './client-nvr.component.html',
    styleUrls: ['./client-nvr.component.scss']
})
export class ClientNvrComponent implements OnInit, OnDestroy {
    route  = inject(ActivatedRoute);
    http   = inject(HttpClient);
    router = inject(Router);

    clientId = 0;
    clientName  = signal('');
    cameras     = signal<any[]>([]);
    loading     = signal(true);
    loadError   = signal(false);
    selectedCam = signal<any>(null);
    ptzPresets  = signal<any[]>([]);
    gatewayId   = '';
    private pollSub?: Subscription;

    onlineCount  = computed(() => this.cameras().filter(c => this.isOnline(c)).length);
    offlineCount = computed(() => this.cameras().length - this.onlineCount());

    gridCols = computed(() => {
        const n = this.cameras().length;
        if (n <= 1) return 1;
        if (n <= 4) return 2;
        if (n <= 9) return 3;
        return 4;
    });

    skeletonCells = [0, 1, 2, 3];

    ngOnInit() {
        this.clientId = +this.route.snapshot.paramMap.get('clientId')!;
        this.loadData();
    }

    ngOnDestroy() {
        this.pollSub?.unsubscribe();
    }

    loadData() {
        this.loading.set(true);
        this.loadError.set(false);

        // Load client metadata once (name, gatewayId)
        this.http.get<any[]>(`${API_URL}/clients`).subscribe({
            next: (clients) => {
                const client = (clients || []).find(c => c.id === this.clientId);
                this.clientName.set(client?.name ?? `Cliente #${this.clientId}`);
                this.gatewayId = client?.gatewayId ?? '';
            },
            error: () => {}
        });

        // Poll cameras every 20s to keep online/offline status fresh
        this.pollSub = timer(0, 20000).pipe(
            switchMap(() => this.http.get<any[]>(`${API_URL}/cameras`))
        ).subscribe({
            next: (allCams) => {
                this.cameras.set((allCams || []).filter(c => c.clientId === this.clientId));
                this.loading.set(false);
            },
            error: () => {
                this.loadError.set(true);
                this.loading.set(false);
            }
        });
    }

    selectCam(cam: any | null) {
        this.selectedCam.set(cam);
        this.ptzPresets.set([]);
        if (cam?.ptz) {
            this.http.get<any[]>(`${API_URL}/cameras/${cam.id}/ptz/presets`).subscribe({
                next: (p) => this.ptzPresets.set(p || []),
                error: () => {}
            });
        }
    }

    isOnline(cam: any): boolean {
        return cam.status === 'active';
    }

    getWebrtcPath(cam: any): string {
        const key = cam.cameraId ?? cam.cameraKey ?? cam.name;
        return `${this.gatewayId}/${key}`;
    }

    toggleFullscreen(event: MouseEvent, cell: HTMLDivElement) {
        event.stopPropagation();
        cell.requestFullscreen().catch(() => {});
    }

    // PTZ
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

    camSummary(cam: any): string {
        const d = cam?.metadata?.discovery;
        if (!d) return '';
        const parts: string[] = [];
        if (d.brand) parts.push(d.brand);
        if (d.model) parts.push(d.model);
        if (d.resolution) parts.push(d.fps ? `${d.resolution} @ ${d.fps}fps` : d.resolution);
        return parts.join(' · ');
    }
}
