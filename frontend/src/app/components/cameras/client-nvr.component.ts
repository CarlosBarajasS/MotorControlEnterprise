import { Component, OnInit, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { CameraViewerComponent } from '../camera-viewer/camera-viewer.component';

const API_URL = '/api';

@Component({
    selector: 'app-client-nvr',
    standalone: true,
    imports: [CommonModule, RouterModule, CameraViewerComponent],
    templateUrl: './client-nvr.component.html',
    styleUrls: ['./client-nvr.component.scss']
})
export class ClientNvrComponent implements OnInit {
    route  = inject(ActivatedRoute);
    http   = inject(HttpClient);
    router = inject(Router);

    clientId = 0;
    clientName = signal('');
    cameras = signal<any[]>([]);
    loading = signal(true);
    loadError = signal(false);

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

    loadData() {
        this.loading.set(true);
        this.loadError.set(false);

        this.http.get<any[]>(`${API_URL}/cameras`).subscribe({
            next: (allCams) => {
                this.cameras.set((allCams || []).filter(c => c.clientId === this.clientId));
                this.loading.set(false);
            },
            error: () => {
                this.loadError.set(true);
                this.loading.set(false);
            }
        });

        this.http.get<any[]>(`${API_URL}/clients`).subscribe({
            next: (clients) => {
                const client = (clients || []).find(c => c.id === this.clientId);
                this.clientName.set(client?.name ?? `Cliente #${this.clientId}`);
            },
            error: () => {}
        });
    }

    isOnline(cam: any): boolean {
        return !!cam.lastSeen && (Date.now() - new Date(cam.lastSeen).getTime()) < 90_000;
    }

    getHlsUrl(cam: any): string {
        try {
            const s = JSON.parse(cam.streams ?? '{}');
            return s.centralHls ?? s.hls ?? '';
        } catch {
            return '';
        }
    }

    goToDetail(id: number) {
        this.router.navigate(['/cameras', id]);
    }

    toggleFullscreen(event: MouseEvent, cell: HTMLDivElement) {
        event.stopPropagation();
        cell.requestFullscreen().catch(() => {});
    }
}
