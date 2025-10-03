import { ChangeDetectionStrategy, Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgChartsModule } from 'ng2-charts';
import { ChartData, ChartOptions } from 'chart.js';
import 'chart.js/auto';

export interface DashboardPieChartDatum {
  categorie: string;
  montant: number;
}

@Component({
  standalone: true,
  selector: 'budget19-dashboard-pie-chart',
  templateUrl: './dashboard-pie-chart.component.html',
  styleUrls: ['./dashboard-pie-chart.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, NgChartsModule],
})
export class DashboardPieChartComponent implements OnChanges {
  @Input({ required: true }) data: DashboardPieChartDatum[] = [];
  @Input() currency: string = 'EUR';

  hasData = false;
  totalAmount = 0;

  private currencyFormatter = this.createCurrencyFormatter(this.currency);

  pieChartOptions: ChartOptions<'pie'> = this.createPieChartOptions();

  pieChartData: ChartData<'pie', number[], string> = {
    labels: [],
    datasets: [
      {
        data: [],
        backgroundColor: [],
        borderWidth: 2,
        borderColor: '#ffffff',
        hoverOffset: 12,
      },
    ],
  };

  ngOnChanges(changes: SimpleChanges): void {
    const currencyChanged = Boolean(changes['currency']);

    if (currencyChanged) {
      this.currencyFormatter = this.createCurrencyFormatter(this.currency);
      this.pieChartOptions = this.createPieChartOptions();
    }

    if (changes['data']) {
      this.updateChartData();
    }
  }

  private updateChartData(): void {
    const aggregated = this.aggregateByCategory(this.data);
    const labels = aggregated.map((item) => item.categorie);
    const values = aggregated.map((item) => item.montant);

    this.totalAmount = this.roundAmount(values.reduce((sum, value) => sum + value, 0));
    this.hasData = aggregated.some((item) => item.montant > 0);

    this.pieChartData = {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: this.buildColorPalette(labels.length),
          borderWidth: 2,
          borderColor: '#ffffff',
          hoverOffset: 12,
        },
      ],
    };
  }

  private aggregateByCategory(data: DashboardPieChartDatum[]): DashboardPieChartDatum[] {
    const accumulator = new Map<string, { montant: number; order: number }>();

    (data ?? []).forEach((entry, index) => {
      const category =
        typeof entry?.categorie === 'string' && entry.categorie.trim().length > 0
          ? entry.categorie.trim()
          : 'Non catégorisé';

      const amount = this.normalizeAmount(entry?.montant);
      const current = accumulator.get(category);

      if (current) {
        current.montant = this.roundAmount(current.montant + amount);
      } else {
        accumulator.set(category, { montant: this.roundAmount(amount), order: index });
      }
    });

    return Array.from(accumulator.entries())
      .map(([categorie, value]) => ({ categorie, montant: value.montant, order: value.order }))
      .sort((a, b) => {
        if (b.montant === a.montant) {
          return a.order - b.order;
        }

        return b.montant - a.montant;
      })
      .map(({ categorie, montant }) => ({ categorie, montant }));
  }

  private buildColorPalette(count: number): string[] {
    const palette = [
      '#1d4ed8',
      '#2563eb',
      '#312e81',
      '#4338ca',
      '#6366f1',
      '#7c3aed',
      '#9333ea',
      '#c026d3',
      '#db2777',
      '#ec4899',
      '#f472b6',
      '#f97316',
      '#fb923c',
      '#f59e0b',
      '#d97706',
      '#16a34a',
      '#22c55e',
      '#0d9488',
      '#14b8a6',
      '#0891b2',
    ];

    const colors: string[] = [];
    for (let index = 0; index < count; index += 1) {
      colors.push(palette[index % palette.length]);
    }
    return colors;
  }

  private createPieChartOptions(): ChartOptions<'pie'> {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            usePointStyle: true,
            boxWidth: 12,
            boxHeight: 12,
            padding: 16,
          },
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const label = context.label ?? 'Catégorie';
              const value = typeof context.parsed === 'number' ? context.parsed : 0;
              const dataset =
                context.chart.data.datasets?.[context.datasetIndex]?.data as (number | null | undefined)[] | undefined;
              const total =
                dataset?.reduce(
                  (sum, current) => sum + (typeof current === 'number' && Number.isFinite(current) ? current : 0),
                  0,
                ) ?? 0;
              const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';
              return `${label}: ${this.currencyFormatter.format(value)} (${percentage} %)`;
            },
          },
        },
      },
    };
  }

  private normalizeAmount(value: number | null | undefined): number {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0) {
      return 0;
    }
    return this.roundAmount(amount);
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
