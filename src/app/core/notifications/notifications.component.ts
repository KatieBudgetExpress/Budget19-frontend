import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NgClass, NgFor, NgIf } from '@angular/common';
import { NotificationService } from './notification.service';
import { NotificationMessage } from './notification.model';

@Component({
  standalone: true,
  selector: 'budget19-notifications',
  templateUrl: './notifications.component.html',
  styleUrls: ['./notifications.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgFor, NgIf, NgClass],
})
export class NotificationsComponent {
  private readonly notificationService = inject(NotificationService);

  readonly notifications = this.notificationService.notifications;

  trackById(index: number, notification: NotificationMessage): string {
    return notification.id;
  }

  dismiss(notification: NotificationMessage): void {
    if (!notification.dismissible) {
      return;
    }

    this.notificationService.dismiss(notification.id);
  }
}
