import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import {
  Budget,
  BudgetService,
  BudgetTransaction,
} from '../../core/services/budget.service';
import {
  DashboardPieChartComponent,
  DashboardPieChartDatum,
} from './dashboard-pie-chart.component';
import {
  DashboardRevenuChartComponent,
  DashboardTimeSeriesPoint,
} from './dashboard-revenu-chart.component';
import {
  DashboardDepenseChartComponent,
  DashboardDepensePoint,
} from './dashboard-depense-chart.component';

type TrendType = 'income' | 'expense';

interface FinancialSummary {
  totalIncome: number;
  totalExpense: number;
  balance: number;
  currency: string;
  hasTransactions: boolean;
}

interface TrendPoint {
  label: string;
  value: number;
  date: string;
}

interface Insight {
  title: string;
  description: string;
  tone: 'positive' | 'warning' | 'neutral';
}

interface SummaryCard {
  key: 'income' | 'expense' | 'balance';
  title: string;
  amount: number;
  helper: string;
  variation: number;
  tone: 'positive' | 'negative' | 'neutral';
}

interface CategoryBreakdownItem {
  label: string;
  value: number;
  percentage: number;
}

interface CategoryBreakdown {
  total: number;
  items: CategoryBreakdownItem[];
}

interface MonthBucket {
  key: string;
  date: Date;
  value: number;
}

@Component({
  standalone: true,
  selector: 'budget19-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    RouterLink,
    DashboardPieChartComponent,
    DashboardRevenuChartComponent,
    DashboardDepenseChartComponent,
  ],
})
export class DashboardComponent {
  private readonly budgetService = inject(BudgetService);

  readonly budgets = this.budgetService.budgets;
  readonly isLoading = this.budgetService.isLoading;
  readonly error = this.budgetService.error;
  readonly lastUpdatedAt = this.budgetService.lastUpdatedAt;

  private readonly monthsWindow = 6;
  private readonly fallbackTrendPattern = [0.88, 1.04, 0.96, 1.12, 0.94, 1.06, 0.9, 1.18];

  readonly summary = computed<FinancialSummary>(() => {
    const budgets = this.budgets();
    if (!budgets.length) {
      return {
        totalIncome: 0,
        totalExpense: 0,
        balance: 0,
        currency: 'EUR',
        hasTransactions: false,
      };
    }

    let totalIncome = 0;
    let totalExpense = 0;
    let transactionIncome = 0;
    let transactionExpense = 0;
    let hasTransactions = false;

    for (const budget of budgets) {
      totalIncome += Math.max(budget.amount ?? 0, 0);
      totalExpense += Math.max(budget.spent ?? 0, 0);

      const transactions = budget.transactions ?? [];
      if (!transactions.length) {
        continue;
      }

      hasTransactions = true;

      for (const transaction of transactions) {
        const amount = Math.abs(transaction.amount ?? 0);
        if (amount <= 0) {
          continue;
        }

        if (transaction.type === 'income') {
          transactionIncome += amount;
        } else if (transaction.type === 'expense') {
          transactionExpense += amount;
        } else if (transaction.type === 'adjustment') {
          if (transaction.amount >= 0) {
            transactionIncome += transaction.amount;
          } else {
            transactionExpense += Math.abs(transaction.amount);
          }
        }
      }
    }

    if (hasTransactions) {
      if (transactionIncome > 0) {
        totalIncome = transactionIncome;
      }
      if (transactionExpense > 0) {
        totalExpense = transactionExpense;
      }
    }

    const referenceCurrency = budgets[0]?.currency || 'EUR';
    let currency = referenceCurrency || 'EUR';
    for (const budget of budgets) {
      if (budget.currency && budget.currency !== referenceCurrency) {
        currency = 'EUR';
        break;
      }
    }

    totalIncome = Math.round(totalIncome * 100) / 100;
    totalExpense = Math.round(totalExpense * 100) / 100;

    return {
      totalIncome,
      totalExpense,
      balance: Math.round((totalIncome - totalExpense) * 100) / 100,
      currency,
      hasTransactions,
    };
  });

  readonly hasData = computed(() => this.budgets().length > 0);

  readonly categoryBreakdown = computed<CategoryBreakdown>(() => {
    const budgets = this.budgets();
    if (!budgets.length) {
      return { total: 0, items: [] };
    }

    const totals = new Map<string, number>();

    for (const budget of budgets) {
      const transactions = budget.transactions ?? [];
      if (transactions.length) {
        let hasExpenseTransaction = false;

        for (const transaction of transactions) {
          if (transaction.type !== 'expense') {
            continue;
          }

          const amount = Math.abs(transaction.amount ?? 0);
          if (amount <= 0) {
            continue;
          }

          const label = transaction.category?.trim() || this.resolveBudgetLabel(budget);
          totals.set(label, (totals.get(label) ?? 0) + amount);
          hasExpenseTransaction = true;
        }

        if (!hasExpenseTransaction) {
          const amount = Math.max(budget.spent ?? 0, 0);
          if (amount > 0) {
            const label = this.resolveBudgetLabel(budget);
            totals.set(label, (totals.get(label) ?? 0) + amount);
          }
        }

        continue;
      }

      if (budget.categories?.length) {
        for (const category of budget.categories) {
          const amount = Math.max(category.allocation ?? 0, 0);
          if (amount <= 0) {
            continue;
          }
          const label = category.name?.trim() || this.resolveBudgetLabel(budget);
          totals.set(label, (totals.get(label) ?? 0) + amount);
        }
        continue;
      }

      const amount = Math.max(budget.spent ?? 0, 0);
      if (amount <= 0) {
        continue;
      }
      const label = this.resolveBudgetLabel(budget);
      totals.set(label, (totals.get(label) ?? 0) + amount);
    }

    const items = Array.from(totals.entries()).map<CategoryBreakdownItem>(([label, value]) => ({
      label,
      value: Math.round(value * 100) / 100,
      percentage: 0,
    }));
    const total = items.reduce((accumulator, item) => accumulator + item.value, 0);

    if (total === 0) {
      return { total: 0, items: [] };
    }

    return {
      total: Math.round(total * 100) / 100,
      items: items
        .map((item) => ({
          ...item,
          percentage: this.toPercentage(item.value, total),
        }))
        .sort((a, b) => b.value - a.value),
    };
  });

  readonly categoryChartData = computed<DashboardPieChartDatum[]>(() =>
    this.categoryBreakdown()
      .items.filter((item) => item.value > 0)
      .map((item) => ({
        categorie: item.label,
        montant: item.value,
      })),
  );

  readonly revenueTrend = computed<TrendPoint[]>(() => this.buildMonthlyTrend('income'));

  readonly expenseTrend = computed<TrendPoint[]>(() => this.buildMonthlyTrend('expense'));

  readonly revenueChartData = computed<DashboardTimeSeriesPoint[]>(() =>
    this.revenueTrend().map((point) => ({
      date: point.date,
      montant: point.value,
    })),
  );

  readonly expenseChartData = computed<DashboardDepensePoint[]>(() =>
    this.expenseTrend().map((point) => ({
      date: point.date,
      montant: point.value,
    })),
  );

  readonly incomeDelta = computed(() => this.computeDeltaPercentage(this.revenueTrend()));

  readonly expenseDelta = computed(() => this.computeDeltaPercentage(this.expenseTrend()));

  readonly balanceDelta = computed(() =>
    this.computeBalanceVariationFromSeries(this.revenueTrend(), this.expenseTrend()),
  );

  readonly summaryCards = computed<SummaryCard[]>(() => {
    const summary = this.summary();
    const incomeVariation = this.normalizeVariation(this.incomeDelta());
    const expenseVariation = this.normalizeVariation(this.expenseDelta());
    const balanceVariation = this.normalizeVariation(this.balanceDelta());

    const coverageRatio = summary.totalIncome > 0 ? summary.totalExpense / summary.totalIncome : 0;

    const incomeHelper = summary.hasTransactions
      ? 'Basé sur les transactions enregistrées sur vos budgets actifs.'
      : 'Estimation calculée à partir des montants planifiés de vos budgets.';

    const expenseHelper =
      coverageRatio > 0
        ? `Cela représente ${this.toPercentage(summary.totalExpense, summary.totalIncome)} % des revenus suivis.`
        : 'Aucune dépense n’a encore été enregistrée pour cette période.';

    const balanceHelper =
      summary.balance >= 0
        ? 'Montant restant après déduction de vos dépenses.'
        : 'Déficit à combler pour rééquilibrer la période en cours.';

    return [
      {
        key: 'income',
        title: 'Total des revenus',
        amount: summary.totalIncome,
        helper: incomeHelper,
        variation: incomeVariation,
        tone:
          incomeVariation > 0
            ? 'positive'
            : incomeVariation < 0
              ? 'negative'
              : 'neutral',
      },
      {
        key: 'expense',
        title: 'Total des dépenses',
        amount: summary.totalExpense,
        helper: expenseHelper,
        variation: expenseVariation,
        tone:
          expenseVariation > 0
            ? 'negative'
            : expenseVariation < 0
              ? 'positive'
              : 'neutral',
      },
      {
        key: 'balance',
        title: 'Solde disponible',
        amount: summary.balance,
        helper: balanceHelper,
        variation: balanceVariation,
        tone:
          balanceVariation > 0
            ? 'positive'
            : balanceVariation < 0
              ? 'negative'
              : 'neutral',
      },
    ];
  });

  readonly qualitativeInsights = computed<Insight[]>(() => {
    const summary = this.summary();
    const distribution = this.categoryBreakdown();
    const coverage = summary.totalIncome > 0 ? summary.totalExpense / summary.totalIncome : 0;

    const insights: Insight[] = [];

    if (summary.balance > 0) {
      insights.push({
        title: 'Solde positif',
        description: `Votre solde actuel est de ${this.formatCurrencyValue(summary.balance, summary.currency)}.`,
        tone: 'positive',
      });
    } else if (summary.balance < 0) {
      insights.push({
        title: 'Solde à surveiller',
        description: `Vos dépenses dépassent vos revenus de ${this.formatCurrencyValue(Math.abs(summary.balance), summary.currency)}.`,
        tone: 'warning',
      });
    } else {
      insights.push({
        title: 'Équilibre parfait',
        description: 'Vos revenus et vos dépenses se compensent exactement sur la période actuelle.',
        tone: 'neutral',
      });
    }

    if (summary.totalIncome <= 0 && !summary.hasTransactions) {
      insights.push({
        title: 'Données incomplètes',
        description: 'Ajoutez vos revenus et dépenses pour profiter pleinement du tableau de bord.',
        tone: 'neutral',
      });
    } else if (summary.totalIncome > 0) {
      if (coverage >= 0.9) {
        insights.push({
          title: 'Budget presque consommé',
          description: `Vous avez utilisé ${this.toPercentage(summary.totalExpense, summary.totalIncome)} % des revenus suivis.`,
          tone: 'warning',
        });
      } else if (coverage <= 0.5) {
        insights.push({
          title: 'Marge confortable',
          description: `Il reste ${this.formatCurrencyValue(summary.totalIncome - summary.totalExpense, summary.currency)} à engager.`,
          tone: 'positive',
        });
      } else {
        insights.push({
          title: 'Dépenses maîtrisées',
          description: `Vos dépenses représentent ${this.toPercentage(summary.totalExpense, summary.totalIncome)} % de vos revenus.`,
          tone: 'neutral',
        });
      }
    }

    const topCategory = distribution.items[0];
    if (topCategory) {
      insights.push({
        title: 'Poste le plus consommateur',
        description: `${topCategory.label} regroupe ${topCategory.percentage} % des dépenses observées.`,
        tone: 'neutral',
      });
    }

    return insights;
  });

  constructor() {
    this.refresh();
  }

  refresh(options: { forceRefresh?: boolean } = {}): void {
    this.budgetService.loadBudgets({ forceRefresh: options.forceRefresh }).subscribe({
      error: (error) => console.error('Erreur lors du chargement du tableau de bord.', error),
    });
  }

  trackBySummary(_index: number, card: SummaryCard): string {
    return card.key;
  }

  trackByInsight(_index: number, insight: Insight): string {
    return insight.title;
  }

  private buildMonthlyTrend(type: TrendType): TrendPoint[] {
    const budgets = this.budgets();
    const buckets = this.createMonthBuckets(this.monthsWindow);
    const bucketMap = new Map<string, MonthBucket>();

    for (const bucket of buckets) {
      bucketMap.set(bucket.key, bucket);
    }

    let hasData = false;

    for (const budget of budgets) {
      const transactions = budget.transactions ?? [];
      for (const transaction of transactions) {
        const bucketKey = this.resolveBucketKey(transaction.date);
        if (!bucketKey) {
          continue;
        }

        const bucket = bucketMap.get(bucketKey);
        if (!bucket) {
          continue;
        }

        const impact = this.computeTransactionImpact(transaction, type);
        if (impact === 0) {
          continue;
        }

        bucket.value += impact;
        hasData = true;
      }
    }

    if (!hasData) {
      const summary = this.summary();
      const total = type === 'income' ? summary.totalIncome : summary.totalExpense;
      const fallbackValues = this.generateFallbackTrend(total, buckets.length);
      buckets.forEach((bucket, index) => {
        bucket.value = fallbackValues[index] ?? 0;
      });
    }

    return buckets.map((bucket) => {
      const isoDate = new Date(Date.UTC(bucket.date.getFullYear(), bucket.date.getMonth(), 1)).toISOString();
      return {
        label: this.formatMonthLabel(bucket.date),
        value: Math.round(bucket.value * 100) / 100,
        date: isoDate,
      };
    });
  }

  private createMonthBuckets(count: number): MonthBucket[] {
    const now = new Date();
    const buckets: MonthBucket[] = [];

    for (let offset = count - 1; offset >= 0; offset -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      buckets.push({
        key: `${date.getFullYear()}-${date.getMonth()}`,
        date,
        value: 0,
      });
    }

    return buckets;
  }

  private resolveBucketKey(value: string | Date): string | null {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return `${date.getFullYear()}-${date.getMonth()}`;
  }

  private computeTransactionImpact(transaction: BudgetTransaction, type: TrendType): number {
    const amount = Math.abs(transaction.amount ?? 0);
    if (amount <= 0) {
      return 0;
    }

    if (type === 'income') {
      if (transaction.type === 'income') {
        return amount;
      }
      if (transaction.type === 'adjustment' && transaction.amount > 0) {
        return transaction.amount;
      }
      return 0;
    }

    if (transaction.type === 'expense') {
      return amount;
    }
    if (transaction.type === 'adjustment' && transaction.amount < 0) {
      return Math.abs(transaction.amount);
    }
    return 0;
  }

  private generateFallbackTrend(total: number, count: number): number[] {
    if (count <= 0) {
      return [];
    }
    if (total <= 0) {
      return new Array(count).fill(0);
    }

    const base = total / count;
    const values = Array.from({ length: count }, (_, index) => {
      const ratio = this.fallbackTrendPattern[index % this.fallbackTrendPattern.length];
      return base * ratio;
    });

    const sum = values.reduce((accumulator, value) => accumulator + value, 0);
    const factor = sum > 0 ? total / sum : 0;

    return values.map((value) => Math.max(0, value * factor));
  }

  private formatMonthLabel(date: Date): string {
    const label = date.toLocaleDateString('fr-FR', { month: 'short' });
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  private toPercentage(value: number, total: number): number {
    if (!Number.isFinite(value) || !Number.isFinite(total) || total === 0) {
      return 0;
    }
    return Math.round((Math.abs(value) / Math.abs(total)) * 1000) / 10;
  }

  private formatCurrencyValue(amount: number, currency: string): string {
    try {
      return new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency,
        maximumFractionDigits: 2,
      }).format(amount);
    } catch {
      return `${amount.toFixed(2)} ${currency}`;
    }
  }

  private normalizeVariation(value: number): number {
    if (!Number.isFinite(value)) {
      return 0;
    }
    const clamped = Math.max(Math.min(value, 999), -999);
    const rounded = Math.round(clamped * 10) / 10;
    return Math.abs(rounded) < 0.1 ? 0 : rounded;
  }

  private computeDeltaPercentage(series: TrendPoint[]): number {
    if (series.length < 2) {
      return 0;
    }
    const latest = series[series.length - 1]?.value ?? 0;
    const previous = series[series.length - 2]?.value ?? 0;
    if (previous === 0) {
      return latest === 0 ? 0 : 100;
    }
    return ((latest - previous) / Math.abs(previous)) * 100;
  }

  private computeBalanceVariationFromSeries(
    incomeSeries: TrendPoint[],
    expenseSeries: TrendPoint[],
  ): number {
    if (incomeSeries.length < 2 || expenseSeries.length < 2) {
      return 0;
    }
    const latestIncome = incomeSeries[incomeSeries.length - 1]?.value ?? 0;
    const previousIncome = incomeSeries[incomeSeries.length - 2]?.value ?? 0;
    const latestExpense = expenseSeries[expenseSeries.length - 1]?.value ?? 0;
    const previousExpense = expenseSeries[expenseSeries.length - 2]?.value ?? 0;

    const latestBalance = latestIncome - latestExpense;
    const previousBalance = previousIncome - previousExpense;

    if (previousBalance === 0) {
      return latestBalance === 0 ? 0 : 100;
    }

    return ((latestBalance - previousBalance) / Math.abs(previousBalance)) * 100;
  }

  private resolveBudgetLabel(budget: Budget): string {
    return budget.name?.trim() || budget.category?.trim() || 'Budget';
  }
}
