import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';

@Component({
  selector: 'app-client-shell',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="client-app">
      <header class="client-topbar">
        <div class="brand">
          <div class="brand-icon">m</div>
          <span class="brand-name">NIRM GROUP <strong>Monitor</strong></span>
        </div>
        <div class="topbar-right">
          <span class="user-greeting">{{ userName() }}</span>
          <button class="btn-logout" (click)="logout()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>
            </svg>
            Salir
          </button>
        </div>
      </header>
      <main class="client-main">
        <router-outlet></router-outlet>
      </main>
    </div>
  `,
  styles: [`
    .client-app {
      min-height: 100vh;
      background: #060a14;
      color: #f1f5f9;
      font-family: 'IBM Plex Sans', sans-serif;
    }
    .client-topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 28px;
      background: rgba(15, 23, 42, 0.95);
      border-bottom: 1px solid rgba(255,255,255,0.06);
      backdrop-filter: blur(12px);
      position: sticky;
      top: 0;
      z-index: 100;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .brand-name {
      font-size: 15px;
      color: rgba(248,250,252,0.7);
      strong { color: #f1f5f9; font-weight: 700; }
    }
    .topbar-right {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .user-greeting {
      font-size: 13px;
      color: rgba(248,250,252,0.6);
    }
    .btn-logout {
      display: flex;
      align-items: center;
      gap: 6px;
      background: transparent;
      border: 1px solid rgba(255,255,255,0.1);
      color: rgba(248,250,252,0.7);
      padding: 6px 14px;
      border-radius: 8px;
      font-size: 13px;
      cursor: pointer;
      transition: all 0.15s;
      &:hover { background: rgba(239,68,68,0.15); color: #fca5a5; border-color: rgba(239,68,68,0.3); }
    }
    .client-main {
      padding: 24px 28px 48px;
      max-width: 1440px;
      margin: 0 auto;
    }
  `]
})
export class ClientShellComponent {
  private router = inject(Router);

  userName = signal('Cliente');

  constructor() {
    try {
      const token = localStorage.getItem('motor_control_token');
      if (token) {
        const payload = JSON.parse(atob(token.split('.')[1]));
        this.userName.set(payload.name || payload.email || 'Cliente');
      }
    } catch { }
  }

  logout() {
    localStorage.removeItem('motor_control_token');
    this.router.navigate(['/client/login']);
  }
}
