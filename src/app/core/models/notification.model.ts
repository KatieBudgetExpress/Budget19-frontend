export interface Notification {
  id: string;
  message: string;
  type: 'info' | 'success' | 'error';
  date: string;
  read: boolean;
}
