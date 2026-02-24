import { Component, inject } from '@angular/core';
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
    title = 'MotorControlEnterprise';
    router = inject(Router);

    isLoggedIn(): boolean {
        return !!localStorage.getItem('motor_control_token');
    }

    showSidebar(): boolean {
        // No mostrar sidebar en landing ni en login, aunque tenga token
        const noSidebarRoutes = ['/', '/login'];
        return this.isLoggedIn() && !noSidebarRoutes.includes(this.router.url);
    }
}
