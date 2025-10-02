import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NotificationsComponent } from './core/notifications/notifications.component';
import { AuthService } from './core/auth/auth.service';

@Component({
  standalone: true,
  selector: 'budget19-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, NotificationsComponent],
})
export class AppComponent {
  private readonly authService = inject(AuthService);

  constructor() {
    this.authService.restoreSession();
  }
}
