import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, throwError } from 'rxjs';
import { NotificationService } from '../notifications/notification.service';

export type BudgetPeriod = 'monthly' | 'quarterly' | 'yearly' | 'custom' | string;

export interface BudgetCategory {
  id: string;
  name: string;
  allocated: number;
  spent?: number;
  color?: string;
}

export interface Budget {
  id: string;
  name: string;
  amount: number;
  period?: BudgetPeriod;
  spent?: number;
  startDate?: string | null;
  endDate?: string | null;
  description?: string | null;
  categories?: BudgetCategory[];
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateBudgetPayload {
  name: string;
  amount: number;
  period: BudgetPeriod;
  startDate?: string | null;
  endDate?: string | null;
  description?: string | null;
  categories?: BudgetCategory[];
}

export type UpdateBudgetPayload = Partial<CreateBudgetPayload>;

@Injectable({
  providedIn: 'root',
})
export class BudgetService {
  private readonly http = inject(HttpClient);
  private readonly notifications = inject(NotificationService);

  private readonly baseUrl = '/api/budgets';

  list(): Observable<Budget[]> {
    return this.http.get<Budget[]>(this.baseUrl).pipe(
      catchError((error) =>
        this.handleError(
          'Impossible de charger les budgets. Veuillez réessayer plus tard.',
          error,
        ),
      ),
    );
  }

  getById(id: string): Observable<Budget> {
    const normalizedId = id?.trim();
    if (!normalizedId) {
      return this.handleError(
        'Impossible de récupérer le budget demandé.',
        new Error('Identifiant de budget manquant.'),
      );
    }

    return this.http
      .get<Budget>(`${this.baseUrl}/${encodeURIComponent(normalizedId)}`)
      .pipe(
        catchError((error) =>
          this.handleError(
            'Impossible de récupérer le budget demandé.',
            error,
          ),
        ),
      );
  }

  create(payload: CreateBudgetPayload): Observable<Budget> {
    const body = this.sanitizePayload({
      ...payload,
      name: payload.name.trim(),
      description:
        payload.description?.trim() ?? (payload.description ?? null),
    });

    return this.http.post<Budget>(this.baseUrl, body).pipe(
      catchError((error) =>
        this.handleError('Impossible de créer le budget.', error),
      ),
    );
  }

  update(id: string, payload: UpdateBudgetPayload): Observable<Budget> {
    const normalizedId = id?.trim();
    if (!normalizedId) {
      return this.handleError(
        'Impossible de mettre à jour le budget.',
        new Error('Identifiant de budget manquant.'),
      );
    }

    const body = this.sanitizePayload({
      ...payload,
      name: payload.name ? payload.name.trim() : payload.name,
      description:
        payload.description?.trim() ?? (payload.description ?? null),
    });

    return this.http
      .put<Budget>(`${this.baseUrl}/${encodeURIComponent(normalizedId)}`, body)
      .pipe(
        catchError((error) =>
          this.handleError(
            'Impossible de mettre à jour le budget.',
            error,
          ),
        ),
      );
  }

  private handleError(message: string, error: unknown): Observable<never> {
    console.error(message, error);
    this.notifications.error(message);

    const normalizedError =
      error instanceof Error ? error : new Error(message);
    return throwError(() => normalizedError);
  }

  private sanitizePayload<T extends Record<string, unknown>>(payload: T): T {
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(payload)) {
      if (value === undefined) {
        continue;
      }
      sanitized[key] = value;
    }

    return sanitized as T;
  }
}
