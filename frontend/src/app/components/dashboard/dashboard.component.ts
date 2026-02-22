import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { CameraViewerComponent } from '../camera-viewer/camera-viewer.component';

@Component({
    selector: 'app-dashboard',
    standalone: true,
    imports: [CommonModule, CameraViewerComponent],
    templateUrl: './dashboard.component.html',
    styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit {
    authService = inject(AuthService);

    // Dummy data for migration demo
    gateways = [
        { id: 'edge-gateway-tienda-abc', name: 'Sucursal Norte', status: 'online', lastSeen: 'Hace 2 min' },
        { id: 'edge-gateway-bodega-1', name: 'Bodega Principal', status: 'offline', lastSeen: 'Hace 3 horas' },
        { id: 'edge-gateway-oficinas', name: 'Oficinas Corporativas', status: 'online', lastSeen: 'Hace 30 seg' }
    ];

    selectedCameraStream: string | null = null;

    ngOnInit() {
        // In a real scenario, fetch gateways from API
    }

    logout() {
        this.authService.logout();
    }

    viewCamera(streamUrl: string) {
        this.selectedCameraStream = streamUrl;
    }

    closeCamera() {
        this.selectedCameraStream = null;
    }
}
