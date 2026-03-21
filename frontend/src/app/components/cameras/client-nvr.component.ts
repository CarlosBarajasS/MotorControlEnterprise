import { Component, OnInit, OnDestroy, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { timer, Subscription, switchMap } from 'rxjs';
import { CameraGridComponent } from '../shared/camera-grid/camera-grid.component';

const API_URL = '/api';

@Component({
    selector: 'app-client-nvr',
    standalone: true,
    imports: [CommonModule, RouterModule, CameraGridComponent],
    templateUrl: './client-nvr.component.html',
    styleUrls: ['./client-nvr.component.scss']
})
export class ClientNvrComponent implements OnInit, OnDestroy {
    route  = inject(ActivatedRoute);
    http   = inject(HttpClient);
    router = inject(Router);

    clientId   = 0;
    clientName = signal('');
    cameras    = signal<any[]>([]);
    loading    = signal(true);
    loadError  = signal(false);
    gatewayId  = '';

    private pollSub?: Subscription;

    onlineCount  = computed(() => this.cameras().filter(c => c.status === 'active').length);
    offlineCount = computed(() => this.cameras().length - this.onlineCount());

    ngOnInit() {
        this.clientId = +this.route.snapshot.paramMap.get('clientId')!;
        this.loadData();
    }

    ngOnDestroy() { this.pollSub?.unsubscribe(); }

    loadData() {
        this.loading.set(true);
        this.loadError.set(false);

        this.http.get<any[]>(`${API_URL}/clients`).subscribe({
            next: (clients) => {
                const client = (clients || []).find(c => c.id === this.clientId);
                this.clientName.set(client?.name ?? `Cliente #${this.clientId}`);
                this.gatewayId = client?.gatewayId ?? '';
            },
            error: () => {}
        });

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
}
