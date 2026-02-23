import { Routes } from '@angular/router';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { LandingComponent } from './components/landing/landing.component';
import { WizardComponent } from './components/wizard/wizard.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { ClientsComponent } from './components/clients/clients.component';
import { ClientDetailComponent } from './components/client-detail/client-detail.component';
import { CamerasComponent } from './components/cameras/cameras.component';
import { CameraDetailComponent } from './components/cameras/camera-detail.component';
import { MotorsComponent } from './components/motors/motors.component';
import { RecordingsComponent } from './components/recordings/recordings.component';
import { UsersComponent } from './components/users/users.component';
import { TelemetryHistoryComponent } from './components/telemetry-history/telemetry-history.component';

const authGuard = () => {
    const token = localStorage.getItem('motor_control_token');
    if (token) return true;
    inject(Router).navigate(['/login']);
    return false;
};

export const routes: Routes = [
    { path: '', component: LandingComponent, pathMatch: 'full' },
    { path: 'login', component: LoginComponent },
    { path: 'dashboard', component: DashboardComponent, canActivate: [authGuard] },
    { path: 'clients', component: ClientsComponent, canActivate: [authGuard] },
    { path: 'clients/:id', component: ClientDetailComponent, canActivate: [authGuard] },
    { path: 'cameras', component: CamerasComponent, canActivate: [authGuard] },
    { path: 'cameras/:id', component: CameraDetailComponent, canActivate: [authGuard] },
    { path: 'recordings/:id', component: RecordingsComponent, canActivate: [authGuard] },
    { path: 'motors', component: MotorsComponent, canActivate: [authGuard] },
    { path: 'users', component: UsersComponent, canActivate: [authGuard] },
    { path: 'telemetry-history', component: TelemetryHistoryComponent, canActivate: [authGuard] },
    { path: 'wizard', component: WizardComponent, canActivate: [authGuard] },
    { path: '**', redirectTo: 'dashboard' }
];
