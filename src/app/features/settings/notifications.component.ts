import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { Notification } from '../../core/models/notification.model';
import { NotificationService } from '../../core/services/notification.service';

@Component({
  standalone: true,
  selector: 'budget19-settings-notifications',
  templateUrl: './notifications.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
})
export class NotificationsComponent implements OnInit {
  private readonly notificationService = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly notificationsSignal = signal<Notification[]>([]);
  private readonly loadingSignal = signal(false);
  private readonly errorSignal = signal<string | null>(null);
  private readonly markingSignal = signal<Set<string>>(new Set<string>());
  private readonly deletingSignal = signal<Set<string>>(new Set<string>());

  readonly notifications = this.notificationsSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();
  readonly hasNotifications = computed(() => this.notifications().length > 0);

  ngOnInit(): void {
    this.loadNotifications();
  }

  loadNotifications(): void {
    if (this.loading()) {
      return;
    }

    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    this.notificationService
      .list()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loadingSignal.set(false)),
      )
      .subscribe({
        next: (notifications) => {
          const sanitized = Array.isArray(notifications) ? notifications : [];
          this.notificationsSignal.set(this.sortNotifications(sanitized));
          this.markingSignal.set(new Set<string>());
          this.deletingSignal.set(new Set<string>());
        },
        error: (error) => {
          console.error('Impossible de charger les notifications.', error);
          this.errorSignal.set(
            'Impossible de charger les notifications pour le moment. Veuillez réessayer plus tard.',
          );
        },
      });
  }

  markAsRead(notification: Notification): void {
    const id = notification?.id;
    if (!id || notification.read || this.isMarking(id)) {
      return;
    }

    this.errorSignal.set(null);
    this.setMarking(id, true);

    this.notificationService
      .markAsRead(id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.setMarking(id, false)),
      )
      .subscribe({
        next: () => {
          this.notificationsSignal.update((items) =>
            items.map((item) =>
              item.id === id ? { ...item, read: true } : item,
            ),
          );
        },
        error: (error) => {
          console.error(
            `Impossible de marquer la notification ${id} comme lue.`,
            error,
          );
          this.errorSignal.set(
            'La notification n\'a pas pu être marquée comme lue. Veuillez réessayer.',
          );
        },
      });
  }

  deleteNotification(notification: Notification): void {
    const id = notification?.id;
    if (!id || this.isDeleting(id)) {
      return;
    }

    this.errorSignal.set(null);
    this.setDeleting(id, true);

    this.notificationService
      .delete(id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.setDeleting(id, false)),
      )
      .subscribe({
        next: () => {
          this.notificationsSignal.update((items) =>
            items.filter((item) => item.id !== id),
          );
        },
        error: (error) => {
          console.error(
            `Impossible de supprimer la notification ${id}.`,
            error,
          );
          this.errorSignal.set(
            'La notification n\'a pas pu être supprimée. Veuillez réessayer.',
          );
        },
      });
  }

  isMarking(id: string): boolean {
    return this.markingSignal().has(id);
  }

  isDeleting(id: string): boolean {
    return this.deletingSignal().has(id);
  }

  trackById(_index: number, item: Notification): string {
    return item.id;
  }

  getTypeLabel(type: Notification['type']): string {
    switch (type) {
      case 'success':
        return 'Succès';
      case 'error':
        return 'Erreur';
      default:
        return 'Information';
    }
  }

  getMarkAsReadLabel(notification: Notification): string {
    if (notification.read) {
      return '✅ Déjà lue';
    }

    return this.isMarking(notification.id)
      ? '⏳ Marquage…'
      : '✔️ Marquer comme lue';
  }

  getDeleteLabel(notification: Notification): string {
    return this.isDeleting(notification.id)
      ? '⏳ Suppression…'
      : '🗑️ Supprimer';
  }

  private setMarking(id: string, pending: boolean): void {
    this.markingSignal.update((ids) => {
      const next = new Set(ids);
      if (pending) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }

  private setDeleting(id: string, pending: boolean): void {
    this.deletingSignal.update((ids) => {
      const next = new Set(ids);
      if (pending) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }

  private sortNotifications(notifications: Notification[]): Notification[] {
    return [...notifications].sort(
      (a, b) => this.getTimestamp(b.date) - this.getTimestamp(a.date),
    );
  }

  private getTimestamp(value: string): number {
    const timestamp = Date.parse(value);
    return Number.isNaN(timestamp) ? 0 : timestamp;
  }
}
