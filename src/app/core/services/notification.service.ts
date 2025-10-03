import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { Notification } from '../models/notification.model';

@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/notifications';

  list(): Observable<Notification[]> {
    return this.http.get<Notification[]>(this.baseUrl);
  }

  markAsRead(id: string): Observable<void> {
    return this.http.patch<void>(`${this.baseUrl}/${id}`, { read: true });
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
