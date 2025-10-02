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

export interface Budget {
  id: string;
  name: string;
  description?: string;
  category: string;
  period: BudgetPeriod;
  currency: string;
  amount: number;
  spent: number;
  startDate: string;
  endDate?: string | null;
  ownerId: string;
  status: BudgetStatus;
  alerts?: BudgetAlert[];
  transactions?: BudgetTransaction[];
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
    alerts: [
      {
        id: 'alert-household-01',
        message: 'La facture d’électricité a augmenté de 12 % en mai.',
        severity: 'info',
        createdAt: '2024-05-04T08:30:00.000Z',
      },
    ],
    transactions: [
      {
        id: 'tx-household-001',
        date: '2024-05-02T00:00:00.000Z',
        label: 'Loyer appartement',
        amount: 690,
        type: 'expense',
        category: 'Logement',
      },
      {
        id: 'tx-household-002',
        date: '2024-05-05T00:00:00.000Z',
        label: 'Abonnement internet & TV',
        amount: 52.9,
        type: 'expense',
        category: 'Télécom',
      },
      {
        id: 'tx-household-003',
        date: '2024-05-11T00:00:00.000Z',
        label: 'Électricité',
        amount: 89.5,
        type: 'expense',
        category: 'Énergie',
        notes: 'Facture estimée avec ajustement saisonnier.',
      },
      {
        id: 'tx-household-004',
        date: '2024-05-12T00:00:00.000Z',
        label: 'Assurance habitation',
        amount: 40,
        type: 'expense',
        category: 'Assurances',
      },
    ],
  },
  {
    id: 'mobility-2024',
    name: 'Mobilité & transport',
    description: 'Frais liés aux déplacements professionnels et personnels.',
    category: 'Transport',
    period: 'monthly',
    currency: 'EUR',
    amount: 620,
    spent: 548.1,
    startDate: '2024-01-01T00:00:00.000Z',
    endDate: null,
    ownerId: 'user-001',
    status: 'at-risk',
    alerts: [
      {
        id: 'alert-mobility-01',
        message:
          'Les dépenses carburant dépassent de 18 % la moyenne trimestrielle.',
        severity: 'warning',
        createdAt: '2024-05-08T15:10:00.000Z',
      },
    ],
    transactions: [
      {
        id: 'tx-mobility-001',
        date: '2024-05-03T00:00:00.000Z',
        label: 'Pass Navigo',
        amount: 84.1,
        type: 'expense',
        category: 'Transports en commun',
      },
      {
        id: 'tx-mobility-002',
        date: '2024-05-07T00:00:00.000Z',
        label: 'Carburant - plein de mai',
        amount: 96.5,
        type: 'expense',
        category: 'Carburant',
      },
      {
        id: 'tx-mobility-003',
        date: '2024-05-12T00:00:00.000Z',
        label: 'Révision véhicule',
        amount: 267.5,
        type: 'expense',
        category: 'Maintenance',
        notes: 'Remplacement des filtres et vidange.',
      },
      {
        id: 'tx-mobility-004',
        date: '2024-05-14T00:00:00.000Z',
        label: 'Indemnisation covoiturage',
        amount: 30,
        type: 'income',
        category: 'Remboursement',
      },
      {
        id: 'tx-mobility-005',
        date: '2024-05-18T00:00:00.000Z',
        label: 'Taxi aéroport',
        amount: 130,
        type: 'expense',
        category: 'Transport occasionnel',
      },
    ],
  },
  {
    id: 'vacation-2024',
    name: 'Voyage d’été',
    description: 'Préparation du séjour estival en famille.',
    category: 'Loisirs',
    period: 'yearly',
    currency: 'EUR',
    amount: 1800,
    spent: 1942.85,
    startDate: '2024-01-15T00:00:00.000Z',
    endDate: '2024-08-30T00:00:00.000Z',
    ownerId: 'user-001',
    status: 'over-budget',
    alerts: [
      {
        id: 'alert-vacation-01',
        message:
          'Le budget a été dépassé de 7,9 %. Pensez à ajuster vos réservations.',
        severity: 'critical',
        createdAt: '2024-05-15T09:45:00.000Z',
      },
    ],
    transactions: [
      {
        id: 'tx-vacation-001',
        date: '2024-04-12T00:00:00.000Z',
        label: 'Acompte location',
        amount: 520,
        type: 'expense',
        category: 'Hébergement',
      },
      {
        id: 'tx-vacation-002',
        date: '2024-04-27T00:00:00.000Z',
        label: 'Billets d’avion',
        amount: 840.5,
        type: 'expense',
        category: 'Transport',
      },
      {
        id: 'tx-vacation-003',
        date: '2024-05-09T00:00:00.000Z',
        label: 'Excursions & activités',
        amount: 248.35,
        type: 'expense',
        category: 'Activités',
      },
      {
        id: 'tx-vacation-004',
        date: '2024-05-13T00:00:00.000Z',
        label: 'Remboursement de caution',
        amount: 75,
        type: 'income',
        category: 'Remboursement',
      },
      {
        id: 'tx-vacation-005',
        date: '2024-05-16T00:00:00.000Z',
        label: 'Ajustement devis',
        amount: 259,
        type: 'expense',
        category: 'Divers',
        notes: 'Surclassement hébergement.',
      },
      {
        id: 'tx-vacation-006',
        date: '2024-05-19T00:00:00.000Z',
        label: 'Réservation restaurant',
        amount: 150,
        type: 'expense',
        category: 'Restauration',
      },
    ],
  },
];
