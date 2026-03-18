import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ToastService } from '../../services/toast.service';
import { ConfirmService } from '../../services/confirm.service';

const API_URL = '/api';

@Component({
    selector: 'app-users',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './users.component.html',
    styleUrls: ['./users.component.scss']
})
export class UsersComponent implements OnInit {
    http = inject(HttpClient);
    private toast   = inject(ToastService);
    private confirm = inject(ConfirmService);

    users = signal<any[]>([]);
    showModal = signal<boolean>(false);
    openMenuId = signal<number | null>(null);

    newUser = signal({
        email: '',
        name: '',
        role: 'admin',
        location: 'NIRM GROUP - Sede Principal'
    });

    ngOnInit() {
        this.loadUsers();
    }

    loadUsers() {
        this.http.get<any[]>(`${API_URL}/admin/auth/users`).subscribe({
            next: (res) => this.users.set(res || []),
            error: (err) => {
                console.warn('Error cargando usuarios, intentando ruta alternativa', err);
            }
        });
    }

    openCreate() {
        this.newUser.set({ email: '', name: '', role: 'admin', location: 'NIRM GROUP - Sede Principal' });
        this.showModal.set(true);
    }

    toggleMenu(id: number, event: MouseEvent) {
        event.stopPropagation();
        this.openMenuId.update(v => v === id ? null : id);
    }

    closeMenu() { this.openMenuId.set(null); }

    saveUser() {
        const payload = this.newUser();
        if (!payload.email) {
            this.toast.warning('El correo electrónico es obligatorio');
            return;
        }
        this.http.post(`${API_URL}/admin/auth/users/invite`, payload).subscribe({
            next: () => {
                this.toast.success('Invitación enviada correctamente');
                this.showModal.set(false);
                this.loadUsers();
            },
            error: (err) => this.toast.error(err.error?.message || 'Error enviando invitación')
        });
    }

    async deleteUser(id: number, name: string) {
        this.closeMenu();
        const ok = await this.confirm.show({
            title: 'Eliminar usuario',
            message: `¿Eliminar permanentemente la cuenta de "${name}"? El usuario perderá acceso inmediatamente y no podrá recuperarse.`,
            confirmLabel: 'Eliminar',
            danger: true
        });
        if (!ok) return;
        this.http.delete(`${API_URL}/admin/auth/users/${id}`).subscribe({
            next: () => { this.toast.success('Usuario eliminado correctamente'); this.loadUsers(); },
            error: (err) => this.toast.error(err.error?.message || 'Error al eliminar usuario')
        });
    }

    async toggleStatus(user: any) {
        this.closeMenu();
        const action = user.isActive ? 'suspender' : 'reactivar';
        const ok = await this.confirm.show({
            title: user.isActive ? 'Suspender cuenta' : 'Reactivar cuenta',
            message: user.isActive
                ? `Se bloqueará el acceso de "${user.name || user.email}" hasta que sea reactivado manualmente.`
                : `Se restaurará el acceso de "${user.name || user.email}" a la plataforma.`,
            confirmLabel: user.isActive ? 'Suspender' : 'Reactivar',
            danger: user.isActive
        });
        if (!ok) return;
        this.http.patch(`${API_URL}/admin/auth/users/${user.id}/status`, { isActive: !user.isActive }).subscribe({
            next: () => { this.toast.success(`Cuenta ${user.isActive ? 'suspendida' : 'reactivada'} correctamente`); this.loadUsers(); },
            error: (err) => this.toast.error(err.error?.message || `Error al ${action} cuenta`)
        });
    }

    async resendInvite(user: any) {
        this.closeMenu();
        const ok = await this.confirm.show({
            title: 'Reenviar invitación',
            message: `Se generará una nueva contraseña temporal y se enviará por correo a "${user.email}". La contraseña anterior quedará inválida.`,
            confirmLabel: 'Reenviar',
            danger: false
        });
        if (!ok) return;
        this.http.post(`${API_URL}/admin/auth/users/${user.id}/resend-invite`, {}).subscribe({
            next: () => this.toast.success(`Invitación reenviada a ${user.email}`),
            error: (err) => this.toast.error(err.error?.message || 'Error al reenviar invitación')
        });
    }
}
