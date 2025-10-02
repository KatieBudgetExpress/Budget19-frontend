import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgIf } from '@angular/common';
import { RouterLink } from '@angular/router';
import { timer } from 'rxjs';
import { NotificationService } from '../../core/notifications/notification.service';

@Component({
  standalone: true,
  selector: 'budget19-reset-password',
  templateUrl: './reset-password.component.html',
  styleUrls: ['./reset-password.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, NgIf],
})
export class ResetPasswordComponent {
  private readonly fb = inject(FormBuilder);
  private readonly notifications = inject(NotificationService);

  readonly isSubmitting = signal(false);
  readonly lastSubmittedEmail = signal<string | null>(null);

  readonly resetForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  get emailControl() {
    return this.resetForm.controls.email;
  }

  onSubmit(): void {
    if (this.resetForm.invalid) {
      this.resetForm.markAllAsTouched();
      return;
    }

    if (this.isSubmitting()) {
      return;
    }

    this.isSubmitting.set(true);

    const email = this.emailControl.value.trim();

    timer(900).subscribe({
      next: () => {
        this.notifications.success(
          'Si un compte correspond à cette adresse, un lien de réinitialisation vient d\'être envoyé.',
        );
        this.lastSubmittedEmail.set(email);
        this.resetForm.reset({ email }, { emitEvent: false });
        this.resetForm.markAsPristine();
        this.resetForm.markAsUntouched();
      },
      error: (error) => {
        console.error('Erreur lors de la simulation d’envoi du lien de réinitialisation.', error);
        this.notifications.error(
          "Impossible d'envoyer le lien de réinitialisation pour le moment. Veuillez réessayer plus tard.",
        );
        this.isSubmitting.set(false);
      },
      complete: () => {
        this.isSubmitting.set(false);
      },
    });
  }
}
