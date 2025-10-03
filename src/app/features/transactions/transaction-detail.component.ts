import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  inject,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, distinctUntilChanged, finalize, map, of, switchMap } from 'rxjs';
import { Transaction, TransactionService } from '../../core/services/transaction.service';

@Component({
  standalone: true,
  selector: 'budget19-transaction-detail',
  templateUrl: './transaction-detail.component.html',
  styleUrls: ['./transaction-detail.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],
})
export class TransactionDetailComponent {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly transactionService = inject(TransactionService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly transactionForm = this.fb.nonNullable.group({
    date: ['', [Validators.required]],
    libelle: ['', [Validators.required, Validators.maxLength(160)]],
    montant: [0, [Validators.required]],
    categorie: ['', [Validators.required, Validators.maxLength(80)]],
    type: ['depense', [Validators.required]],
  });

  readonly controls = this.transactionForm.controls;

  readonly typeOptions = [
    { value: 'revenu', label: 'Revenu' },
    { value: 'depense', label: 'Dépense' },
    { value: 'transfert', label: 'Transfert' },
  ] as const;

  loading = false;
  saving = false;
  error: string | null = null;
  isNew = true;

  private currentTransactionId: string | null = null;

  constructor() {
    this.observeRoute();
  }

  saveTransaction(): void {
    if (this.transactionForm.invalid) {
      this.transactionForm.markAllAsTouched();
      return;
    }

    if (!this.isNew && !this.currentTransactionId) {
      this.error =
        'Transaction introuvable : aucune mise à jour ne peut être effectuée.';
      this.cdr.markForCheck();
      return;
    }

    this.error = null;
    this.saving = true;
    this.cdr.markForCheck();

    const payload = this.buildPayload();

    const request$ = this.isNew
      ? this.transactionService.create(payload)
      : this.transactionService.update(this.currentTransactionId as string, payload);

    request$
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.saving = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (transaction) => {
          if (this.isNew) {
            this.goBack();
            return;
          }

          if (transaction) {
            this.patchForm(transaction);
            return;
          }

          this.transactionForm.markAsPristine();
        },
        error: (error) => {
          console.error('Erreur lors de la sauvegarde de la transaction.', error);
          this.error =
            "Impossible d'enregistrer cette transaction pour le moment. Veuillez réessayer plus tard.";
          this.cdr.markForCheck();
        },
      });
  }

  goBack(): void {
    this.router.navigate(['/transactions']).catch((navigationError) => {
      console.error('Navigation vers la liste des transactions impossible.', navigationError);
    });
  }

  private observeRoute(): void {
    this.route.paramMap
      .pipe(
        map((params) => params.get('id')),
        distinctUntilChanged(),
        switchMap((id) => {
          if (!id || id === 'new') {
            this.isNew = true;
            this.currentTransactionId = null;
            this.loading = false;
            this.error = null;
            this.resetForm();
            this.cdr.markForCheck();
            return of<Transaction | null>(null);
          }

          this.isNew = false;
          this.loading = true;
          this.error = null;
          this.currentTransactionId = id;
          this.cdr.markForCheck();

          return this.transactionService.getById(id).pipe(
            catchError((error) => {
              console.error('Impossible de charger la transaction.', error);
              this.error =
                'Impossible de charger cette transaction pour le moment. Veuillez réessayer plus tard.';
              this.loading = false;
              this.cdr.markForCheck();
              return of<Transaction | null>(null);
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((transaction) => {
        this.loading = false;

        if (!transaction) {
          this.cdr.markForCheck();
          return;
        }

        this.error = null;
        this.patchForm(transaction);
      });
  }

  private patchForm(transaction: Transaction): void {
    this.transactionForm.setValue({
      date: this.formatDateForInput(transaction.date),
      libelle: transaction.libelle ?? '',
      montant: Number(transaction.montant ?? 0),
      categorie: transaction.categorie ?? '',
      type: transaction.type ?? 'depense',
    });
    this.transactionForm.markAsPristine();
    this.transactionForm.markAsUntouched();
    this.cdr.markForCheck();
  }

  private resetForm(): void {
    this.transactionForm.setValue({
      date: '',
      libelle: '',
      montant: 0,
      categorie: '',
      type: 'depense',
    });
    this.transactionForm.markAsPristine();
    this.transactionForm.markAsUntouched();
  }

  private buildPayload(): Partial<Transaction> {
    const raw = this.transactionForm.getRawValue();

    return {
      date: this.normalizeDate(raw.date),
      libelle: raw.libelle.trim(),
      montant: Number(raw.montant),
      categorie: raw.categorie.trim(),
      type: raw.type,
    };
  }

  private normalizeDate(value: string): string {
    const trimmed = value?.trim();
    if (!trimmed) {
      return '';
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }

    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
      return trimmed;
    }

    return parsed.toISOString().slice(0, 10);
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
}
