import { hasPermission } from '../../features/auth/permissions';

export interface NavigationItem {
  label: string;
  to: string;
  requiredPermission?: string;
}

export const AUTHENTICATED_NAVIGATION: readonly NavigationItem[] = [
  { label: 'Inicio', to: '/' },
];

export function visibleNavigationItems(items: readonly NavigationItem[], permissions: readonly string[]): NavigationItem[] {
  return items.filter(item => item.requiredPermission === undefined || hasPermission(permissions, item.requiredPermission));
}
