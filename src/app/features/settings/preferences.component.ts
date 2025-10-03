import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  OnInit,
  inject,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
  import { finalize } from 'rxjs';
import { ProfilService } from '../../core/services/profil.service';
import { NotificationService as UiNotificationService } from '../../core/notifications/notification.service';

type ThemePreference = 'light' | 'dark';

interface UserPreferences {
  language: string;
  currency: string;
  theme: ThemePreference;
  updatedAt?: string | null;
}

@Component({
  standalone: true,
  selector: 'budget19-settings-preferences',
  templateUrl: './preferences.component.html',
  styleUrls: ['./preferences.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],
})
export class PreferencesComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly profilService = inject(ProfilService);
  private readonly notifications = inject(UiNotificationService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly languages: ReadonlyArray<{ value: string; label: string }> = [
    { value: 'fr', label: 'Français' },
    { value: 'en', label: 'English' },
    { value: 'es', label: 'Español' },
    { value: 'de', label: 'Deutsch' },
  ];

  readonly currencies: ReadonlyArray<{ value: string; label: string }> = [
    { value: 'EUR', label: 'Euro (€)' },
    { value: 'USD', label: 'Dollar américain ($)' },
    { value: 'GBP', label: 'Livre sterling (£)' },
    { value: 'CHF', label: 'Franc suisse (CHF)' },
  ];

  readonly themes: ReadonlyArray<{ value: ThemePreference; label: string }> = [
    { value: 'light', label: 'Thème clair' },
    { value: 'dark', label: 'Thème sombre' },
  ];

  readonly preferencesForm = this.fb.nonNullable.group({
    language: ['fr', Validators.required],
    currency: ['EUR', Validators.required],
    theme: ['light' as ThemePreference, Validators.required],
  });

  loading = false;
  saving = false;
  error: string | null = null;
  lastSavedAt: number | null = null;

  private baseline: UserPreferences | null = null;

  ngOnInit(): void {
    this.loadPreferences();
  }

  get languageControl() {
    return this.preferencesForm.controls.language;
  }

  get currencyControl() {
    return this.preferencesForm.controls.currency;
  }

  get themeControl() {
    return this.preferencesForm.controls.theme;
  }

  get isResetDisabled(): boolean {
    return this.saving || this.baseline === null;
  }

  refresh(): void {
    if (this.loading || this.saving) {
      return;
    }

    this.loadPreferences();
  }

  onSubmit(): void {
    if (this.preferencesForm.invalid) {
      this.preferencesForm.markAllAsTouched();
      return;
    }

    if (this.saving) {
      return;
    }

    const formValue = this.preferencesForm.getRawValue();
    const payload: UserPreferences = {
      language: formValue.language,
      currency: formValue.currency,
      theme: formValue.theme,
    };

    this.saving = true;
    this.error = null;
    this.cdr.markForCheck();

    this.profilService
      .updatePreferences(payload)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.saving = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (preferences) => {
          const normalized = this.normalizePreferences(
            preferences as UserPreferences,
          );
          this.baseline = normalized;
          this.applyPreferences(normalized);
          this.updateLastSavedAt(normalized.updatedAt ?? null, {
            fallbackToNow: true,
          });
          this.notifications.success('Préférences mises à jour avec succès.');
          this.error = null;
          this.cdr.markForCheck();
        },
        error: (error) => {
          console.error(
            'Erreur lors de la mise à jour des préférences utilisateur.',
            error,
          );
          this.error =
            'La sauvegarde des préférences a échoué. Veuillez réessayer ultérieurement.';
          this.cdr.markForCheck();
        },
      });
  }

  onReset(): void {
    if (!this.baseline) {
      return;
    }

    this.applyPreferences(this.baseline);
    this.error = null;
    this.cdr.markForCheck();
  }

  private loadPreferences(): void {
    this.loading = true;
    this.error = null;
    this.cdr.markForCheck();

    this.profilService
      .getPreferences()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (preferences) => {
          const normalized = this.normalizePreferences(
            preferences as UserPreferences,
          );
          this.baseline = normalized;
          this.applyPreferences(normalized);
          this.updateLastSavedAt(normalized.updatedAt ?? null);
          this.error = null;
          this.cdr.markForCheck();
        },
        error: (error) => {
          console.error(
            'Erreur lors du chargement des préférences utilisateur.',
            error,
          );
          this.error =
            'Impossible de charger vos préférences pour le moment. Veuillez réessayer plus tard.';
          this.cdr.markForCheck();
        },
      });
  }

  private applyPreferences(preferences: UserPreferences): void {
    this.preferencesForm.reset(
      {
        language: preferences.language,
        currency: preferences.currency,
        theme: preferences.theme,
      },
      { emitEvent: false },
    );
    this.preferencesForm.markAsPristine();
    this.preferencesForm.markAsUntouched();
  }

  private normalizePreferences(
    preferences: Partial<UserPreferences> | null | undefined,
  ): UserPreferences {
    const defaults: UserPreferences = {
      language: 'fr',
      currency: 'EUR',
      theme: 'light',
      updatedAt: null,
    };

    if (!preferences) {
      return defaults;
    }

    const availableLanguages = this.languages.map((language) => language.value);
    const availableCurrencies = this.currencies.map(
      (currency) => currency.value,
    );

    const languageInput =
      typeof preferences.language === 'string'
        ? preferences.language.trim().toLowerCase()
        : '';
    const currencyInput =
      typeof preferences.currency === 'string'
        ? preferences.currency.trim().toUpperCase()
        : '';

    const normalizedLanguage = availableLanguages.includes(languageInput)
      ? languageInput
      : defaults.language;

    const normalizedCurrency = availableCurrencies.includes(currencyInput)
      ? currencyInput
      : defaults.currency;

    const normalizedTheme: ThemePreference =
      preferences.theme === 'dark' ? 'dark' : 'light';

    const normalizedUpdatedAt =
      typeof preferences.updatedAt === 'string' &&
      preferences.updatedAt.trim().length > 0
        ? preferences.updatedAt
        : null;

    return {
      language: normalizedLanguage,
      currency: normalizedCurrency,
      theme: normalizedTheme,
      updatedAt: normalizedUpdatedAt,
    };
  }

  private updateLastSavedAt(
    updatedAt: string | null,
    options: { fallbackToNow?: boolean } = {},
  ): void {
    if (!updatedAt) {
      this.lastSavedAt = options.fallbackToNow ? Date.now() : null;
      return;
    }

    const timestamp = new Date(updatedAt).getTime();
    if (Number.isNaN(timestamp)) {
      this.lastSavedAt = options.fallbackToNow ? Date.now() : null;
      return;
    }

    this.lastSavedAt = timestamp;
  }
}
