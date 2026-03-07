import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';

@Component({
  selector: 'app-client-account',
  standalone: true,
  imports: [CommonModule, DatePipe],
  template: `
    <div class="account-page">

      @if (loading()) {
        <div class="skeleton-wrap">
          <div class="skeleton skeleton-hero"></div>
          <div class="skeleton-cards">
            <div class="skeleton skeleton-card"></div>
            <div class="skeleton skeleton-card"></div>
            <div class="skeleton skeleton-card"></div>
          </div>
        </div>
      } @else if (error()) {
        <div class="error-state">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <p>{{ error() }}</p>
          <button class="btn-retry" (click)="loadProfile()">Reintentar</button>
        </div>
      } @else if (client()) {

        <!-- Profile Hero -->
        <div class="profile-hero">
          <div class="avatar">{{ initials() }}</div>
          <div class="profile-info">
            <h1>{{ client()!.name }}</h1>
            <span class="status-badge" [ngClass]="client()!.status">{{ statusLabel() }}</span>
            <p class="meta">{{ client()!.businessType }} · Miembro desde {{ client()!.createdAt | date:'MMMM yyyy' }}</p>
          </div>
        </div>

        <!-- Cards Grid -->
        <div class="cards-grid">

          <!-- Contacto -->
          <div class="info-card">
            <h3 class="card-title">Contacto</h3>
            <div class="card-rows">
              <div class="card-row">
                <span class="row-label">Nombre</span>
                <span class="row-value">{{ client()!.contactName || '—' }}</span>
              </div>
              <div class="card-row">
                <span class="row-label">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.18h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.72a16 16 0 0 0 6.37 6.37l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7a2 2 0 0 1 1.72 2.02z"/>
                  </svg>
                  Teléfono
                </span>
                <span class="row-value">{{ client()!.contactPhone || '—' }}</span>
              </div>
              <div class="card-row">
                <span class="row-label">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                    <polyline points="22,6 12,13 2,6"/>
                  </svg>
                  Email
                </span>
                <span class="row-value">{{ client()!.contactEmail || '—' }}</span>
              </div>
            </div>
          </div>

          <!-- Plan & Almacenamiento -->
          <div class="info-card">
            <h3 class="card-title">Plan &amp; Almacenamiento</h3>
            <div class="card-rows">
              <div class="card-row">
                <span class="row-label">Nube</span>
                <span class="row-value">
                  @if (client()!.cloudStorageActive) {
                    <span class="badge badge-green">Activo</span>
                  } @else {
                    <span class="badge badge-red">Sin nube</span>
                  }
                </span>
              </div>
              <div class="card-row">
                <span class="row-label">Almacenamiento local</span>
                <span class="row-value">
                  {{ client()!.localStorageType || '—' }}
                  @if (client()!.nvrBrand) {
                    <span class="row-sub">{{ client()!.nvrBrand }}</span>
                  }
                </span>
              </div>
              <div class="card-row">
                <span class="row-label">Cámaras</span>
                <span class="row-value">{{ cameras().length }} asignadas</span>
              </div>
            </div>
          </div>

          <!-- Ubicación -->
          <div class="info-card">
            <h3 class="card-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="vertical-align: middle; margin-right: 6px;">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
              Ubicación
            </h3>
            <div class="card-rows">
              <div class="card-row">
                <span class="row-label">Ciudad</span>
                <span class="row-value">{{ client()!.city || '—' }}</span>
              </div>
              <div class="card-row">
                <span class="row-label">Estado</span>
                <span class="row-value">{{ client()!.state || '—' }}</span>
              </div>
              <div class="card-row">
                <span class="row-label">País</span>
                <span class="row-value">{{ client()!.country || '—' }}</span>
              </div>
            </div>
          </div>

        </div>

        <!-- Actions -->
        <div class="account-actions">
          <button class="btn-action" (click)="changePassword()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            Cambiar Contraseña
          </button>
          <button class="btn-action btn-danger" (click)="logout()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>
            </svg>
            Cerrar Sesión
          </button>
        </div>

      }
    </div>
  `,
  styles: [`
    .account-page {
      max-width: 960px;
      margin: 0 auto;
    }

    /* SKELETON */
    .skeleton-wrap { display: flex; flex-direction: column; gap: 24px; }
    .skeleton { background: linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%); background-size: 200% 100%; animation: shimmer 1.4s infinite; border-radius: 16px; }
    .skeleton-hero { height: 120px; }
    .skeleton-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
    .skeleton-card { height: 180px; }
    @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

    /* ERROR */
    .error-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      padding: 64px 24px;
      color: rgba(248,250,252,0.5);
      font-size: 14px;
    }
    .btn-retry {
      background: rgba(59,130,246,0.15);
      border: 1px solid rgba(59,130,246,0.3);
      color: #93c5fd;
      padding: 8px 20px;
      border-radius: 8px;
      font-size: 13px;
      cursor: pointer;
      transition: all 0.15s;
      &:hover { background: rgba(59,130,246,0.25); }
    }

    /* PROFILE HERO */
    .profile-hero {
      display: flex;
      align-items: center;
      gap: 24px;
      margin-bottom: 32px;
      padding: 28px;
      background: rgba(15,23,42,0.6);
      border: 1px solid rgba(255,255,255,0.07);
      border-radius: 16px;
    }
    .avatar {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      background: linear-gradient(135deg, #2563eb, #1d4ed8);
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Space Grotesk', 'IBM Plex Sans', sans-serif;
      font-weight: 700;
      font-size: 28px;
      color: white;
      flex-shrink: 0;
      letter-spacing: 1px;
    }
    .profile-info {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .profile-info h1 {
      font-size: 22px;
      font-weight: 700;
      color: #f1f5f9;
      margin: 0;
    }
    .meta {
      font-size: 13px;
      color: rgba(248,250,252,0.45);
      margin: 0;
    }

    /* STATUS BADGES */
    .status-badge {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.4px;
      width: fit-content;
    }
    .status-badge.active {
      background: rgba(16,185,129,0.15);
      color: #34d399;
      border: 1px solid rgba(16,185,129,0.3);
    }
    .status-badge.inactive, .status-badge.suspended {
      background: rgba(239,68,68,0.15);
      color: #fca5a5;
      border: 1px solid rgba(239,68,68,0.3);
    }
    .status-badge.pending {
      background: rgba(245,158,11,0.15);
      color: #fcd34d;
      border: 1px solid rgba(245,158,11,0.3);
    }

    /* CARDS GRID */
    .cards-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      margin-bottom: 32px;
    }
    .info-card {
      background: rgba(15,23,42,0.6);
      border: 1px solid rgba(255,255,255,0.07);
      border-radius: 16px;
      padding: 24px;
    }
    .card-title {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: rgba(248,250,252,0.45);
      font-weight: 600;
      margin: 0 0 16px 0;
    }
    .card-rows {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .card-row {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .row-label {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: rgba(248,250,252,0.45);
      font-weight: 500;
      svg { opacity: 0.7; }
    }
    .row-value {
      font-size: 15px;
      font-weight: 600;
      color: #f1f5f9;
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .row-sub {
      font-size: 12px;
      font-weight: 400;
      color: rgba(248,250,252,0.5);
    }

    /* INLINE BADGES */
    .badge {
      display: inline-block;
      padding: 2px 10px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
    }
    .badge-green {
      background: rgba(16,185,129,0.15);
      color: #34d399;
      border: 1px solid rgba(16,185,129,0.3);
    }
    .badge-red {
      background: rgba(239,68,68,0.15);
      color: #fca5a5;
      border: 1px solid rgba(239,68,68,0.3);
    }

    /* ACTIONS */
    .account-actions {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }
    .btn-action {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 20px;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
      background: rgba(59,130,246,0.12);
      border: 1px solid rgba(59,130,246,0.25);
      color: #93c5fd;
      &:hover { background: rgba(59,130,246,0.22); border-color: rgba(59,130,246,0.45); }
    }
    .btn-action.btn-danger {
      background: transparent;
      border: 1px solid rgba(255,255,255,0.1);
      color: rgba(248,250,252,0.6);
      &:hover { background: rgba(239,68,68,0.15); color: #fca5a5; border-color: rgba(239,68,68,0.3); }
    }

    /* RESPONSIVE */
    @media (max-width: 900px) {
      .cards-grid { grid-template-columns: repeat(2, 1fr); }
      .skeleton-cards { grid-template-columns: repeat(2, 1fr); }
    }
    @media (max-width: 560px) {
      .profile-hero { flex-direction: column; align-items: flex-start; gap: 16px; padding: 20px; }
      .cards-grid { grid-template-columns: 1fr; }
      .skeleton-cards { grid-template-columns: 1fr; }
    }
  `]
})
export class ClientAccountComponent implements OnInit {
  private http = inject(HttpClient);
  private router = inject(Router);

  client = signal<any>(null);
  cameras = signal<any[]>([]);
  loading = signal(true);
  error = signal('');

  initials = computed(() => {
    const name = this.client()?.name || '';
    return name.split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase() || '?';
  });

  statusLabel = computed(() => {
    const statusMap: Record<string, string> = {
      active: 'Activo',
      inactive: 'Inactivo',
      suspended: 'Suspendido',
      pending: 'Pendiente',
    };
    return statusMap[this.client()?.status] ?? this.client()?.status ?? '';
  });

  ngOnInit() {
    this.loadProfile();
  }

  loadProfile() {
    this.loading.set(true);
    this.error.set('');

    const token = localStorage.getItem('motor_control_token');
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });

    this.http.get<any>('/api/client/me', { headers }).subscribe({
      next: (data) => {
        this.client.set(data);
        this.cameras.set(data.cameras ?? []);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.message || 'No se pudo cargar el perfil.');
        this.loading.set(false);
      }
    });
  }

  changePassword() {
    this.router.navigate(['/client/change-password']);
  }

  logout() {
    localStorage.removeItem('motor_control_token');
    this.router.navigate(['/client/login']);
  }
}
