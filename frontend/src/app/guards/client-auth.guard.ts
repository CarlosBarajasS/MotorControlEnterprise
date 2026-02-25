import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';

export const clientAuthGuard: CanActivateFn = () => {
    const router = inject(Router);
    const token = localStorage.getItem('motor_control_token');

    if (!token) {
        return router.createUrlTree(['/client/login']);
    }

    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.role === 'admin') {
            return router.createUrlTree(['/dashboard']);
        }

        // CATCH FORCED PASSWORD CHANGE
        const mustChange = localStorage.getItem('motor_control_client_must_change');
        if (mustChange === 'true') {
            return router.createUrlTree(['/client/change-password']);
        }

        return true;
    } catch {
        return router.createUrlTree(['/client/login']);
    }
};
