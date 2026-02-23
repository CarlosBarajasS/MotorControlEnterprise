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
        password: '',
        name: '',
        role: 'client'
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
        this.newUser.set({ email: '', password: '', name: '', role: 'client' });
        this.showModal.set(true);
    }

    saveUser() {
        const payload = this.newUser();
        if (!payload.email || !payload.password || !payload.name) {
            alert("Llenar todos los campos requerido");
            return;
        }
        this.http.post(`${API_URL}/admin/auth/users`, payload).subscribe({
            next: () => {
                alert('Usuario creado con éxito');
                this.showModal.set(false);
                this.loadUsers();
            },
            error: (err) => alert('Error creando usuario: ' + (err.error?.message || err.message))
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
