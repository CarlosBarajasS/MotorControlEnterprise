import { Component, OnInit, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';

const API_URL = '/api';

@Component({
    selector: 'app-cameras',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule],
    templateUrl: './cameras.component.html',
    styleUrls: ['./cameras.component.scss']
})
export class CamerasComponent implements OnInit {
    http = inject(HttpClient);
    router = inject(Router);

    cameras = signal<any[]>([]);
    clients = signal<any[]>([]);
    searchTerm = signal('');
    loading = signal(true);
    loadError = signal(false);

    clientCards = computed(() => {
        const q = this.searchTerm().toLowerCase();
        return this.clients()
            .map(client => {
                const cams = this.cameras().filter(c => c.clientId === client.id);
                const online = cams.filter(c => this.isOnline(c)).length;
                return { id: client.id, name: client.name, total: cams.length, online, offline: cams.length - online };
            })
            .filter(c => !q || c.name.toLowerCase().includes(q));
    });

    skeletonItems = [0, 1, 2];

    // ── Modal ────────────────────────────────────────────────────────────────
    showModal = signal(false);
    modalMode = signal<'create' | 'edit'>('create');
    currentCamera = signal<any>({});

    ngOnInit() {
        this.loadData();
    }

    loadData() {
        this.loading.set(true);
        this.loadError.set(false);
        this.http.get<any[]>(`${API_URL}/cameras`).subscribe({
            next: (res) => {
                this.cameras.set(res || []);
                this.loading.set(false);
            },
            error: () => {
                this.loadError.set(true);
                this.loading.set(false);
            }
        });
        this.http.get<any[]>(`${API_URL}/clients`).subscribe({
            next: (res) => this.clients.set(res || []),
            error: () => { this.loadError.set(true); this.loading.set(false); }
        });
    }

    openCreate() {
        this.currentCamera.set({ name: '', location: '', rtspUrl: '', clientId: '', streamType: 'nvr' });
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
            next: () => { this.showModal.set(false); this.loadData(); },
            error: (err) => alert('Error al guardar la cámara: ' + (err.error?.message || err.message))
        });
    }

    deleteCamera(id: string) {
        if (confirm('¿Estás seguro de inhabilitar/eliminar esta cámara?')) {
            this.http.delete(`${API_URL}/cameras/${id}`).subscribe({
                next: () => { this.showModal.set(false); this.loadData(); },
                error: () => alert('Error al eliminar')
            });
        }
    }

    setCameraField(field: string, value: any) {
        this.currentCamera.update(c => ({ ...c, [field]: value }));
    }

    isOnline(cam: any): boolean {
        return cam.status === 'active';
    }
}
