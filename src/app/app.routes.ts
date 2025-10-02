import { Routes } from '@angular/router';
import { MainLayoutComponent } from './layout/main-layout.component';
import { authGuard } from './core/guards/auth.guard';

export const appRoutes: Routes = [
  {
    path: '',
    component: MainLayoutComponent,
    children: [
      {
        path: 'dashboard',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then(
            (m) => m.DashboardComponent,
          ),
        data: {
          title: 'Tableau de bord',
          icon: 'tabler-home',
        },
      },
      {
        path: 'budgets',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/budgets/budget-list.component').then(
            (m) => m.BudgetListComponent,
          ),
        data: {
          title: 'Budgets',
          icon: 'tabler-wallet',
        },
      },
      {
        path: 'budgets/:id',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/budgets/budget-detail.component').then(
            (m) => m.BudgetDetailComponent,
          ),
        data: {
          title: 'Détail du budget',
          icon: 'tabler-report-money',
        },
      },
      {
        path: 'profil',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/profile/profile.component').then(
            (m) => m.ProfileComponent,
          ),
        data: {
          title: 'Profil utilisateur',
          icon: 'tabler-user-circle',
        },
      },
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'dashboard',
      },
    ],
  },
  {
    path: 'auth',
    children: [
      {
        path: 'login',
        loadComponent: () =>
          import('./features/auth/login.component').then(
            (m) => m.LoginComponent,
          ),
        data: {
          title: 'Connexion',
          layout: 'blank',
        },
      },
      {
        path: 'reset-password',
        loadComponent: () =>
          import('./features/auth/reset-password.component').then(
            (m) => m.ResetPasswordComponent,
          ),
        data: {
          title: 'Réinitialisation du mot de passe',
          layout: 'blank',
        },
      },
    ],
  },
  {
    path: '**',
    loadComponent: () =>
      import('./features/not-found/not-found.component').then(
        (m) => m.NotFoundComponent,
      ),
    data: {
      title: 'Page introuvable',
    },
  },
];
