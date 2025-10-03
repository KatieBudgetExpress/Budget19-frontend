import { ChangeDetectionStrategy, Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgChartsModule } from 'ng2-charts';
import { ChartData, ChartOptions, ChartType } from 'chart.js';
import 'chart.js/auto';

export interface DashboardTimeSeriesPoint {
  date: string;
  montant: number;
}

@Component({
  standalone: true,
  selector: 'budget19-dashboard-revenu-chart',
  templateUrl: './dashboard-revenu-chart.component.html',
  styleUrls: ['./dashboard-revenu-chart.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, NgChartsModule],
})
export class DashboardRevenuChartComponent implements OnChanges {
  @Input({ required: true }) data: DashboardTimeSeriesPoint[] = [];
  @Input() currency: string = 'EUR';

  readonly chartType: ChartType = 'bar';

  hasData = false;
  totalAmount = 0;

  private currencyFormatter = this.createCurrencyFormatter(this.currency);
  private readonly monthYearFormatter = new Intl.DateTimeFormat('fr-FR', {
    month: 'short',
    year: 'numeric',
  });
  private readonly fullDateFormatter = new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  barChartOptions: ChartOptions<'bar'> = this.createChartOptions();
  barChartData: ChartData<'bar'> = {
    labels: [],
    datasets: [
      {
        data: [],
        label: 'Revenus',
        backgroundColor: 'rgba(37, 99, 235, 0.75)',
        hoverBackgroundColor: 'rgba(29, 78, 216, 0.9)',
        borderRadius: 12,
        maxBarThickness: 48,
      },
    ],
  };

  ngOnChanges(changes: SimpleChanges): void {
    const currencyChanged = Boolean(changes['currency']);

    if (currencyChanged) {
      this.currencyFormatter = this.createCurrencyFormatter(this.currency);
    }

    if (changes['data']) {
      this.updateChartData();
    } else if (currencyChanged) {
      this.barChartOptions = this.createChartOptions(this.extractValueBounds());
    }
  }

  private updateChartData(): void {
    const aggregated = this.aggregateAndSortData(this.data);
    const labels = aggregated.map((entry) => this.formatLabel(entry.date));
    const values = aggregated.map((entry) => this.roundAmount(entry.montant));

    this.totalAmount = this.roundAmount(values.reduce((sum, value) => sum + value, 0));
    this.hasData = aggregated.some((entry) => entry.montant !== 0);

    this.barChartData = {
      labels,
      datasets: [
        {
          data: values,
          label: 'Revenus',
          backgroundColor: 'rgba(37, 99, 235, 0.75)',
          hoverBackgroundColor: 'rgba(29, 78, 216, 0.9)',
          borderRadius: 12,
          maxBarThickness: 48,
        },
      ],
    };

    this.barChartOptions = this.createChartOptions(this.extractValueBounds(values));
  }

  private aggregateAndSortData(data: DashboardTimeSeriesPoint[]): DashboardTimeSeriesPoint[] {
    const aggregate = new Map<string, { montant: number; order: number }>();

    (data ?? []).forEach((entry, index) => {
      const key = entry?.date != null ? String(entry.date).trim() : '';
      const amount = this.normalizeAmount(entry?.montant);
      const current = aggregate.get(key);

      if (current) {
        current.montant = this.roundAmount(current.montant + amount);
      } else {
        aggregate.set(key, { montant: this.roundAmount(amount), order: index });
      }
    });

    return Array.from(aggregate.entries())
      .map(([date, value]) => ({ date, montant: value.montant, order: value.order }))
      .sort((a, b) => {
        const timeA = Date.parse(a.date);
        const timeB = Date.parse(b.date);
        const validA = Number.isFinite(timeA);
        const validB = Number.isFinite(timeB);

        if (validA && validB) {
          return timeA - timeB;
        }

        if (validA) {
          return -1;
        }

        if (validB) {
          return 1;
        }

        return a.order - b.order;
      })
      .map(({ date, montant }) => ({ date, montant }));
  }

  private createChartOptions(bounds?: { min: number; max: number }): ChartOptions<'bar'> {
    const minValue = bounds?.min ?? 0;
    const maxValue = bounds?.max ?? 0;
    const hasNegative = minValue < 0;
    const hasPositive = maxValue > 0;

    return {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          grid: {
            display: false,
          },
          ticks: {
            color: '#4b5563',
            font: {
              weight: '500',
            },
            maxRotation: 0,
            autoSkipPadding: 12,
          },
        },
        y: {
          beginAtZero: !hasNegative,
          suggestedMin: hasNegative ? Math.floor(minValue * 1.1) : undefined,
          suggestedMax: hasPositive ? Math.ceil(maxValue * 1.1) : undefined,
          grid: {
            color: 'rgba(148, 163, 184, 0.2)',
            drawBorder: false,
          },
          ticks: {
            color: '#4b5563',
            callback: (value) => {
              const numericValue = typeof value === 'number' ? value : Number(value);
              const safeValue = Number.isFinite(numericValue) ? numericValue : 0;
              return this.currencyFormatter.format(safeValue);
            },
          },
        },
      },
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          callbacks: {
            title: (items) => items?.[0]?.label ?? '',
            label: (context) => {
              const datasetLabel = context.dataset.label ?? 'Montant';
              const value = context.parsed.y ?? 0;
              return `${datasetLabel}: ${this.currencyFormatter.format(value)}`;
            },
          },
        },
      },
    };
  }

  private extractValueBounds(values?: number[]): { min: number; max: number } {
    const resolvedValues =
      values ??
      ((this.barChartData.datasets?.[0]?.data as number[] | undefined) ?? []);

    const numericValues = resolvedValues.filter(
      (value): value is number => typeof value === 'number' && Number.isFinite(value),
    );

    if (!numericValues.length) {
      return { min: 0, max: 0 };
    }

    let min = numericValues[0];
    let max = numericValues[0];

    for (const value of numericValues) {
      min = Math.min(min, value);
      max = Math.max(max, value);
    }

    return { min, max };
  }

  private formatLabel(value: string): string {
    const normalizedValue = typeof value === 'string' ? value.trim() : String(value ?? '').trim();
    const timestamp = Date.parse(normalizedValue);

    if (!Number.isFinite(timestamp)) {
      return normalizedValue;
    }

    const date = new Date(timestamp);
    const monthOnlyPattern = /^\d{4}-(0[1-9]|1[0-2])$/;

    if (monthOnlyPattern.test(normalizedValue) || normalizedValue.length <= 7) {
      return this.monthYearFormatter.format(date);
    }

    return this.fullDateFormatter.format(date);
  }

  private normalizeAmount(value: number | null | undefined): number {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : 0;
  }

  private roundAmount(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private createCurrencyFormatter(currency: string): Intl.NumberFormat {
    const normalizedCurrency =
      typeof currency === 'string' && currency.trim().length > 0 ? currency.trim().toUpperCase() : 'EUR';

    try {
      return new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: normalizedCurrency,
        maximumFractionDigits: 2,
      });
    } catch {
      return new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 2,
      });
    }
  }
}
