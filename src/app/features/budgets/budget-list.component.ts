import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { BudgetService, Budget, BudgetStatus } from '../../core/services/budget.service';
import { NotificationService } from '../../core/notifications/notification.service';

interface BudgetListSummary {
  totalAllocated: number;
  totalSpent: number;
  totalRemaining: number;
  budgetsCount: number;
  onTrackCount: number;
  atRiskCount: number;
  exceededCount: number;
  currency: string;
}

@Component({
  standalone: true,
  selector: 'budget19-budget-list',
  templateUrl: './budget-list.component.html',
  styleUrls: ['./budget-list.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink],
})
export class BudgetListComponent {
  private readonly budgetService = inject(BudgetService);
  private readonly notifications = inject(NotificationService);

  readonly budgets = this.budgetService.budgets;
  readonly isLoading = this.budgetService.isLoading;
  readonly error = this.budgetService.error;
  readonly lastUpdatedAt = this.budgetService.lastUpdatedAt;

  readonly summary = computed<BudgetListSummary>(() => {
    const budgets = this.budgets();
    if (!budgets.length) {
      return {
        totalAllocated: 0,
        totalSpent: 0,
        totalRemaining: 0,
        budgetsCount: 0,
        onTrackCount: 0,
        atRiskCount: 0,
        exceededCount: 0,
        currency: 'EUR',
      };
    }

    const currency =
      budgets.every((budget) => budget.currency === budgets[0].currency) && budgets[0].currency
        ? budgets[0].currency
        : 'EUR';

    const summary: BudgetListSummary = {
      totalAllocated: 0,
      totalSpent: 0,
      totalRemaining: 0,
      budgetsCount: budgets.length,
      onTrackCount: 0,
      atRiskCount: 0,
      exceededCount: 0,
      currency,
    };

    for (const budget of budgets) {
      summary.totalAllocated += budget.amount;
      summary.totalSpent += budget.spent;
      summary.totalRemaining += budget.amount - budget.spent;

      if (budget.status === 'on-track') {
        summary.onTrackCount += 1;
      } else if (budget.status === 'at-risk') {
        summary.atRiskCount += 1;
      } else if (budget.status === 'over-budget') {
        summary.exceededCount += 1;
      }
    }

    return summary;
  });

  readonly statusMetadata: Record<BudgetStatus, { label: string; description: string }> = {
    'on-track': {
      label: 'Sur la bonne voie',
      description: 'Les dépenses restent inférieures au montant prévu.',
    },
    'at-risk': {
      label: 'Sous surveillance',
      description: 'Certaines catégories dépassent les seuils définis.',
    },
    'over-budget': {
      label: 'Budget dépassé',
      description: 'Le montant alloué est entièrement consommé ou dépassé.',
    },
  };

  constructor() {
    this.loadBudgets({ silent: true });
  }

  refreshBudgets(): void {
    this.loadBudgets({ forceRefresh: true });
  }

  trackByBudgetId(_index: number, budget: Budget): string {
    return budget.id;
  }

  getBudgetProgress(budget: Budget): number {
    if (!budget.amount || budget.amount <= 0) {
      return 0;
    }

    const ratio = (budget.spent / budget.amount) * 100;
    return Math.max(0, Math.min(100, Math.round(ratio)));
  }

  getRemainingAmount(budget: Budget): number {
    return budget.amount - budget.spent;
  }

  private loadBudgets(options: { forceRefresh?: boolean; silent?: boolean } = {}): void {
    this.budgetService.loadBudgets({ forceRefresh: options.forceRefresh }).subscribe({
      next: () => {
        if (!options.silent) {
          this.notifications.success('Budgets actualisés.');
        }
      },
      error: (error) => {
        console.error('Échec du chargement des budgets', error);
        this.notifications.error(
          'Impossible de charger les budgets pour le moment. Veuillez réessayer plus tard.',
        );
      },
    });
  }
}

