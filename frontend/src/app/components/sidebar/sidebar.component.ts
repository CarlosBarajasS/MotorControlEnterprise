import { Component, inject, Input, Output, EventEmitter, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../services/auth.service';

@Component({
    selector: 'app-sidebar',
    standalone: true,
    imports: [CommonModule, RouterModule],
    templateUrl: './sidebar.component.html',
    styleUrls: ['./sidebar.component.scss']
})
export class SidebarComponent implements OnInit, OnDestroy {
    @Input() isOpen = false;
    @Output() closeSidebar = new EventEmitter<void>();
    @Output() bellClick = new EventEmitter<void>();

    authService = inject(AuthService);
    private http = inject(HttpClient);

    unreadAlerts = signal(0);
    private alertInterval: any;

    ngOnInit() {
        this.fetchUnreadCount();
        this.alertInterval = setInterval(() => this.fetchUnreadCount(), 30_000);
    }

    ngOnDestroy() {
        clearInterval(this.alertInterval);
    }

    fetchUnreadCount() {
        this.http.get<{ count: number }>('/api/alerts/unread-count').subscribe({
            next: (res) => this.unreadAlerts.set(res.count),
            error: () => {}
        });
    }

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

    isLightMode = document.body.classList.contains('theme-light');

    toggleTheme() {
        this.isLightMode = !this.isLightMode;
        if (this.isLightMode) {
            document.body.classList.add('theme-light');
            localStorage.setItem('theme', 'light');
        } else {
            document.body.classList.remove('theme-light');
            localStorage.setItem('theme', 'dark');
        }
    }

    onNavClick() {
        if (window.innerWidth <= 768) {
            this.closeSidebar.emit();
        }
    }

    logout() { this.authService.logout(); }
}
