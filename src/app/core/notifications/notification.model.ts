export type NotificationType = 'success' | 'info' | 'warning' | 'error';

export interface NotificationMessage {
  id: string;
  type: NotificationType;
  message: string;
  title?: string;
  duration?: number | null;
  dismissible?: boolean;
  createdAt: number;
}

export interface NotificationInput {
  message: string;
  title?: string;
  type?: NotificationType;
  duration?: number | null;
  dismissible?: boolean;
}
