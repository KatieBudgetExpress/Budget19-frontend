import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { NotificationService } from '../notifications/notification.service';

export const authGuard: CanActivateFn = (_route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const notifications = inject(NotificationService);

  if (!authService.isAuthenticated()) {
    authService.restoreSession();
  }

  if (authService.isAuthenticated()) {
    return true;
  }

  notifications.warning('Veuillez vous connecter pour accéder à cette page protégée.');

  if (state.url && state.url !== '/auth/login') {
    return router.createUrlTree(['/auth/login'], {
      queryParams: { redirectTo: state.url },
    });
  }

  return router.createUrlTree(['/auth/login']);
};
