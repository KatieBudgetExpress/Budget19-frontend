import { ApplicationConfig, provideZoneChangeDetection, DEFAULT_CURRENCY_CODE } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { appRoutes } from './app.routes';
import { loggingInterceptor } from './core/interceptors/logging.interceptor';
import { authTokenInterceptor } from './core/interceptors/auth-token.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(appRoutes, withComponentInputBinding()),
    provideAnimations(),
    provideHttpClient(
      withFetch(),
      withInterceptors([loggingInterceptor, authTokenInterceptor]),
    ),
    { provide: DEFAULT_CURRENCY_CODE, useValue: 'CAD' } // 👈 Devise par défaut
  ],
};
