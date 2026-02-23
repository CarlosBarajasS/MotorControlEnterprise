import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';

const API_URL = '/api';

@Component({
    selector: 'app-clients',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule],
    templateUrl: './clients.component.html',
    styleUrls: ['./clients.component.scss']
})
export class ClientsComponent implements OnInit {
    http = inject(HttpClient);

    clients = signal<any[]>([]);
    stats = signal<any>(null);

    showModal = signal(false);
    modalMode = signal<'create' | 'edit'>('create');
    currentClient = signal<any>({});

    ngOnInit() {
        this.loadData();
    }

    loadData() {
        this.http.get<any>(`${API_URL}/clients/stats`).subscribe({
            next: (res) => this.stats.set(res),
            error: (err) => console.error(err)
        });

        this.http.get<any[]>(`${API_URL}/clients`).subscribe({
            next: (res) => this.clients.set(res || []),
            error: (err) => console.error(err)
        });
    }

    openCreate() {
        this.currentClient.set({ name: '', businessType: '', rfc: '', city: '' });
        this.modalMode.set('create');
        this.showModal.set(true);
    }

    openEdit(client: any) {
        this.currentClient.set({ ...client });
        this.modalMode.set('edit');
        this.showModal.set(true);
    }

    saveClient() {
        const data = this.currentClient();
        const req = this.modalMode() === 'create'
            ? this.http.post(`${API_URL}/clients`, data)
            : this.http.put(`${API_URL}/clients/${data.id}`, data);

        req.subscribe({
            next: () => {
                this.showModal.set(false);
                this.loadData();
            },
            error: (err) => alert('Error al guardar: ' + (err.error?.message || err.message))
        });
    }

    deleteClient(id: string) {
        if (confirm('¿Estás seguro de inhabilitar/eliminar a este cliente?')) {
            this.http.delete(`${API_URL}/clients/${id}`).subscribe({
                next: () => this.loadData(),
                error: (err) => alert('Error al eliminar')
            });
        }
    }

    toggleStatus(client: any) {
        const newStatus = client.status === 'active' ? 'inactive' : 'active';
        this.http.patch(`${API_URL}/clients/${client.id}/status`, { status: newStatus }).subscribe({
            next: () => this.loadData(),
            error: (res) => alert('Error actualizando estado')
        });
    }

    toggleCloudStorage(client: any) {
        const newState = !client.cloudStorageActive;
        this.http.patch(`${API_URL}/clients/${client.id}/cloud-storage`, { active: newState }).subscribe({
            next: () => this.loadData(),
            error: (res) => alert('Error actualizando almacenamiento cloud')
        });
    }
}
