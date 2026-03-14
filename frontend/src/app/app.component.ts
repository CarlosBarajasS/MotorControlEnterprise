import { Component, inject, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, Router } from '@angular/router';
import { SidebarComponent } from './components/sidebar/sidebar.component';

@Component({
    selector: 'app-root',
    standalone: true,
    imports: [CommonModule, RouterOutlet, SidebarComponent],
    templateUrl: './app.component.html',
    styleUrl: './app.component.scss'
})
export class AppComponent {
    title = 'NirmGroup';
    router = inject(Router);
    sidebarOpen = false;

    isLoggedIn(): boolean {
        return !!localStorage.getItem('motor_control_token');
    }

    ngOnInit() {
        if (localStorage.getItem('theme') === 'light') {
            document.body.classList.add('theme-light');
        }
    }

    showSidebar(): boolean {
        const url = this.router.url;
        if (!this.isLoggedIn()) return false;
        if (url === '/' || url.startsWith('/login') || url.startsWith('/client/') || url === '/client') return false;
        return true;
    }

    toggleSidebar() {
        this.sidebarOpen = !this.sidebarOpen;
    }

    closeSidebar() {
        this.sidebarOpen = false;
    }

    @HostListener('window:resize')
    onResize() {
        if (window.innerWidth > 768) {
            this.sidebarOpen = false;
        }
    }
}
