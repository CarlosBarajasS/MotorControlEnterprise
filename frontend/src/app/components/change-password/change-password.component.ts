import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';

@Component({
  selector: 'app-change-password',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './change-password.component.html',
  styleUrls: ['./change-password.component.scss']
})
export class ChangePasswordComponent {
  private http = inject(HttpClient);
  private router = inject(Router);

  currentPassword = '';
  newPassword = '';
  confirmPassword = '';

  error = signal<string>('');
  loading = signal<boolean>(false);
  success = signal<boolean>(false);

  async onSubmit() {
    this.error.set('');

    if (!this.currentPassword || !this.newPassword || !this.confirmPassword) {
      this.error.set('Por favor, completa todos los campos.');
      return;
    }

    if (this.newPassword.length < 8) {
      this.error.set('La nueva contraseña debe tener al menos 8 caracteres.');
      return;
    }

    if (this.newPassword !== this.confirmPassword) {
      this.error.set('Las contraseñas nuevas no coinciden.');
      return;
    }

    this.loading.set(true);

    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + localStorage.getItem('motor_control_token')
        },
        body: JSON.stringify({
          currentPassword: this.currentPassword,
          newPassword: this.newPassword
        })
      });

      const data = await res.json();
      this.loading.set(false);

      if (!res.ok) {
        this.error.set(data.message || data.error || 'Error al cambiar la contraseña. Verifica tu contraseña actual.');
        return;
      }

      this.success.set(true);

      // Update local storage to clear 'mustChangePassword' requirement
      localStorage.setItem('motor_control_must_change', 'false');

      setTimeout(() => {
        this.router.navigate(['/dashboard']);
      }, 2000);

    } catch (e: any) {
      this.loading.set(false);
      this.error.set('Error de red. Intenta nuevamente.');
    }
  }
}
