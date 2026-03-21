import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
    selector: 'app-login',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, RouterModule],
    templateUrl: './login.component.html',
    styleUrls: ['./login.component.scss']
})
export class LoginComponent {
    loginForm: FormGroup;
    loading = false;
    errorMsg = '';
    showPassword = false;

    private fb = inject(FormBuilder);
    private authService = inject(AuthService);
    private router = inject(Router);

    constructor() {
        this.loginForm = this.fb.group({
            email: ['', [Validators.required, Validators.email]],
            password: ['', Validators.required]
        });

        // Redirigir si ya hay sesión activa
        const token = localStorage.getItem('motor_control_token');
        if (token) {
            try {
                const payload = JSON.parse(atob(token.split('.')[1]));
                if (payload.role === 'client') {
                    this.router.navigate(['/client/cameras']);
                } else if (payload.role === 'admin' || payload.role === 'installer') {
                    this.router.navigate(['/dashboard']);
                }
            } catch { }
        }
    }

    togglePassword() {
        this.showPassword = !this.showPassword;
    }

    onSubmit() {
        if (this.loginForm.invalid) return;

        this.loading = true;
        this.errorMsg = '';

        this.authService.login(this.loginForm.value).subscribe({
            next: (res) => {
                this.loading = false;
                const role = res.user?.role ?? res.role;
                if (role === 'client') {
                    localStorage.setItem('motor_control_client_must_change', res.mustChangePassword ? 'true' : 'false');
                    if (res.mustChangePassword) {
                        this.router.navigate(['/client/change-password']);
                    } else {
                        this.router.navigate(['/client/cameras']);
                    }
                } else {
                    localStorage.setItem('motor_control_must_change', res.mustChangePassword ? 'true' : 'false');
                    if (res.mustChangePassword) {
                        this.router.navigate(['/change-password']);
                    } else {
                        this.router.navigate(['/dashboard']);
                    }
                }
            },
            error: (err) => {
                this.loading = false;
                this.errorMsg = err.error?.message || 'Error de conexión / Credenciales inválidas';
            }
        });
    }
}
