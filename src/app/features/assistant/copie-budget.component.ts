import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  Budget,
  BudgetCategory,
  BudgetService,
  CreateBudgetPayload,
} from '../../core/services/budget.service';
import { NotificationService } from '../../core/notifications/notification.service';

@Component({
  standalone: true,
  selector: 'budget19-copie-budget',
  templateUrl: './copie-budget.component.html',
  styleUrls: ['./copie-budget.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
})
export class CopieBudgetComponent {
  private readonly budgetService = inject(BudgetService);
  private readonly notifications = inject(NotificationService);

  readonly budgets = this.budgetService.budgets;
  readonly isLoading = this.budgetService.isLoading;
  readonly serviceError = this.budgetService.error;

  readonly selectedBudgetId = signal<string | null>(null);
  readonly isCopying = signal(false);
  readonly copyError = signal<string | null>(null);
  readonly loadError = signal<string | null>(null);
  readonly lastCreatedBudget = signal<Budget | null>(null);

  readonly selectedBudget = computed(() => {
    const id = this.selectedBudgetId();
    if (!id) {
      return null;
    }
    return this.budgets().find((budget) => budget.id === id) ?? null;
  });

  readonly previewCopyName = computed(() => {
    const selected = this.selectedBudget();
    return selected ? this.generateCopyName(selected) : '';
  });

  readonly canCopy = computed(() => !!this.selectedBudget() && !this.isCopying());

  readonly fetchError = computed(() => this.loadError() ?? this.serviceError());

  constructor() {
    this.loadBudgets();
  }

  trackByBudgetId(_index: number, budget: Budget): string {
    return budget.id;
  }

  selectBudget(budget: Budget): void {
    this.selectedBudgetId.set(budget.id);
    this.copyError.set(null);
  }

  reloadBudgets(): void {
    this.loadBudgets({ forceRefresh: true });
  }

  copyBudget(): void {
    if (this.isCopying()) {
      return;
    }

    const source = this.selectedBudget();
    if (!source) {
      this.copyError.set('Veuillez sélectionner le budget à copier.');
      return;
    }

    this.isCopying.set(true);
    this.copyError.set(null);
    this.lastCreatedBudget.set(null);

    const payload = this.buildCopyPayload(source);

    this.budgetService.create(payload).subscribe({
      next: (createdBudget) => {
        this.isCopying.set(false);
        this.lastCreatedBudget.set(createdBudget);
        this.notifications.success(
          `Budget « ${createdBudget.name} » créé à partir de « ${source.name} ».`,
        );
        this.selectedBudgetId.set(createdBudget.id);
      },
      error: (error) => {
        console.error('Échec de la copie du budget', error);
        this.isCopying.set(false);
        this.copyError.set(
          'Impossible de copier ce budget pour le moment. Veuillez réessayer plus tard.',
        );
        this.notifications.error(
          'La copie du budget a échoué. Merci de réessayer plus tard.',
        );
      },
    });
  }

  private loadBudgets(options: { forceRefresh?: boolean } = {}): void {
    this.loadError.set(null);

    this.budgetService.loadBudgets({ forceRefresh: options.forceRefresh }).subscribe({
      next: (budgets) => {
        this.loadError.set(null);

        const currentId = this.selectedBudgetId();
        if (!budgets.length) {
          if (currentId !== null) {
            this.selectedBudgetId.set(null);
          }
          return;
        }

        const exists = currentId ? budgets.some((budget) => budget.id === currentId) : false;
        if (!exists) {
          this.selectedBudgetId.set(budgets[0].id);
        }
      },
      error: (error) => {
        console.error('Échec du chargement des budgets', error);
        this.loadError.set(
          'Impossible de récupérer la liste des budgets. Vérifiez votre connexion et réessayez.',
        );
      },
    });
  }

  private buildCopyPayload(source: Budget): CreateBudgetPayload {
    const now = new Date();
    const startDate = this.createStartDate(source.startDate, now);
    const endDate = this.createEndDate(source, startDate);
    const categories = this.cloneCategoriesForCopy(source);

    return {
      name: this.generateCopyName(source),
      description: source.description,
      amount: source.amount,
      category: source.category,
      categories: categories.length ? categories : undefined,
      startDate,
      endDate,
    };
  }

  private generateCopyName(source: Budget): string {
    const existingNames = new Set(
      this.budgets()
        .map((budget) => budget.name.trim().toLowerCase())
        .filter((name) => name.length > 0),
    );

    const baseName = `Copie de ${source.name}`.trim();
    const normalizedBase = baseName.toLowerCase();

    if (!existingNames.has(normalizedBase)) {
      return baseName;
    }

    let index = 2;
    let candidate = `${baseName} (${index})`;
    while (existingNames.has(candidate.toLowerCase())) {
      index += 1;
      candidate = `${baseName} (${index})`;
    }

    return candidate;
  }

  private createStartDate(sourceStartDate: string | undefined, fallbackDate: Date): string {
    if (!sourceStartDate) {
      return fallbackDate.toISOString();
    }

    const parsed = new Date(sourceStartDate);
    if (Number.isNaN(parsed.getTime())) {
      return fallbackDate.toISOString();
    }

    const now = Date.now();
    const tolerance = 1000 * 60 * 60 * 24;
    if (parsed.getTime() >= now - tolerance) {
      return parsed.toISOString();
    }

    return fallbackDate.toISOString();
  }

  private createEndDate(source: Budget, newStartDate: string): string | null {
    if (!source.endDate) {
      return null;
    }

    const originalStart = new Date(source.startDate);
    const originalEnd = new Date(source.endDate);
    if (
      Number.isNaN(originalStart.getTime()) ||
      Number.isNaN(originalEnd.getTime()) ||
      originalEnd.getTime() <= originalStart.getTime()
    ) {
      return source.endDate;
    }

    const newStart = new Date(newStartDate);
    if (Number.isNaN(newStart.getTime())) {
      return source.endDate;
    }

    const duration = originalEnd.getTime() - originalStart.getTime();
    const computedEnd = new Date(newStart.getTime() + duration);
    return computedEnd.toISOString();
  }

  private cloneCategoriesForCopy(source: Budget): BudgetCategory[] {
    const categories = source.categories ?? [];
    if (!categories.length) {
      return [];
    }

    const timestamp = Date.now();
    return categories.map((category, index) => ({
      ...category,
      id: `${category.id}-copy-${timestamp}-${index}`,
    }));
  }
}
