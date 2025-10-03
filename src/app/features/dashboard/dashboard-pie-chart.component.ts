import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chart, ChartData, ChartDataset, ChartOptions } from 'chart.js';
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
  imports: [CommonModule],
})
export class DashboardPieChartComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) data: DashboardPieChartDatum[] = [];
  @Input() currency: string = 'EUR';

  hasData = false;
  totalAmount = 0;

  private currencyFormatter = this.createCurrencyFormatter(this.currency);
  private pieChartOptions: ChartOptions<'pie'> = this.createPieChartOptions();
  private pieChartData: ChartData<'pie', number[], string> = {
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

  private chartInstance?: Chart<'pie'>;
  private chartCanvasRef?: ElementRef<HTMLCanvasElement>;

  @ViewChild('chartCanvas', { static: false })
  set chartCanvas(canvas: ElementRef<HTMLCanvasElement> | undefined) {
    if (canvas === this.chartCanvasRef) {
      return;
    }

    if (!canvas) {
      this.chartInstance?.destroy();
      this.chartInstance = undefined;
      this.chartCanvasRef = undefined;
      return;
    }

    this.chartCanvasRef = canvas;
    this.renderChart();
  }

  ngOnChanges(changes: SimpleChanges): void {
    const currencyChanged = Boolean(changes['currency']);

    if (currencyChanged) {
      this.currencyFormatter = this.createCurrencyFormatter(this.currency);
      this.pieChartOptions = this.createPieChartOptions();
    }

    if (changes['data']) {
      this.updateChartData();
    }

    this.renderChart();
  }

  ngOnDestroy(): void {
    this.chartInstance?.destroy();
    this.chartInstance = undefined;
  }

  private updateChartData(): void {
    const aggregated = this.aggregateByCategory(this.data);
    const labels = aggregated.map((item) => item.categorie);
    const values = aggregated.map((item) => item.montant);

    this.totalAmount = this.roundAmount(values.reduce((sum, value) => sum + value, 0));
    this.hasData = aggregated.some((item) => item.montant > 0);

    const dataset: ChartDataset<'pie', number[]> = {
      data: values,
      backgroundColor: this.buildColorPalette(labels.length),
      borderWidth: 2,
      borderColor: '#ffffff',
      hoverOffset: 12,
    };

    this.pieChartData = {
      labels,
      datasets: [dataset],
    };
  }

  private renderChart(): void {
    const canvas = this.chartCanvasRef?.nativeElement;

    if (!canvas || !this.hasData) {
      if (this.chartInstance) {
        this.chartInstance.destroy();
        this.chartInstance = undefined;
      }
      return;
    }

    const chartData = this.getPieChartDataForRendering();

    if (!this.chartInstance) {
      this.chartInstance = new Chart(canvas, {
        type: 'pie',
        data: chartData,
        options: this.pieChartOptions,
      });
      return;
    }

    this.chartInstance.data = chartData;
    this.chartInstance.options = this.pieChartOptions;
    this.chartInstance.update();
  }

  private getPieChartDataForRendering(): ChartData<'pie', number[], string> {
    const datasets = (this.pieChartData.datasets ?? []).map((dataset) => ({
      ...dataset,
      data: [...dataset.data],
      backgroundColor: Array.isArray(dataset.backgroundColor)
        ? [...dataset.backgroundColor]
        : dataset.backgroundColor,
    })) as ChartDataset<'pie', number[]>[];

    return {
      labels: [...(this.pieChartData.labels ?? [])],
      datasets,
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
