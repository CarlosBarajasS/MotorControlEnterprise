import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';

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

    users = signal<any[]>([]);
    showModal = signal<boolean>(false);

    newUser = signal({
        email: '',
        name: '',
        role: 'client',
        location: 'NIRM GROUP - Sede Principal'
    });

    ngOnInit() {
        this.loadUsers();
    }

    loadUsers() {
        // Asumimos un GET genérico, lo pediremos a Claude en caso de no existir.
        this.http.get<any[]>(`${API_URL}/admin/auth/users`).subscribe({
            next: (res) => this.users.set(res || []),
            error: (err) => {
                console.warn('Error cargando usuarios, intentando ruta alternativa', err);
                // Fallback or handle later
            }
        });
    }

    openCreate() {
        this.newUser.set({ email: '', name: '', role: 'client', location: 'NIRM GROUP - Sede Principal' });
        this.showModal.set(true);
    }

    saveUser() {
        const payload = this.newUser();
        if (!payload.email) {
            alert("El correo electrónico es obligatorio para enviar la invitación.");
            return;
        }
        // Simulando que el backend se encarga de crear el estatus en Pending
        this.http.post(`${API_URL}/admin/auth/users/invite`, payload).subscribe({
            next: () => {
                alert('Invitación enviada con éxito');
                this.showModal.set(false);
                this.loadUsers();
            },
            error: (err) => alert('Error enviando invitación: ' + (err.error?.message || err.message))
        });
    }

    deleteUser(id: string) {
        if (confirm('¿Seguro que deseas eliminar este usuario?')) {
            this.http.delete(`${API_URL}/admin/auth/users/${id}`).subscribe({
                next: () => this.loadUsers(),
                error: (err) => alert('Error eliminando usuario: ' + (err.error?.message || err.message))
            });
        }
    }
}
