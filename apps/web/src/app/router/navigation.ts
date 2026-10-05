import { hasPermission } from '../../features/auth/permissions';

export interface NavigationItem {
  label: string;
  to: string;
  requiredPermission?: string;
}

export const AUTHENTICATED_NAVIGATION: readonly NavigationItem[] = [
  { label: 'Inicio', to: '/' },
  { label: 'Directorio', to: '/organizations', requiredPermission: 'directory.read' },
  { label: 'Intenciones', to: '/contact-intents', requiredPermission: 'relationships.intent.read' },
  { label: 'Oportunidades', to: '/opportunities', requiredPermission: 'opportunities.read' },
  { label: 'Reuniones', to: '/meetings', requiredPermission: 'meetings.read' },
  { label: 'Procesos', to: '/relationship-processes', requiredPermission: 'relationships.process.read' },
  { label: 'Restricciones', to: '/contact-restrictions', requiredPermission: 'relationships.restriction.read' },
  { label: 'Recordatorios', to: '/settings/reminders', requiredPermission: 'settings.reminders.update' },
  { label: 'Verificación', to: '/settings/verification', requiredPermission: 'settings.verification.update' },
  { label: 'Usuarios', to: '/users', requiredPermission: 'users.read' },
];

export function visibleNavigationItems(items: readonly NavigationItem[], permissions: readonly string[]): NavigationItem[] {
  return items.filter(item => item.requiredPermission === undefined || hasPermission(permissions, item.requiredPermission));
}
