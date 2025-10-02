import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { AsyncPipe, NgClass, NgFor, NgIf } from '@angular/common';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../core/auth/auth.service';
import { NAVIGATION_ITEMS, NavigationItem } from '../core/navigation/navigation.config';

@Component({
  standalone: true,
  selector: 'budget19-main-layout',
  templateUrl: './main-layout.component.html',
  styleUrls: ['./main-layout.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NgFor, NgIf, NgClass, AsyncPipe],
})
export class MainLayoutComponent {
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly authService = inject(AuthService);

  readonly allNavigation = signal<NavigationItem[]>(NAVIGATION_ITEMS);
  readonly visibleNavigation = computed(() =>
    this.allNavigation().filter((item) =>
      item.requiresAuth ? this.authService.isAuthenticated() : true,
    ),
  );
  readonly isSidebarOpened = signal<boolean>(true);
  readonly pageTitle = signal<string>('Budget19');

  readonly isAuthenticated$ = this.authService.isAuthenticated$;
  readonly currentUser$ = this.authService.currentUser$;

  constructor() {
    const subscription = this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(() => {
        this.pageTitle.set(this.resolveRouteTitle());
      });

    this.pageTitle.set(this.resolveRouteTitle());

    this.destroyRef.onDestroy(() => subscription.unsubscribe());
  }

  toggleSidebar(): void {
    this.isSidebarOpened.update((value) => !value);
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/auth/login']).catch((error) => console.error(error));
  }

  trackByPath(index: number, item: NavigationItem): string {
    return item.path;
  }

  private resolveRouteTitle(): string {
    let snapshot = this.router.routerState.snapshot.root;
    while (snapshot.firstChild) {
      snapshot = snapshot.firstChild;
    }
    return (snapshot.data?.['title'] as string) ?? 'Budget19';
  }
}
