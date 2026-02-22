import { Routes } from '@angular/router';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { Dashboard } from './components/dashboard/dashboard';

const authGuard = () => {
    const token = localStorage.getItem('motor_control_token');
    if (token) return true;
    inject(Router).navigate(['/login']);
    return false;
};

export const routes: Routes = [
    { path: '',          redirectTo: 'dashboard', pathMatch: 'full' },
    { path: 'login',     component: LoginComponent },
    { path: 'dashboard', component: Dashboard, canActivate: [authGuard] },
    { path: '**',        redirectTo: 'login' }
];
