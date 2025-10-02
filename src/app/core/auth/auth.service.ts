import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, delay, of, tap, throwError } from 'rxjs';
import { toObservable } from '@angular/core/rxjs-interop';
import { NotificationService } from '../notifications/notification.service';

const AUTH_STORAGE_KEY = 'budget19.auth.session';

export type AuthStatus = 'signed-out' | 'pending' | 'signed-in';

export interface AuthUser {
  id: string;
  email: string;
  displayName?: string;
  roles: string[];
}

export interface AuthState {
  status: AuthStatus;
  token: string | null;
  user: AuthUser | null;
  lastError: string | null;
}

export interface LoginPayload {
  email: string;
  password: string;
  remember?: boolean;
}

export interface AuthResult {
  token: string;
  user: AuthUser;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly notifications = inject(NotificationService);

  private readonly stateSignal = signal<AuthState>({
    status: 'signed-out',
    token: null,
    user: null,
    lastError: null,
  });

  readonly state = this.stateSignal.asReadonly();
  readonly status = computed(() => this.stateSignal().status);
  readonly isAuthenticated = computed(() => this.stateSignal().status === 'signed-in');
  readonly isLoading = computed(() => this.stateSignal().status === 'pending');
  readonly currentUser = computed(() => this.stateSignal().user);
  readonly token = computed(() => this.stateSignal().token);

  readonly status$ = toObservable(this.status);
  readonly isAuthenticated$ = toObservable(this.isAuthenticated);
  readonly currentUser$ = toObservable(this.currentUser);

  login(payload: LoginPayload): Observable<AuthResult> {
    this.updateStatus('pending');

    const remember = payload.remember ?? true;

    const simulation$ = of<AuthResult>({
      token: this.createMockToken(payload.email),
      user: {
        id: this.createRandomId(),
        email: payload.email,
        displayName: payload.email.split('@')[0],
        roles: ['user'],
      },
    }).pipe(delay(650));

    const request$ = this.http.post<AuthResult>('/api/auth/login', payload).pipe(
      tap((result) => this.handleLoginSuccess(result, remember)),
      catchError((error) => {
        console.warn('Auth API non disponible, utilisation d’une réponse simulée.', error);
        return simulation$.pipe(tap((result) => this.handleLoginSuccess(result, remember)));
      }),
    );

    return request$.pipe(
      catchError((error) => {
        this.handleLoginError();
        return throwError(() => error);
      }),
    );
  }

  logout(options: { silent?: boolean } = {}): void {
    this.clearPersistedSession();
    this.stateSignal.set({
      status: 'signed-out',
      token: null,
      user: null,
      lastError: null,
    });
    if (!options.silent) {
      this.notifications.info('Vous êtes déconnecté(e).');
    }
  }

  restoreSession(): void {
    const restored = this.readPersistedSession();
    if (!restored) {
      return;
    }

    this.stateSignal.set({
      status: 'signed-in',
      token: restored.token,
      user: restored.user,
      lastError: null,
    });
  }

  getTokenSnapshot(): string | null {
    return this.stateSignal().token;
  }

  private handleLoginSuccess(result: AuthResult, remember: boolean): void {
    this.persistSession(result, remember);
    this.stateSignal.set({
      status: 'signed-in',
      token: result.token,
      user: result.user,
      lastError: null,
    });
    this.notifications.success('Connexion réussie.');
  }

  private handleLoginError(): void {
    this.stateSignal.set({
      status: 'signed-out',
      token: null,
      user: null,
      lastError: 'LOGIN_FAILED',
    });
    this.notifications.error(
      "Une erreur est survenue lors de la tentative de connexion.",
    );
  }

  private updateStatus(status: AuthStatus): void {
    this.stateSignal.update((current) => ({
      ...current,
      status,
    }));
  }

  private persistSession(result: AuthResult, remember: boolean): void {
    if (!remember) {
      return;
    }

    const storage = this.getStorage();
    if (!storage) {
      return;
    }

    storage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({
        token: result.token,
        user: result.user,
      }),
    );
  }

  private readPersistedSession(): AuthResult | null {
    const storage = this.getStorage();
    if (!storage) {
      return null;
    }

    const raw = storage.getItem(AUTH_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as AuthResult;
      if (!parsed.token || !parsed.user) {
        return null;
      }
      return parsed;
    } catch (error) {
      console.warn('Session de connexion invalide, purge…', error);
      storage.removeItem(AUTH_STORAGE_KEY);
      return null;
    }
  }

  private clearPersistedSession(): void {
    const storage = this.getStorage();
    if (!storage) {
      return;
    }

    storage.removeItem(AUTH_STORAGE_KEY);
  }

  private getStorage(): Storage | null {
    if (typeof window === 'undefined') {
      return null;
    }

    try {
      return window.localStorage;
    } catch {
      return null;
    }
  }

  private createRandomId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }

    return `user_${Math.random().toString(36).slice(2, 11)}`;
  }

  private createMockToken(email: string): string {
    return btoa(`${email}:${Date.now()}`);
  }
}
