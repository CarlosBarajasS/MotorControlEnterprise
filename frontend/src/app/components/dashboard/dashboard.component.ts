import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { CameraViewerComponent } from '../camera-viewer/camera-viewer.component';

const API_URL = '/api';

@Component({
    selector: 'app-dashboard',
    standalone: true,
    // ⚠️ AI_RULES: NO importar MotorControlComponent ni TelemetryDashboardComponent aquí
    imports: [CommonModule, RouterModule, CameraViewerComponent],
    templateUrl: './dashboard.component.html',
    styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit {
    http = inject(HttpClient);

    gateways = signal<any[]>([]);
    cameras = signal<any[]>([]);
    health = signal<{ status: string }>({ status: 'checking' });

    stats = signal<{ active: number, total: number }>({ active: 0, total: 0 });

    camerasOnline = computed(() => this.cameras().filter(c =>
        c.lastSeen && (Date.now() - new Date(c.lastSeen).getTime()) < 60000
    ).length);

    camerasOffline = computed(() => this.cameras().length - this.camerasOnline());

    recentActivity = computed(() => {
        const events: any[] = [];
        this.cameras().slice(0, 10).forEach(c => {
            const online = c.lastSeen && (Date.now() - new Date(c.lastSeen).getTime()) < 60000;
            events.push({
                event: `Cámara ${c.name}`,
                gateway: c.gatewayId || 'N/A',
                type: online ? 'online' : 'offline',
                label: online ? 'En Vivo' : 'Sin Señal',
                time: c.lastSeen ? new Date(c.lastSeen) : new Date(),
            });
        });
        this.gateways().forEach(gw => {
            events.push({
                event: `Gateway ${gw.name}`,
                gateway: gw.gatewayId || 'N/A',
                type: this.isActive(gw) ? 'online' : 'offline',
                label: this.isActive(gw) ? 'Activo' : 'Offline',
                time: gw.createdAt ? new Date(gw.createdAt) : new Date(),
            });
        });
        return events.sort((a, b) => b.time - a.time).slice(0, 12);
    });

    selectedCameraStream: string | null = null;

    ngOnInit() {
        this.refreshAll();
    }

    refreshAll() {
        this.fetchClients();
        this.fetchCameras();
        this.fetchHealth();
    }

    fetchClients() {
        this.http.get<any[]>(`${API_URL}/clients`).subscribe({
            next: (data) => {
                const clients = data || [];
                this.gateways.set(clients);
                const active = clients.filter(c => this.isActive(c)).length;
                this.stats.set({ active, total: clients.length });
            },
            error: (err) => console.error('Error cargando gateways:', err)
        });
    }

    fetchCameras() {
        this.http.get<any[]>(`${API_URL}/cameras`).subscribe({
            next: (res) => this.cameras.set(res || []),
            error: (err) => console.error('Error cargando cámaras:', err)
        });
    }

    fetchHealth() {
        this.http.get<{ status: string }>('/health').subscribe({
            next: (res) => this.health.set(res),
            error: () => this.health.set({ status: 'Unavailable' })
        });
    }

    isActive(gw: any): boolean {
        return gw.status === 'active' || gw.status === 'online' || gw.isActive === true;
    }

    getCamerasForGw(gw: any): any[] {
        return this.cameras().filter(c => c.clientId === gw.id);
    }

    openCameraModal(streamUrl: string) {
        this.selectedCameraStream = streamUrl;
    }

    closeCameraModal() {
        this.selectedCameraStream = null;
    }

    // Legacy alias
    fetchClients2() { this.fetchClients(); }
}
