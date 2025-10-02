import { Injectable, signal } from '@angular/core';
import { NotificationInput, NotificationMessage } from './notification.model';

const DEFAULT_DURATION = 5000;

@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  private readonly notificationsSignal = signal<NotificationMessage[]>([]);

  readonly notifications = this.notificationsSignal.asReadonly();

  push(input: NotificationInput): NotificationMessage {
    const notification: NotificationMessage = {
      id: this.generateId(),
      type: input.type ?? 'info',
      message: input.message,
      title: input.title,
      duration: input.duration === undefined ? DEFAULT_DURATION : input.duration,
      dismissible: input.dismissible ?? true,
      createdAt: Date.now(),
    };

    this.notificationsSignal.update((notifications) => [...notifications, notification]);

    if (
      notification.duration &&
      notification.duration > 0 &&
      typeof window !== 'undefined'
    ) {
      window.setTimeout(() => this.dismiss(notification.id), notification.duration);
    }

    return notification;
  }

  success(
    message: string,
    options: Omit<NotificationInput, 'message' | 'type'> = {},
  ): NotificationMessage {
    return this.push({ ...options, message, type: 'success' });
  }

  info(
    message: string,
    options: Omit<NotificationInput, 'message' | 'type'> = {},
  ): NotificationMessage {
    return this.push({ ...options, message, type: 'info' });
  }

  warning(
    message: string,
    options: Omit<NotificationInput, 'message' | 'type'> = {},
  ): NotificationMessage {
    return this.push({ ...options, message, type: 'warning' });
  }

  error(
    message: string,
    options: Omit<NotificationInput, 'message' | 'type'> = {},
  ): NotificationMessage {
    return this.push({ ...options, message, type: 'error' });
  }

  dismiss(id: string): void {
    this.notificationsSignal.update((notifications) =>
      notifications.filter((notification) => notification.id !== id),
    );
  }

  clear(): void {
    this.notificationsSignal.set([]);
  }

  private generateId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }

    return `notif_${Math.random().toString(36).slice(2, 11)}`;
  }
}
