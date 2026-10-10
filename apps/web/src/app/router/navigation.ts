import { hasPermission } from '../../features/auth/permissions';

export interface NavigationItem {
  label: string;
  to: string;
  requiredPermission?: string;
}

export const AUTHENTICATED_NAVIGATION: readonly NavigationItem[] = [
  { label: 'Inicio', to: '/' },
  { label: 'Organizaciones', to: '/organizations', requiredPermission: 'directory.read' },
  { label: 'Personas externas', to: '/people', requiredPermission: 'directory.read' },
  { label: 'Intenciones', to: '/contact-intents', requiredPermission: 'relationships.intent.read' },
  { label: 'Oportunidades', to: '/opportunities', requiredPermission: 'opportunities.read' },
  { label: 'Reuniones', to: '/meetings', requiredPermission: 'meetings.read' },
  { label: 'Procesos', to: '/relationship-processes', requiredPermission: 'relationships.process.read' },
  { label: 'Restricciones', to: '/contact-restrictions', requiredPermission: 'relationships.restriction.read' },
  { label: 'Configuración de recordatorios', to: '/settings/reminders', requiredPermission: 'settings.reminders.update' },
  { label: 'Configuración de verificación', to: '/settings/verification', requiredPermission: 'settings.verification.update' },
  { label: 'Importar Excel', to: '/admin/imports', requiredPermission: 'data_exchange.import.execute' },
  { label: 'Exportar Excel', to: '/admin/exports' },
  { label: 'Usuarios', to: '/users', requiredPermission: 'users.read' },
];

// Estas pantallas siguen siendo rutas autenticadas, pero no son destinos del sidebar.
const CONTEXTUAL_NAVIGATION: readonly NavigationItem[] = [
  { label: 'Búsqueda', to: '/directory/search', requiredPermission: 'directory.read' },
  { label: 'Categorías', to: '/organizations/categories', requiredPermission: 'directory.read' },
];

export const NAVIGATION_GROUPS = [
  { label: 'Inicio', routes: ['/'] },
  { label: 'Directorio', routes: ['/organizations', '/people'] },
  { label: 'Relaciones', routes: ['/contact-intents', '/relationship-processes', '/contact-restrictions'] },
  { label: 'Planificación y seguimiento', routes: ['/opportunities', '/meetings'] },
  { label: 'Herramientas', routes: ['/admin/exports', '/admin/imports'] },
  { label: 'Administración', routes: ['/users', '/settings/reminders', '/settings/verification'] },
] as const;

export function activeNavigationRoute(pathname: string): string | undefined {
  if (/^\/contact-methods(?:\/|$)/u.test(pathname)) return '/organizations';
  if (/^\/communications(?:\/|$)/u.test(pathname)) return '/relationship-processes';
  return [...AUTHENTICATED_NAVIGATION].sort((a, b) => b.to.length - a.to.length)
    .find(item => pathname === item.to || (item.to !== '/' && pathname.startsWith(`${item.to}/`)))?.to;
}

export function activeNavigationContext(pathname: string, permissions: readonly string[]): string | undefined {
  const contextualItem = [...visibleNavigationItems(CONTEXTUAL_NAVIGATION, permissions)]
    .sort((a, b) => b.to.length - a.to.length)
    .find(item => pathname === item.to || pathname.startsWith(`${item.to}/`));
  if (contextualItem) return contextualItem.label;
  const activeRoute = activeNavigationRoute(pathname);
  return visibleNavigationItems(AUTHENTICATED_NAVIGATION, permissions).find(item => item.to === activeRoute)?.label;
}

export function visibleNavigationItems(items: readonly NavigationItem[], permissions: readonly string[]): NavigationItem[] {
  return items.filter(item => item.requiredPermission === undefined || hasPermission(permissions, item.requiredPermission));
}
