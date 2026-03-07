import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-client-shell',
  standalone: true,
  imports: [CommonModule, RouterModule, RouterLink, RouterLinkActive],
  template: `
    <div class="client-app" [class.sidebar-open]="sidebarOpen()">

      <!-- Mobile overlay -->
      @if (sidebarOpen()) {
        <div class="sidebar-overlay" (click)="sidebarOpen.set(false)"></div>
      }

      <!-- TOPBAR -->
      <header class="client-topbar">
        <div class="topbar-left">
          <button class="hamburger" (click)="sidebarOpen.set(!sidebarOpen())" aria-label="Toggle menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <line x1="3" y1="6" x2="21" y2="6"/>
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <div class="brand">
            <div class="brand-icon">m</div>
            <span class="brand-name">NIRM GROUP <strong>Monitor</strong></span>
          </div>
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

      <!-- BODY: sidebar + content -->
      <div class="client-body">

        <!-- SIDEBAR -->
        <aside class="client-sidebar" [class.open]="sidebarOpen()">
          <nav class="sidebar-nav">
            <a class="nav-item"
               routerLink="/client/cameras"
               routerLinkActive="active"
               [routerLinkActiveOptions]="{exact: false}"
               (click)="closeSidebarOnMobile()">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M2 3h20v14H2z M8 21h8 M12 17v4"/>
              </svg>
              <span>Monitor</span>
            </a>
            <a class="nav-item"
               routerLink="/client/recordings"
               routerLinkActive="active"
               [routerLinkActiveOptions]="{exact: false}"
               (click)="closeSidebarOnMobile()">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <circle cx="12" cy="12" r="10"/>
                <polygon points="10,8 16,12 10,16"/>
              </svg>
              <span>Grabaciones</span>
            </a>
            <a class="nav-item"
               routerLink="/client/account"
               routerLinkActive="active"
               [routerLinkActiveOptions]="{exact: false}"
               (click)="closeSidebarOnMobile()">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              <span>Mi Cuenta</span>
            </a>
          </nav>
        </aside>

        <!-- MAIN CONTENT -->
        <main class="client-main">
          <router-outlet></router-outlet>
        </main>

      </div>
    </div>
  `,
  styles: [`
    .client-app {
      height: 100vh;
      overflow: hidden;
      background: var(--bg);
      color: rgba(var(--ink-rgb), 1);
      font-family: 'IBM Plex Sans', sans-serif;
      display: flex;
      flex-direction: column;
    }

    /* TOPBAR */
    .client-topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 20px;
      height: 56px;
      background: rgba(var(--nav-rgb), 0.97);
      border-bottom: 1px solid var(--outline);
      backdrop-filter: blur(12px);
      position: sticky;
      top: 0;
      z-index: 200;
      flex-shrink: 0;
    }
    .topbar-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .hamburger {
      display: none;
      background: transparent;
      border: none;
      color: rgba(248,250,252,0.7);
      cursor: pointer;
      padding: 6px;
      border-radius: 6px;
      transition: background 0.15s;
      &:hover { background: rgba(255,255,255,0.08); }
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .brand-icon {
      width: 28px;
      height: 28px;
      background: linear-gradient(135deg, #3b82f6, #1d4ed8);
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 13px;
      color: white;
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
      color: var(--muted);
    }
    .btn-logout {
      display: flex;
      align-items: center;
      gap: 6px;
      background: transparent;
      border: 1px solid rgba(255,255,255,0.1);
      color: var(--muted);
      padding: 6px 14px;
      border-radius: 8px;
      font-size: 13px;
      cursor: pointer;
      transition: all 0.15s;
      &:hover { background: rgba(239,68,68,0.15); color: #fca5a5; border-color: rgba(239,68,68,0.3); }
    }

    /* BODY LAYOUT */
    .client-body {
      display: flex;
      flex: 1;
      min-height: 0;
    }

    /* SIDEBAR */
    .client-sidebar {
      width: 220px;
      flex-shrink: 0;
      background: rgba(var(--nav-rgb), 0.99);
      border-right: 1px solid var(--outline);
      display: flex;
      flex-direction: column;
      padding: 16px 0;
    }
    .sidebar-nav {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 0 8px;
    }
    .nav-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 14px;
      border-radius: 8px;
      border-left: 3px solid transparent;
      color: var(--muted);
      text-decoration: none;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
      svg { flex-shrink: 0; }
      &:hover {
        background: rgba(255,255,255,0.05);
        color: rgba(248,250,252,0.9);
      }
      &.active {
        background: rgba(37,99,235,0.2);
        border-left-color: #3b82f6;
        color: #93c5fd;
      }
    }

    /* MAIN */
    .client-main {
      flex: 1;
      padding: 24px 28px 48px;
      overflow-y: auto;
      min-width: 0;
    }

    /* OVERLAY */
    .sidebar-overlay {
      display: none;
    }

    /* RESPONSIVE */
    @media (max-width: 768px) {
      .hamburger {
        display: flex;
      }
      .user-greeting {
        display: none;
      }
      .client-sidebar {
        position: fixed;
        top: 56px;
        left: 0;
        bottom: 0;
        z-index: 300;
        transform: translateX(-100%);
        transition: transform 0.25s ease;
        &.open {
          transform: translateX(0);
        }
      }
      .sidebar-overlay {
        display: block;
        position: fixed;
        inset: 56px 0 0 0;
        background: rgba(0,0,0,0.55);
        z-index: 250;
      }
      .client-main {
        padding: 20px 16px 40px;
      }
    }
  `]
})
export class ClientShellComponent {
  private router = inject(Router);

  userName = signal('Cliente');
  sidebarOpen = signal(false);

  constructor() {
    try {
      const token = localStorage.getItem('motor_control_token');
      if (token) {
        const payload = JSON.parse(atob(token.split('.')[1]));
        this.userName.set(payload.name || payload.email || 'Cliente');
      }
    } catch { }
  }

  closeSidebarOnMobile() {
    if (window.innerWidth <= 768) {
      this.sidebarOpen.set(false);
    }
  }

  logout() {
    localStorage.removeItem('motor_control_token');
    this.router.navigate(['/login']);
  }
}
