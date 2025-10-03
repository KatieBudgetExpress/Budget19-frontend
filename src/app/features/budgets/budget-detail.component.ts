import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  Budget,
  BudgetCategory,
  BudgetService,
  UpdateBudgetPayload,
} from '../../core/services/budget.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { catchError, distinctUntilChanged, map, of, switchMap } from 'rxjs';

@Component({
  standalone: true,
  selector: 'budget19-budget-detail',
  templateUrl: './budget-detail.component.html',
  styleUrls: ['./budget-detail.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
})
export class BudgetDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly budgetService = inject(BudgetService);
  private readonly notifications = inject(NotificationService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly budget = signal<Budget | null>(null);
  readonly isLoading = signal<boolean>(false);
  readonly isSaving = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  private readonly currentBudgetId = signal<string | null>(null);

  readonly budgetForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    amount: [0, [Validators.required, Validators.min(0)]],
    period: ['monthly', [Validators.required]],
    startDate: [''],
    endDate: [''],
    description: [''],
  });

  constructor() {
    this.watchRoute();
  }

  onSubmit(): void {
    if (this.budgetForm.invalid) {
      this.budgetForm.markAllAsTouched();
      return;
    }

    if (this.budgetForm.pristine) {
      return;
    }

    const budgetId = this.currentBudgetId();
    if (!budgetId) {
      this.notifications.error('Budget introuvable, impossible de sauvegarder.');
      return;
    }

    const payload = this.buildUpdatePayload();
    this.isSaving.set(true);

    this.budgetService
      .update(budgetId, payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (budget) => {
          this.notifications.success('Budget mis à jour avec succès.');
          this.budget.set(budget);
          this.patchForm(budget);
          this.isSaving.set(false);
        },
        error: (error) => {
          this.isSaving.set(false);
          this.notifications.error(
            'Impossible de mettre à jour le budget pour le moment.',
          );
          console.error('Failed to update budget', error);
        },
      });
  }

  resetForm(): void {
    const current = this.budget();
    if (!current) {
      return;
    }
    this.patchForm(current);
  }

  trackByCategoryId(index: number, category: BudgetCategory): string {
    return category.id ?? `${index}`;
  }

  private watchRoute(): void {
    this.route.paramMap
      .pipe(
        map((params) => params.get('id')),
        distinctUntilChanged(),
        switchMap((id) => {
          if (!id) {
            this.error.set('Aucun budget sélectionné.');
            this.budget.set(null);
            this.currentBudgetId.set(null);
            this.isLoading.set(false);
            return of(null);
          }

          this.currentBudgetId.set(id);
          this.isLoading.set(true);
          this.error.set(null);

          return this.budgetService.getById(id).pipe(
            catchError((error) => {
              this.error.set(
                "Impossible de charger ce budget. Veuillez réessayer plus tard.",
              );
              this.notifications.error(
                "Le budget demandé n'a pas pu être chargé.",
              );
              console.error('Failed to load budget', error);
              this.budget.set(null);
              this.isLoading.set(false);
              return of(null);
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((budget) => {
        if (!budget) {
          this.isLoading.set(false);
          return;
        }

        this.budget.set(budget);
        this.patchForm(budget);
        this.isLoading.set(false);
      });
  }

  private patchForm(budget: Budget): void {
    this.budgetForm.setValue({
      name: budget.name ?? '',
      amount: budget.amount ?? 0,
      period: budget.period ?? 'custom',
      startDate: this.formatDateForInput(budget.startDate),
      endDate: this.formatDateForInput(budget.endDate),
      description: budget.description ?? '',
    });
    this.budgetForm.markAsPristine();
  }

  private buildUpdatePayload(): UpdateBudgetPayload {
    const raw = this.budgetForm.getRawValue();
    const startDate = this.normalizeDate(raw.startDate);
    const endDate = this.normalizeDate(raw.endDate);
    const description = this.normalizeText(raw.description);

    return {
      name: raw.name.trim(),
      amount: Number(raw.amount),
      period: raw.period,
      startDate: startDate ?? undefined,
      endDate,
      description: description ?? undefined,
    };
  }

  private formatDateForInput(value?: string | null): string {
    if (!value) {
      return '';
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return '';
    }

    return parsed.toISOString().slice(0, 10);
  }

  private normalizeDate(value: string | null | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : null;
  }

  private normalizeText(value: string | null | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : null;
  }
}
