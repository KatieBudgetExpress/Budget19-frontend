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
import { PosteBudgetaire, PosteService } from '../../core/services/poste.service';

@Component({
  standalone: true,
  selector: 'budget19-poste-list',
  templateUrl: './poste-list.component.html',
  styleUrls: ['./poste-list.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
})
export class PosteListComponent implements OnInit {
  private readonly posteService = inject(PosteService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly cdr = inject(ChangeDetectorRef);

  postes: PosteBudgetaire[] = [];
  loading = false;
  error: string | null = null;
  deletingPosteId: string | null = null;

  ngOnInit(): void {
    this.fetchPostes();
  }

  fetchPostes(): void {
    this.loading = true;
    this.error = null;
    this.cdr.markForCheck();

    this.posteService
      .list()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (postes) => {
          this.postes = Array.isArray(postes) ? postes : [];
          this.cdr.markForCheck();
        },
        error: (error) => {
          console.error('Impossible de récupérer les postes budgétaires.', error);
          this.error =
            "Impossible de charger les postes budgétaires pour le moment. Veuillez réessayer plus tard.";
          this.cdr.markForCheck();
        },
      });
  }

  viewDetail(poste: PosteBudgetaire): void {
    if (!poste?.id) {
      return;
    }

    this.router.navigate(['/postes', poste.id]).catch((error) => {
      console.error("Navigation vers le détail du poste budgétaire impossible.", error);
    });
  }

  createPoste(): void {
    this.router.navigate(['/postes', 'nouveau']).catch((error) => {
      console.error("Navigation vers la création d’un poste budgétaire impossible.", error);
    });
  }

  deletePoste(id: string): void {
    if (!id) {
      return;
    }

    this.error = null;
    this.deletingPosteId = id;
    this.cdr.markForCheck();

    this.posteService
      .delete(id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.deletingPosteId = null;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.postes = this.postes.filter((poste) => poste.id !== id);
          this.cdr.markForCheck();
        },
        error: (error) => {
          console.error(`Impossible de supprimer le poste budgétaire ${id}.`, error);
          this.error =
            "Impossible de supprimer ce poste budgétaire pour le moment. Veuillez réessayer ultérieurement.";
          this.cdr.markForCheck();
        },
      });
  }
}
