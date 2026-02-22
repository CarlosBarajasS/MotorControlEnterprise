import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { importProvidersFrom } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { NgChartsModule } from 'ng2-charts';
import { routes } from './app.routes';
import { authInterceptor } from './interceptors/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    importProvidersFrom(NgChartsModule),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor]))
  ]
};
