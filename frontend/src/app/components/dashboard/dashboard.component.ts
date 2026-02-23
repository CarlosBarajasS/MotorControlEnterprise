import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../services/auth.service';
import { CameraViewerComponent } from '../camera-viewer/camera-viewer.component';
import { TelemetryDashboardComponent } from '../telemetry-dashboard/telemetry-dashboard.component';
import { MotorControlComponent } from '../motor-control/motor-control.component';

const API_URL = '/api';

@Component({
    selector: 'app-dashboard',
    standalone: true,
    imports: [CommonModule, RouterModule, CameraViewerComponent, TelemetryDashboardComponent, MotorControlComponent],
    templateUrl: './dashboard.component.html',
    styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit {
    http = inject(HttpClient);

    gateways = signal<any[]>([]);
    stats = signal<{ active: number, total: number }>({ active: 0, total: 0 });
    cameras = signal<any[]>([]);
    camerasOnline = computed(() => this.cameras().filter(c =>
        c.lastSeen && (Date.now() - new Date(c.lastSeen).getTime()) < 60000
    ).length);

    selectedCameraStream: string | null = null;

    ngOnInit() {
        this.fetchClients();
        this.http.get<any[]>(`${API_URL}/cameras`).subscribe({
            next: (res) => this.cameras.set(res || []),
            error: (err) => console.error('Error cargando cámaras:', err)
        });
    }

    fetchClients() {
        this.http.get<any[]>(`${API_URL}/clients`).subscribe({
            next: (data) => {
                const clients = data || [];
                this.gateways.set(clients);
                const active = clients.filter(c => c.status === 'active' || c.status === 'online').length;
                this.stats.set({ active, total: clients.length });
            },
            error: (err) => {
                console.error('Error cargando gateways:', err);
                if (err.status === 401) {
                    // Token expired is handled by interceptor, or do a window.location.href='/login' if needed
                }
            }
        });
    }


    viewCamera(streamUrl: string) {
        this.selectedCameraStream = streamUrl;
    }

    closeCamera() {
        this.selectedCameraStream = null;
    }
}
