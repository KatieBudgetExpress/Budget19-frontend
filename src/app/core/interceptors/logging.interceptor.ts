import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { catchError, tap, throwError } from 'rxjs';

export const loggingInterceptor: HttpInterceptorFn = (request, next) => {
  const startedAt = performance.now();

  return next(request).pipe(
    tap((event) => {
      if (event instanceof HttpResponse) {
        const elapsed = performance.now() - startedAt;
        console.debug(
          `[HTTP] ${request.method} ${request.urlWithParams} → ${event.status} (${elapsed.toFixed(
            0,
          )} ms)`,
        );
      }
    }),
    catchError((error) => {
      const elapsed = performance.now() - startedAt;
      console.error(
        `[HTTP] ${request.method} ${request.urlWithParams} → erreur (${elapsed.toFixed(0)} ms)`,
        error,
      );
      return throwError(() => error);
    }),
  );
};
