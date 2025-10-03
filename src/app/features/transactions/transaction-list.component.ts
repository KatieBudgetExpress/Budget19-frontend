import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  OnInit,
  inject,
} from '@angular/core';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { Transaction, TransactionService } from '../../core/services/transaction.service';

@Component({
  standalone: true,
  selector: 'budget19-transaction-list',
  templateUrl: './transaction-list.component.html',
  styleUrls: ['./transaction-list.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
})
export class TransactionListComponent implements OnInit {
  private readonly transactionService = inject(TransactionService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly cdr = inject(ChangeDetectorRef);

  transactions: Transaction[] = [];
  loading = false;
  error: string | null = null;

  ngOnInit(): void {
    this.fetchTransactions();
  }

  fetchTransactions(): void {
    this.loading = true;
    this.error = null;
    this.cdr.markForCheck();

    this.transactionService
      .list()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (transactions) => {
          this.transactions = Array.isArray(transactions) ? transactions : [];
          this.cdr.markForCheck();
        },
        error: (error) => {
          console.error('Impossible de récupérer les transactions.', error);
          this.error =
            "Impossible de charger les transactions pour le moment. Veuillez réessayer plus tard.";
          this.cdr.markForCheck();
        },
      });
  }

  viewDetail(transaction: Transaction): void {
    const id = transaction?.id;
    if (!id) {
      return;
    }

    this.router.navigate(['/transactions', id]).catch((navigationError) => {
      console.error('Navigation vers le détail de la transaction impossible.', navigationError);
    });
  }

  createTransaction(): void {
    this.router.navigate(['/transactions', 'new']).catch((navigationError) => {
      console.error("Navigation vers la création d'une transaction impossible.", navigationError);
    });
  }

  deleteTransaction(id: string): void {
    if (!id) {
      return;
    }

    const confirmation = window.confirm(
      'Confirmez-vous la suppression de cette transaction ?',
    );

    if (!confirmation) {
      return;
    }

    this.error = null;

    this.transactionService
      .delete(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.transactions = this.transactions.filter((transaction) => transaction.id !== id);
          this.cdr.markForCheck();
        },
        error: (error) => {
          console.error(`Impossible de supprimer la transaction ${id}.`, error);
          this.error =
            'La suppression de cette transaction a échoué. Veuillez réessayer ultérieurement.';
          this.cdr.markForCheck();
        },
      });
  }
}
