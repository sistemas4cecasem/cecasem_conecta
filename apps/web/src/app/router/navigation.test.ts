import { describe, expect, it } from 'vitest';
import { activeNavigationContext, activeNavigationRoute, AUTHENTICATED_NAVIGATION, NAVIGATION_GROUPS, type NavigationItem, visibleNavigationItems } from './navigation';

// Estos destinos son datos de prueba, no rutas del producto.
const items: readonly NavigationItem[] = [
  { label: 'Común', to: '/' },
  { label: 'Emisión de prueba', to: '/fixture-issue', requiredPermission: 'auth.first_access.issue' },
  { label: 'Reinicio de prueba', to: '/fixture-reset', requiredPermission: 'auth.password_reset.issue' },
];
const roleCases: [string, string[], number][] = [
  ['ADMINISTRATOR', ['auth.first_access.issue', 'auth.password_reset.issue', 'users.read'], 3],
  ['BOARD', ['users.read'], 1], ['RESEARCH', [], 1], ['PLANNING', [], 1],
];

describe('Filtrado de navegación por capabilities recibidas', () => {
  it.each(roleCases)('%s muestra solo items permitidos y conserva Inicio', (_role, permissions, count) => {
    expect(visibleNavigationItems(items, permissions)).toHaveLength(count);
    expect(visibleNavigationItems(items, permissions)[0]).toEqual(items[0]);
    expect(visibleNavigationItems(AUTHENTICATED_NAVIGATION, permissions)).toEqual([
      { label: 'Inicio', to: '/' },
      { label: 'Exportar Excel', to: '/admin/exports' },
      ...(permissions.includes('users.read') ? [{ label: 'Usuarios', to: '/users', requiredPermission: 'users.read' }] : []),
    ]);
  });
  it('filtra un subconjunto sin inferir permisos adicionales desde el rol', () => {
    expect(visibleNavigationItems(items, ['auth.first_access.issue']).map(item => item.to)).toEqual(['/', '/fixture-issue']);
    expect(visibleNavigationItems(items, ['unassigned']).map(item => item.to)).toEqual(['/']);
  });
  it('expone los accesos del Directorio con su permiso de lectura existente', () => {
    const visible = visibleNavigationItems(AUTHENTICATED_NAVIGATION, ['directory.read']);
    expect(visible.map(item => item.to)).toEqual(['/', '/organizations', '/people', '/admin/exports']);
    expect(visible.every(item => !item.requiredPermission || item.requiredPermission === 'directory.read')).toBe(true);
  });
  it('limita el grupo Directorio a Organizaciones y Personas externas', () => {
    expect(NAVIGATION_GROUPS.find(group => group.label === 'Directorio')?.routes).toEqual(['/organizations', '/people']);
    expect(AUTHENTICATED_NAVIGATION.filter(item => ['/organizations', '/people'].includes(item.to)).map(item => item.label))
      .toEqual(['Organizaciones', 'Personas externas']);
  });
  it('agrupa cada destino una sola vez sin añadir rutas al catálogo', () => {
    const routes = NAVIGATION_GROUPS.flatMap(group => [...group.routes]);
    expect(new Set(routes).size).toBe(routes.length);
    expect([...routes].sort()).toEqual(AUTHENTICATED_NAVIGATION.map(item => item.to).sort());
  });
  it.each([
    ['/organizations/fixture', '/organizations'], ['/people/fixture', '/people'],
    ['/directory/search', undefined], ['/organizations/categories', '/organizations'],
    ['/contact-methods/fixture', '/organizations'], ['/communications/fixture', '/relationship-processes'],
    ['/relationship-processes/fixture/communications/sent', '/relationship-processes'],
    ['/contact-intents/fixture', '/contact-intents'], ['/opportunities/fixture', '/opportunities'],
    ['/meetings/fixture', '/meetings'], ['/', '/'], ['/unknown', undefined],
  ])('mantiene contexto activo de %s sin cambiar la URL', (pathname, expected) => {
    expect(activeNavigationRoute(pathname)).toBe(expected);
  });
  it.each([
    ['/directory/search', 'Búsqueda'], ['/organizations/categories', 'Categorías'], ['/organizations/fixture', 'Organizaciones'],
  ])('conserva el contexto de la ruta %s sin mostrarla como entrada del sidebar', (pathname, expected) => {
    expect(activeNavigationContext(pathname, ['directory.read'])).toBe(expected);
  });
  it('no revela contexto de Directorio a una identidad sin permiso de lectura', () => {
    expect(activeNavigationContext('/directory/search', [])).toBeUndefined();
    expect(activeNavigationContext('/organizations/categories', [])).toBeUndefined();
  });
});
