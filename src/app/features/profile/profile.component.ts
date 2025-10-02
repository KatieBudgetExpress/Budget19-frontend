import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
  import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { timer } from 'rxjs';
import { AuthService, AuthUser } from '../../core/auth/auth.service';
import { NotificationService } from '../../core/notifications/notification.service';

@Component({
  standalone: true,
  selector: 'budget19-profile',
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],
})
export class ProfileComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly notifications = inject(NotificationService);

  readonly isSaving = signal(false);
  readonly lastSavedAt = signal<number | null>(null);
  private readonly previewUser = signal<AuthUser | null>(null);

  readonly currentUser = this.authService.currentUser;
  readonly displayedUser = computed<AuthUser | null>(
    () => this.previewUser() ?? this.currentUser(),
  );

  readonly profileForm = this.fb.nonNullable.group({
    displayName: ['', [Validators.required, Validators.maxLength(60)]],
    email: ['', [Validators.required, Validators.email]],
  });

  get displayNameControl() {
    return this.profileForm.controls.displayName;
  }

  get emailControl() {
    return this.profileForm.controls.email;
  }

  constructor() {
    effect(() => {
      const user = this.currentUser();
      const preview = this.previewUser();

      if (!user) {
        if (preview !== null) {
          this.previewUser.set(null);
        }
        this.syncFormWith(null);
        return;
      }

      if (preview && preview.id !== user.id) {
        this.previewUser.set(null);
        this.syncFormWith(user);
        return;
      }

      this.syncFormWith(preview ?? user);
    });
  }

  onSubmit(): void {
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }

    if (this.isSaving()) {
      return;
    }

    const user = this.currentUser();
    if (!user) {
      return;
    }

    this.isSaving.set(true);

    const { displayName, email } = this.profileForm.getRawValue();
    const normalizedDisplayName = displayName.trim();
    const normalizedEmail = email.trim();

    timer(850).subscribe({
      next: () => {
        const updatedUser: AuthUser = {
          ...user,
          displayName: normalizedDisplayName,
          email: normalizedEmail,
        };

        this.previewUser.set(updatedUser);
        this.notifications.success('Profil mis à jour avec succès.');
        this.lastSavedAt.set(Date.now());
      },
      error: (error) => {
        console.error('Erreur lors de la simulation de sauvegarde du profil.', error);
        this.notifications.error(
          'La sauvegarde du profil a échoué. Veuillez réessayer plus tard.',
        );
        this.isSaving.set(false);
      },
      complete: () => {
        this.isSaving.set(false);
      },
    });
  }

  onReset(): void {
    const baseline = this.previewUser() ?? this.currentUser();
    this.syncFormWith(baseline);
  }

  private syncFormWith(user: AuthUser | null): void {
    if (!user) {
      this.profileForm.reset(
        {
          displayName: '',
          email: '',
        },
        { emitEvent: false },
      );
      this.profileForm.markAsPristine();
      this.profileForm.markAsUntouched();
      return;
    }

    this.profileForm.reset(
      {
        displayName: user.displayName ?? '',
        email: user.email,
      },
      { emitEvent: false },
    );
    this.profileForm.markAsPristine();
    this.profileForm.markAsUntouched();
  }
}
