import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'app-login',
    standalone: true,
    imports: [ReactiveFormsModule, CommonModule],
    templateUrl: './login.component.html',
    styleUrl: './login.component.scss'
})
export class LoginComponent {
    private fb = inject(FormBuilder);
    private authService = inject(AuthService);

    loginForm = this.fb.group({
        email: ['', [Validators.required, Validators.email]],
        password: ['', Validators.required]
    });

    errorMsg = '';
    loading = false;

    onSubmit() {
        if (this.loginForm.invalid) return;

        this.loading = true;
        this.errorMsg = '';

        this.authService.login(this.loginForm.value).subscribe({
            error: (err) => {
                this.errorMsg = 'Credenciales inválidas. Intente de nuevo.';
                this.loading = false;
            }
        });
    }
}
