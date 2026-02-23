import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
    selector: 'app-sidebar',
    standalone: true,
    imports: [CommonModule, RouterModule],
    templateUrl: './sidebar.component.html',
    styleUrls: ['./sidebar.component.scss']
})
export class SidebarComponent {
    authService = inject(AuthService);

    get userName(): string {
        try {
            const p = JSON.parse(atob(this.authService.getToken()!.split('.')[1]));
            return p.name || p.email || 'Usuario';
        } catch { return 'Usuario'; }
    }

    get userRole(): string {
        try {
            const p = JSON.parse(atob(this.authService.getToken()!.split('.')[1]));
            return p.role === 'admin' ? 'Administrador' : 'Cliente';
        } catch { return ''; }
    }

    logout() { this.authService.logout(); }
}
