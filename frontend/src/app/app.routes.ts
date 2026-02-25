import { Routes } from '@angular/router';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { LandingComponent } from './components/landing/landing.component';
import { WizardComponent } from './components/wizard/wizard.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { GatewaysComponent } from './components/gateways/gateways.component';
import { ClientsComponent } from './components/clients/clients.component';
import { ClientDetailComponent } from './components/client-detail/client-detail.component';
import { CamerasComponent } from './components/cameras/cameras.component';
import { CameraDetailComponent } from './components/cameras/camera-detail.component';
import { MotorsComponent } from './components/motors/motors.component';
import { RecordingsComponent } from './components/recordings/recordings.component';
import { UsersComponent } from './components/users/users.component';
import { TelemetryHistoryComponent } from './components/telemetry-history/telemetry-history.component';

// Client Portal
import { ClientLoginComponent } from './components/client-portal/client-login.component';
import { ClientShellComponent } from './components/client-portal/client-shell.component';
import { ClientCamerasComponent } from './components/client-portal/client-cameras.component';
import { ClientCameraDetailComponent } from './components/client-portal/client-camera-detail.component';
import { ClientRecordingsComponent } from './components/client-portal/client-recordings.component';
import { clientAuthGuard } from './guards/client-auth.guard';

const adminAuthGuard = () => {
    const token = localStorage.getItem('motor_control_token');
    if (!token) {
        inject(Router).navigate(['/login']);
        return false;
    }
    // If client role, redirect to client portal
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.role === 'client') {
            inject(Router).navigate(['/client/cameras']);
            return false;
        }
    } catch { }
    return true;
};

export const routes: Routes = [
    { path: '', component: LandingComponent, pathMatch: 'full' },
    { path: 'login', component: LoginComponent },

    // Admin routes
    { path: 'dashboard', component: DashboardComponent, canActivate: [adminAuthGuard] },
    { path: 'gateways', component: GatewaysComponent, canActivate: [adminAuthGuard] },
    { path: 'clients', component: ClientsComponent, canActivate: [adminAuthGuard] },
    { path: 'clients/:id', component: ClientDetailComponent, canActivate: [adminAuthGuard] },
    { path: 'cameras', component: CamerasComponent, canActivate: [adminAuthGuard] },
    { path: 'cameras/:id', component: CameraDetailComponent, canActivate: [adminAuthGuard] },
    { path: 'recordings', component: RecordingsComponent, canActivate: [adminAuthGuard] },
    { path: 'recordings/:id', component: RecordingsComponent, canActivate: [adminAuthGuard] },
    { path: 'motors', component: MotorsComponent, canActivate: [adminAuthGuard] },
    { path: 'users', component: UsersComponent, canActivate: [adminAuthGuard] },
    { path: 'telemetry-history', component: TelemetryHistoryComponent, canActivate: [adminAuthGuard] },
    { path: 'wizard', component: WizardComponent, canActivate: [adminAuthGuard] },

    // Client Portal routes
    {
        path: 'client',
        children: [
            { path: 'login', component: ClientLoginComponent },
            {
                path: '',
                component: ClientShellComponent,
                canActivate: [clientAuthGuard],
                children: [
                    { path: 'cameras', component: ClientCamerasComponent },
                    { path: 'cameras/:id', component: ClientCameraDetailComponent },
                    { path: 'recordings', component: ClientRecordingsComponent },
                    { path: 'recordings/:id', component: ClientRecordingsComponent },
                    { path: '', redirectTo: 'cameras', pathMatch: 'full' }
                ]
            }
        ]
    },

    { path: '**', redirectTo: 'dashboard' }
];
