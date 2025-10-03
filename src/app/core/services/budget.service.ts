import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, delay, finalize, map, of, tap } from 'rxjs';
import { NotificationService } from '../notifications/notification.service';

export type BudgetPeriod = 'monthly' | 'quarterly' | 'yearly';
export type BudgetStatus = 'on-track' | 'at-risk' | 'over-budget';

export interface BudgetAlert {
  id: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  createdAt: string;
}

export interface BudgetTransaction {
  id: string;
  date: string;
  label: string;
  amount: number;
  type: 'expense' | 'income' | 'adjustment';
  category?: string;
  notes?: string;
}

export interface BudgetCategory {
  id: string;
  name: string;
  allocation?: number;
  allocated?: number;
  spent?: number;
}

export interface Budget {
  id: string;
  name: string;
  description?: string;
  category: string;
  categories?: BudgetCategory[];
  period: BudgetPeriod;
  currency: string;
  amount: number;
  spent: number;
  startDate: string;
  endDate?: string | null;
  ownerId: string;
  status: BudgetStatus;
  createdAt?: string;
  updatedAt?: string;
  alerts?: BudgetAlert[];
  transactions?: BudgetTransaction[];
}

export interface UpdateBudgetPayload {
  name?: string;
  description?: string;
  amount?: number;
  category?: string;
  categories?: BudgetCategory[];
  startDate?: string;
  endDate?: string | null;
}

export interface CreateBudgetPayload {
  name: string;
  description?: string;
  amount: number;
  category: string;
  categories?: BudgetCategory[];
  startDate: string;
  endDate?: string | null;
}

@Injectable({
  providedIn: 'root',
})
export class BudgetService {
  private readonly http = inject(HttpClient);
  private readonly notifications = inject(NotificationService);

  private readonly budgetsSignal = signal<Budget[]>([]);
  private readonly selectedBudgetSignal = signal<Budget | null>(null);
  private readonly isLoadingSignal = signal(false);
  private readonly errorSignal = signal<string | null>(null);
  private readonly lastUpdatedSignal = signal<number | null>(null);

  private hasShownDemoNotice = false;
  private readonly simulatedBudgets = new Set<string>();

  readonly budgets = this.budgetsSignal.asReadonly();
  readonly selectedBudget = this.selectedBudgetSignal.asReadonly();
  readonly isLoading = computed(() => this.isLoadingSignal());
  readonly error = this.errorSignal.asReadonly();
  readonly lastUpdatedAt = this.lastUpdatedSignal.asReadonly();

  loadBudgets(options: { forceRefresh?: boolean } = {}): Observable<Budget[]> {
    if (!options.forceRefresh && this.lastUpdatedSignal()) {
      this.errorSignal.set(null);
      return of(this.cloneBudgets(this.budgetsSignal()));
    }

    this.setLoading(true);
    this.errorSignal.set(null);

    const simulation$ = of(this.createMockBudgets()).pipe(
      delay(450),
      tap((budgets) => this.handleBudgetsLoaded(budgets, { simulated: true })),
    );

    const request$ = this.http.get<Budget[]>('/api/budgets').pipe(
      tap((budgets) => this.handleBudgetsLoaded(budgets)),
      catchError((error) => {
        console.warn(
          'API Budget indisponible, bascule sur des données simulées.',
          error,
        );
        return simulation$;
      }),
      finalize(() => this.setLoading(false)),
    );

    return request$.pipe(
      tap({
        error: (error) => this.handleGenericError(error),
      }),
    );
  }

  loadBudget(id: string, options: { forceRefresh?: boolean } = {}): Observable<Budget> {
    const cached = this.getBudgetSnapshot(id);
    if (cached && !options.forceRefresh) {
      const normalized = this.normalizeBudget(cached);
      this.errorSignal.set(null);
      this.selectedBudgetSignal.set(normalized);
      return of(normalized);
    }

    this.setLoading(true);
    this.errorSignal.set(null);

    const simulation$ = of(this.createMockBudget(id)).pipe(
      delay(420),
      map((budget) => {
        if (!budget) {
          throw new Error('Budget introuvable.');
        }
        return budget;
      }),
      tap((budget) => this.handleBudgetLoaded(budget, { simulated: true })),
    );

    const request$ = this.http.get<Budget>(`/api/budgets/${id}`).pipe(
      tap((budget) => this.handleBudgetLoaded(budget)),
      catchError((error) => {
        console.warn(
          `Budget ${id} indisponible via l’API, bascule sur des données simulées.`,
          error,
        );
        return simulation$;
      }),
      finalize(() => this.setLoading(false)),
    );

    return request$.pipe(
      tap({
        error: (error) => this.handleBudgetError(error),
      }),
    );
  }

  getById(id: string): Observable<Budget> {
    this.setLoading(true);
    return this.http.get<Budget>(`/api/budgets/${id}`).pipe(
      tap((budget) => this.handleBudgetLoaded(budget)),
      catchError((error) => {
        console.warn(
          `Échec getById(${id}), retour vers un budget simulé.`,
          error,
        );
        const simulated = this.createMockBudget(id);
        if (simulated) {
          this.handleBudgetLoaded(simulated, { simulated: true });
          return of(simulated);
        }
        throw error;
      }),
      finalize(() => this.setLoading(false)),
    );
  }

  create(payload: CreateBudgetPayload): Observable<Budget> {
    this.setLoading(true);
    return this.http.post<Budget>('/api/budgets', payload).pipe(
      tap((budget) => this.handleBudgetLoaded(budget)),
      catchError((error) => {
        this.handleGenericError(error);
        const fallback: Budget = {
          ...payload,
          id: 'new-' + Date.now(),
          spent: 0,
          ownerId: 'user-mock',
          period: payload.startDate ? 'monthly' : 'yearly',
          currency: 'USD',
          status: 'on-track',
        };
        this.handleBudgetLoaded(fallback, { simulated: true });
        return of(fallback);
      }),
      finalize(() => this.setLoading(false)),
    );
  }

  update(id: string, payload: UpdateBudgetPayload): Observable<Budget> {
    this.setLoading(true);
    return this.http.put<Budget>(`/api/budgets/${id}`, payload).pipe(
      tap((budget) => this.handleBudgetLoaded(budget)),
      catchError((error) => {
        this.handleGenericError(error);
        throw error;
      }),
      finalize(() => this.setLoading(false)),
    );
  }

  refreshBudgets(): void {
    this.loadBudgets({ forceRefresh: true }).subscribe({
      next: () => {
        this.notifications.success('Budgets actualisés.');
      },
      error: () => {
        this.notifications.error(
          'Impossible d’actualiser les budgets pour le moment.',
        );
      },
    });
  }

  refreshBudget(id: string): void {
    this.loadBudget(id, { forceRefresh: true }).subscribe({
      next: (budget) => {
        this.notifications.success(`Budget « ${budget.name} » actualisé.`);
      },
      error: () => {
        this.notifications.error(
          'Impossible d’actualiser les informations de ce budget.',
        );
      },
    });
  }

  getBudgetSnapshot(id: string): Budget | undefined {
    const fromCollection = this.budgetsSignal().find((budget) => budget.id === id);
    if (fromCollection) {
      return fromCollection;
    }

    const selected = this.selectedBudgetSignal();
    if (selected && selected.id === id) {
      return selected;
    }

    return undefined;
  }

  private handleBudgetsLoaded(budgets: Budget[], context: { simulated?: boolean } = {}): void {
    const normalized = this.cloneBudgets(budgets);
    this.budgetsSignal.set(normalized);
    this.lastUpdatedSignal.set(Date.now());
    this.errorSignal.set(null);

    const selected = this.selectedBudgetSignal();
    if (selected) {
      const match = normalized.find((budget) => budget.id === selected.id);
      if (match) {
        this.selectedBudgetSignal.set(this.normalizeBudget(match));
      }
    }

    if (context.simulated) {
      if (!this.hasShownDemoNotice) {
        this.notifications.info(
          'Affichage de budgets de démonstration en attendant la connexion à l’API.',
          {
            dismissible: false,
            duration: 6000,
          },
        );
        this.hasShownDemoNotice = true;
      }
    } else {
      this.hasShownDemoNotice = false;
      this.simulatedBudgets.clear();
    }
  }

  private handleBudgetLoaded(budget: Budget, context: { simulated?: boolean } = {}): void {
    const normalized = this.normalizeBudget(budget);
    this.selectedBudgetSignal.set(normalized);
    this.lastUpdatedSignal.set(Date.now());
    this.errorSignal.set(null);

    this.budgetsSignal.update((current) => {
      const next = current.slice();
      const index = next.findIndex((item) => item.id === normalized.id);
      if (index === -1) {
        next.push(normalized);
      } else {
        next[index] = normalized;
      }
      return next;
    });

    if (context.simulated) {
      if (!this.simulatedBudgets.has(normalized.id)) {
        this.simulatedBudgets.add(normalized.id);
        this.notifications.warning(
          `Budget « ${normalized.name} » affiché à partir de données simulées.`,
          { duration: 6000 },
        );
      }
    } else {
      this.simulatedBudgets.delete(normalized.id);
    }
  }

  private handleBudgetError(error: unknown): void {
    const message =
      error instanceof Error && error.message
        ? error.message
        : 'Impossible de charger le budget demandé.';
    this.errorSignal.set(message);
    this.selectedBudgetSignal.set(null);
  }

  private handleGenericError(error: unknown): void {
    const message =
      error instanceof Error && error.message
        ? error.message
        : 'Impossible de charger la liste des budgets.';
    this.errorSignal.set(message);
  }

  private setLoading(isLoading: boolean): void {
    this.isLoadingSignal.set(isLoading);
  }

  private cloneBudgets(budgets: Budget[]): Budget[] {
    return budgets.map((budget) => this.normalizeBudget(budget));
  }

  private normalizeBudget(budget: Budget): Budget {
    return {
      ...budget,
      alerts: budget.alerts?.map((alert) => ({ ...alert })) ?? [],
      transactions:
        budget.transactions?.map((transaction) => ({ ...transaction })) ?? [],
      categories: budget.categories?.map((cat) => ({ ...cat })) ?? [],
      createdAt: budget.createdAt ?? new Date().toISOString(),
      updatedAt: budget.updatedAt ?? new Date().toISOString(),
    };
  }

  private createMockBudgets(): Budget[] {
    return MOCK_BUDGETS.map((budget) => this.normalizeBudget(budget));
  }

  private createMockBudget(id: string): Budget | null {
    const budget = MOCK_BUDGETS.find((item) => item.id === id);
    return budget ? this.normalizeBudget(budget) : null;
  }
}

const MOCK_BUDGETS: Budget[] = [
  {
    id: 'household-2024',
    name: 'Charges du foyer',
    description: 'Logement, énergie et abonnements indispensables pour le foyer.',
    category: 'Habitation',
    period: 'monthly',
    currency: 'EUR',
    amount: 1250,
    spent: 872.4,
    startDate: '2024-01-01T00:00:00.000Z',
    endDate: null,
    ownerId: 'user-001',
    status: 'on-track',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-05-20T12:00:00.000Z',
    alerts: [],
    transactions: [],
    categories: [],
  },
];
