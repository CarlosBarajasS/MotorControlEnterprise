import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-client-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  template: `
    <div class="login-container">
      <div class="login-card">
        <div class="login-header">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#93c5fd" stroke-width="1.5">
            <path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/>
          </svg>
          <h1>Portal de Monitoreo</h1>
          <p>Accede a tus cámaras y grabaciones</p>
        </div>

        <div class="alert error" *ngIf="error()">{{ error() }}</div>

        <form (ngSubmit)="onLogin()">
          <div class="form-group">
            <label>Correo electrónico</label>
            <input type="email" [(ngModel)]="email" name="email" placeholder="usuario@empresa.com" autocomplete="email">
          </div>
          <div class="form-group">
            <label>Contraseña</label>
            <input type="password" [(ngModel)]="password" name="password" placeholder="••••••••" autocomplete="current-password">
          </div>
          <button type="submit" class="btn-login" [disabled]="loading()">
            {{ loading() ? 'Verificando...' : 'Iniciar Sesión' }}
          </button>
        </form>

        <div class="login-footer">
          <a routerLink="/login">¿Eres administrador? →</a>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .login-container {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      background:
        radial-gradient(ellipse at 20% 50%, rgba(37,99,235,0.15), transparent 50%),
        radial-gradient(ellipse at 80% 20%, rgba(99,102,241,0.1), transparent 50%),
        #060a14;
      font-family: 'IBM Plex Sans', sans-serif;
    }
    .login-card {
      background: rgba(15,23,42,0.8);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 20px;
      padding: 48px 40px;
      width: 100%;
      max-width: 420px;
      backdrop-filter: blur(20px);
      box-shadow: 0 24px 48px rgba(0,0,0,0.4);
    }
    .login-header {
      text-align: center;
      margin-bottom: 32px;
      svg { margin-bottom: 16px; }
      h1 { color: #f1f5f9; font-size: 1.5rem; margin: 0 0 6px; font-family: 'Space Grotesk', sans-serif; }
      p { color: rgba(248,250,252,0.5); font-size: 14px; margin: 0; }
    }
    .form-group {
      margin-bottom: 20px;
      label {
        display: block; margin-bottom: 6px;
        font-size: 13px; font-weight: 600; color: rgba(248,250,252,0.7);
      }
      input {
        width: 100%; padding: 12px 16px;
        background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
        border-radius: 10px; color: #f1f5f9;
        font-size: 15px; font-family: inherit;
        transition: border-color 0.2s;
        &:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.15); }
        &::placeholder { color: rgba(248,250,252,0.3); }
      }
    }
    .btn-login {
      width: 100%; padding: 13px;
      background: #2563eb; color: #fff;
      border: none; border-radius: 10px;
      font-weight: 600; font-size: 15px;
      cursor: pointer; transition: background 0.2s;
      &:hover:not(:disabled) { background: #1d4ed8; }
      &:disabled { opacity: 0.6; cursor: not-allowed; }
    }
    .alert.error {
      background: rgba(239,68,68,0.1);
      border: 1px solid rgba(239,68,68,0.3);
      color: #fca5a5;
      padding: 12px 16px;
      border-radius: 10px;
      font-size: 13px;
      margin-bottom: 20px;
    }
    .login-footer {
      text-align: center;
      margin-top: 24px;
      a {
        color: rgba(248,250,252,0.5); font-size: 13px; text-decoration: none;
        &:hover { color: #93c5fd; }
      }
    }
  `]
})
export class ClientLoginComponent {
  private http = inject(HttpClient);
  private router = inject(Router);

  email = '';
  password = '';
  error = signal('');
  loading = signal(false);

  constructor() {
    // If already logged in as client, redirect
    const token = localStorage.getItem('motor_control_token');
    if (token) {
      try {
        const p = JSON.parse(atob(token.split('.')[1]));
        if (p.role === 'client') this.router.navigate(['/client/cameras']);
        else if (p.role === 'admin') this.router.navigate(['/dashboard']);
      } catch { }
    }
  }

  onLogin() {
    this.error.set('');
    this.loading.set(true);

    this.http.post<any>('/api/auth/login', {
      email: this.email,
      password: this.password
    }).subscribe({
      next: (res) => {
        if (res.token) {
          localStorage.setItem('motor_control_token', res.token);
          if (res.mustChangePassword) {
            localStorage.setItem('motor_control_client_must_change', 'true');
            this.router.navigate(['/client/change-password']);
          } else {
            localStorage.setItem('motor_control_client_must_change', 'false');
            this.router.navigate(['/client/cameras']);
          }
        } else {
          this.error.set('Respuesta inesperada del servidor');
        }
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.error || err.error?.message || 'Credenciales inválidas');
        this.loading.set(false);
      }
    });
  }
}
