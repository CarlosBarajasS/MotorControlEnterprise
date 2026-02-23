import { Component, OnInit, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { CameraViewerComponent } from '../camera-viewer/camera-viewer.component';

const API_URL = '/api';

@Component({
    selector: 'app-cameras',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule, CameraViewerComponent],
    templateUrl: './cameras.component.html',
    styleUrls: ['./cameras.component.scss']
})
export class CamerasComponent implements OnInit {
    http = inject(HttpClient);
    router = inject(Router);

    cameras = signal<any[]>([]);
    clients = signal<any[]>([]); // For dropdown when creating a camera
    searchTerm = signal('');
    gridCols = 2;
    filtered = computed(() =>
        this.cameras().filter(c =>
            c.name.toLowerCase().includes(this.searchTerm().toLowerCase()) ||
            (c.location ?? '').toLowerCase().includes(this.searchTerm().toLowerCase())
        )
    );

    showModal = signal(false);
    modalMode = signal<'create' | 'edit'>('create');
    currentCamera = signal<any>({});

    ngOnInit() {
        this.loadData();
        // Load clients for dropdown mapping
        this.http.get<any[]>(`${API_URL}/clients`).subscribe(res => {
            this.clients.set(res || []);
        });
    }

    loadData() {
        this.http.get<any[]>(`${API_URL}/cameras`).subscribe({
            next: (res) => {
                const sorted = (res || []).sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                this.cameras.set(sorted);
            },
            error: (err) => console.error(err)
        });
    }

    openCreate() {
        this.currentCamera.set({ name: '', location: '', rtspUrl: '', clientId: '' });
        this.modalMode.set('create');
        this.showModal.set(true);
    }

    openEdit(cam: any) {
        this.currentCamera.set({ ...cam });
        this.modalMode.set('edit');
        this.showModal.set(true);
    }

    saveCamera() {
        const data = this.currentCamera();
        const req = this.modalMode() === 'create'
            ? this.http.post(`${API_URL}/cameras`, data)
            : this.http.put(`${API_URL}/cameras/${data.id}`, data);

        req.subscribe({
            next: () => {
                this.showModal.set(false);
                this.loadData();
            },
            error: (err) => alert('Error al guardar la cámara: ' + (err.error?.message || err.message))
        });
    }

    deleteCamera(id: string) {
        if (confirm('¿Estás seguro de inhabilitar/eliminar esta cámara?')) {
            this.http.delete(`${API_URL}/cameras/${id}`).subscribe({
                next: () => this.loadData(),
                error: (err) => alert('Error al eliminar')
            });
        }
    }

    viewStream(id: string) {
        this.router.navigate(['/cameras', id]);
    }

    isOnline(cam: any): boolean {
        return cam.lastSeen && (Date.now() - new Date(cam.lastSeen).getTime()) < 60000;
    }

    openStream(cam: any) {
        this.router.navigate(['/cameras', cam.id]);
    }
}
