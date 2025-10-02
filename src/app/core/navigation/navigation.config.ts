export interface NavigationItem {
  path: string;
  label: string;
  icon?: string;
  exact?: boolean;
  requiresAuth?: boolean;
}

export const NAVIGATION_ITEMS: NavigationItem[] = [
  {
    path: '/dashboard',
    label: 'Tableau de bord',
    icon: 'tabler tabler-layout-dashboard',
    requiresAuth: true,
  },
  {
    path: '/profil',
    label: 'Profil',
    icon: 'tabler tabler-user-circle',
    requiresAuth: true,
  },
];
