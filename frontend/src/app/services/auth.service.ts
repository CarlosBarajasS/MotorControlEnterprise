import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { Router } from '@angular/router';

@Injectable({
    providedIn: 'root'
})
export class AuthService {
    private http = inject(HttpClient);
    private router = inject(Router);
    private apiUrl = '/api/admin/auth';
    private tokenKey = 'motor_control_token';

    login(credentials: any): Observable<any> {
        return this.http.post<any>(`${this.apiUrl}/login`, credentials).pipe(
            tap(res => {
                if (res.token) {
                    localStorage.setItem(this.tokenKey, res.token);
                    this.router.navigate(['/dashboard']);
                }
            })
        );
    }

    logout() {
        localStorage.removeItem(this.tokenKey);
        this.router.navigate(['/login']);
    }

    getToken(): string | null {
        return localStorage.getItem(this.tokenKey);
    }

    isLoggedIn(): boolean {
        return !!this.getToken();
    }
}
