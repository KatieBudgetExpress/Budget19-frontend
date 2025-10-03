import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, distinctUntilChanged, map, of, switchMap } from 'rxjs';
import { NotificationService } from '../../core/notifications/notification.service';
import {
  CreatePostePayload,
  Poste,
  PosteService,
  UpdatePostePayload,
} from '../../core/services/poste.service';

@Component({
  standalone: true,
  selector: 'budget19-poste-detail',
  templateUrl: './poste-detail.component.html',
  styleUrls: ['./poste-detail.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],
})
export class PosteDetailComponent {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly posteService = inject(PosteService);
  private readonly notifications = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  readonly poste = signal<Poste | null>(null);
  readonly isNewMode = signal<boolean>(true);
  readonly isLoading = signal<boolean>(false);
  readonly isSaving = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  private readonly currentPosteId = signal<string | null>(null);

  readonly posteForm = this.fb.nonNullable.group({
    nom: ['', [Validators.required, Validators.maxLength(120)]],
    description: [''],
    montant: [0, [Validators.required, Validators.min(0)]],
    categorie: ['', [Validators.required, Validators.maxLength(80)]],
    dateDebut: ['', [Validators.required]],
    dateFin: [''],
  });

  readonly controls = this.posteForm.controls;

  constructor() {
    this.watchRoute();
  }

  onSubmit(): void {
    if (this.posteForm.invalid) {
      this.posteForm.markAllAsTouched();
      return;
    }

    if (this.posteForm.pristine && !this.isNewMode()) {
      return;
    }

    this.error.set(null);
    this.isSaving.set(true);

    if (this.isNewMode()) {
      const payload = this.buildCreatePayload();
      this.posteService
        .create(payload)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (poste) => {
            this.isSaving.set(false);
            this.notifications.success('Poste budgétaire créé avec succès.');
            if (poste?.id) {
              this.router
                .navigate(['../', poste.id], {
                  relativeTo: this.route,
                  replaceUrl: true,
                })
                .catch((navigationError) =>
                  console.error(
                    'Navigation vers le poste créé impossible',
                    navigationError,
                  ),
                );
              return;
            }

            this.router
              .navigate(['/postes'])
              .catch((navigationError) =>
                console.error(
                  'Navigation vers la liste des postes impossible',
                  navigationError,
                ),
              );
          },
          error: (error) => {
            this.isSaving.set(false);
            this.error.set(
              "Impossible d'enregistrer ce poste budgétaire pour le moment.",
            );
            this.notifications.error(
              "La sauvegarde du poste budgétaire a échoué.",
            );
            console.error('Failed to create poste', error);
          },
        });

      return;
    }

    const posteId = this.currentPosteId();
    if (!posteId) {
      this.isSaving.set(false);
      this.error.set(
        'Poste budgétaire introuvable, aucune mise à jour possible.',
      );
      this.notifications.error(
        "Impossible de mettre à jour ce poste budgétaire sans identifiant.",
      );
      return;
    }

    const payload = this.buildUpdatePayload();
    this.posteService
      .update(posteId, payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (poste) => {
          this.isSaving.set(false);
          this.notifications.success('Poste budgétaire mis à jour avec succès.');
          this.error.set(null);

          if (poste) {
            this.poste.set(poste);
            this.patchForm(poste);
            return;
          }

          this.posteForm.markAsPristine();
        },
        error: (error) => {
          this.isSaving.set(false);
          this.error.set("La mise à jour du poste budgétaire a échoué.");
          this.notifications.error(
            "Impossible de mettre à jour ce poste budgétaire.",
          );
          console.error('Failed to update poste', error);
        },
      });
  }

  onBack(): void {
    this.router
      .navigate(['/postes'])
      .catch((error) =>
        console.error(
          'Navigation vers la liste des postes impossible',
          error,
        ),
      );
  }

  private watchRoute(): void {
    this.route.paramMap
      .pipe(
        map((params) => params.get('id')),
        distinctUntilChanged(),
        switchMap((id) => {
          if (!id) {
            this.error.set('Aucun poste budgétaire sélectionné.');
            this.isNewMode.set(false);
            this.currentPosteId.set(null);
            this.poste.set(null);
            this.isLoading.set(false);
            return of<Poste | null>(null);
          }

          if (id === 'new') {
            this.enterCreationMode();
            return of<Poste | null>(null);
          }

          this.isNewMode.set(false);
          this.currentPosteId.set(id);
          this.isLoading.set(true);
          this.error.set(null);

          return this.posteService.getById(id).pipe(
            catchError((error) => {
              console.error('Failed to load poste', error);
              this.error.set(
                'Impossible de charger ce poste budgétaire pour le moment.',
              );
              this.notifications.error(
                "Le poste budgétaire n'a pas pu être chargé.",
              );
              this.poste.set(null);
              return of<Poste | null>(null);
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((poste) => {
        this.isLoading.set(false);

        if (!poste) {
          return;
        }

        this.poste.set(poste);
        this.patchForm(poste);
      });
  }

  private enterCreationMode(): void {
    this.isNewMode.set(true);
    this.currentPosteId.set(null);
    this.poste.set(null);
    this.error.set(null);
    this.isLoading.set(false);
    this.resetCreationForm();
  }

  private resetCreationForm(): void {
    this.posteForm.setValue({
      nom: '',
      description: '',
      montant: 0,
      categorie: '',
      dateDebut: '',
      dateFin: '',
    });
    this.posteForm.markAsPristine();
    this.posteForm.markAsUntouched();
  }

  private patchForm(poste: Poste): void {
    this.posteForm.setValue({
      nom: poste.nom ?? '',
      description: poste.description ?? '',
      montant: poste.montant ?? 0,
      categorie: poste.categorie ?? '',
      dateDebut: this.formatDateForInput(poste.dateDebut),
      dateFin: this.formatDateForInput(poste.dateFin),
    });
    this.posteForm.markAsPristine();
    this.posteForm.markAsUntouched();
  }

  private buildCreatePayload(): CreatePostePayload {
    const raw = this.posteForm.getRawValue();
    const description = this.normalizeText(raw.description);
    const dateFin = this.normalizeDate(raw.dateFin);

    const payload = {
      nom: raw.nom.trim(),
      description: description ?? undefined,
      montant: Number(raw.montant),
      categorie: raw.categorie.trim(),
      dateDebut: this.normalizeDate(raw.dateDebut) ?? raw.dateDebut,
      dateFin: dateFin ?? undefined,
    };

    return payload as CreatePostePayload;
  }

  private buildUpdatePayload(): UpdatePostePayload {
    const raw = this.posteForm.getRawValue();
    const description = this.normalizeText(raw.description);
    const dateFin = this.normalizeDate(raw.dateFin);

    const payload = {
      nom: raw.nom.trim(),
      description: description ?? undefined,
      montant: Number(raw.montant),
      categorie: raw.categorie.trim(),
      dateDebut: this.normalizeDate(raw.dateDebut) ?? raw.dateDebut,
      dateFin: dateFin ?? undefined,
    };

    return payload as UpdatePostePayload;
  }

  private normalizeDate(value: string | null | undefined): string | null {
    const trimmed = value?.trim();
    if (!trimmed) {
      return null;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }

    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    return parsed.toISOString().slice(0, 10);
  }

  private normalizeText(value: string | null | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : null;
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
