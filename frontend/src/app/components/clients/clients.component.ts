import { Component, OnInit, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ToastService } from '../../services/toast.service';
import { ConfirmService } from '../../services/confirm.service';
import { GatewayModalComponent } from '../gateways/gateway-modal.component';

const API_URL = '/api';

@Component({
    selector: 'app-clients',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule, GatewayModalComponent],
    templateUrl: './clients.component.html',
    styleUrls: ['./clients.component.scss']
})
export class ClientsComponent implements OnInit {
    http = inject(HttpClient);
    private toast   = inject(ToastService);
    private confirm = inject(ConfirmService);

    clients = signal<any[]>([]);
    stats = signal<any>(null);
    searchTerm = signal('');
    activeGatewayClientId = signal<number | null>(null);
    filtered = computed(() =>
        this.clients().filter(c =>
            c.name.toLowerCase().includes(this.searchTerm().toLowerCase()) ||
            (c.city ?? '').toLowerCase().includes(this.searchTerm().toLowerCase()) ||
            (c.businessType ?? '').toLowerCase().includes(this.searchTerm().toLowerCase())
        )
    );

    showModal = signal(false);
    modalMode = signal<'create' | 'edit'>('create');
    currentClient = signal<any>({});

    showTrash = signal(false);
    trashClients = signal<any[]>([]);
    trashLoading = signal(false);

    ngOnInit() {
        this.loadData();
    }

    loadData() {
        this.http.get<any>(`${API_URL}/clients/stats`).subscribe({
            next: (res) => this.stats.set(res),
            error: (err) => console.error(err)
        });

        this.http.get<any[]>(`${API_URL}/clients`).subscribe({
            next: (res) => {
                const data = res || [];
                this.clients.set(data);
                data.forEach(c => this.loadGateways(c));
            },
            error: (err) => console.error(err)
        });
    }

    openCreate() {
        this.currentClient.set({ name: '', businessType: '', rfc: '', city: '', state: '', country: 'México', contactName: '', contactPhone: '', contactEmail: '' });
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
            error: (err) => this.toast.error(err.error?.message || 'Error al guardar los datos')
        });
    }

    async deleteClient(id: string) {
        const ok = await this.confirm.show({
            title: 'Mover a papelera',
            message: 'El cliente y sus cámaras serán desactivados y movidos a la papelera. Podrás recuperarlos dentro de los próximos 30 días.',
            confirmLabel: 'Mover a papelera',
            danger: true
        });
        if (!ok) return;
        this.http.delete(`${API_URL}/clients/${id}`).subscribe({
            next: () => {
                this.toast.success('Cliente movido a la papelera');
                this.loadData();
                if (this.showTrash()) { this.loadTrash(); }
            },
            error: () => this.toast.error('Error al eliminar el cliente')
        });
    }

    loadTrash() {
        this.trashLoading.set(true);
        this.http.get<any[]>(`${API_URL}/clients/trash`).subscribe({
            next: (res) => {
                this.trashClients.set(res || []);
                this.trashLoading.set(false);
            },
            error: (err) => {
                console.error(err);
                this.trashLoading.set(false);
            }
        });
    }

    restoreClient(id: number) {
        this.http.patch(`${API_URL}/clients/${id}/restore`, {}).subscribe({
            next: () => {
                this.toast.success('Cliente restaurado correctamente');
                this.loadData();
                this.loadTrash();
            },
            error: () => this.toast.error('Error al restaurar el cliente')
        });
    }

    async permanentDelete(id: number) {
        const ok = await this.confirm.show({
            title: 'Eliminar permanentemente',
            message: 'Esta acción es irreversible. El cliente, sus cámaras y todos sus datos serán eliminados definitivamente del sistema.',
            confirmLabel: 'Eliminar para siempre',
            danger: true
        });
        if (!ok) return;
        this.http.delete(`${API_URL}/clients/${id}/permanent`).subscribe({
            next: () => { this.toast.success('Cliente eliminado permanentemente'); this.loadTrash(); },
            error: () => this.toast.error('Error al eliminar permanentemente')
        });
    }

    toggleTrash() {
        this.showTrash.update(v => !v);
        if (this.showTrash()) { this.loadTrash(); }
    }

    loadGateways(client: any) {
        client.gatewaysLoading = true;
        this.http.get<any[]>(`${API_URL}/clients/${client.id}/gateways`).subscribe({
            next: (gws) => { client.gateways = gws; client.gatewaysLoading = false; },
            error: () => { client.gateways = []; client.gatewaysLoading = false; }
        });
    }

    openGatewayModal(clientId: number) {
        this.activeGatewayClientId.set(clientId);
    }

    onGatewaySaved(clientId: number) {
        this.activeGatewayClientId.set(null);
        const client = this.clients().find(c => c.id === clientId);
        if (client) this.loadGateways(client);
    }

    toggleStatus(client: any) {
        const newStatus = client.status === 'active' ? 'inactive' : 'active';
        this.http.patch(`${API_URL}/clients/${client.id}/status`, { status: newStatus }).subscribe({
            next: () => { this.toast.success('Estado actualizado'); this.loadData(); },
            error: () => this.toast.error('Error al actualizar el estado')
        });
    }

    toggleCloudStorage(client: any) {
        const newState = !client.cloudStorageActive;
        this.http.patch(`${API_URL}/clients/${client.id}/cloud-storage`, { active: newState }).subscribe({
            next: () => { this.toast.success('Almacenamiento cloud actualizado'); this.loadData(); },
            error: () => this.toast.error('Error al actualizar almacenamiento cloud')
        });
    }
}
