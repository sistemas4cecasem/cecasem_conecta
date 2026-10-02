import { describe, expect, it } from 'vitest';
import { AUTHENTICATED_NAVIGATION, type NavigationItem, visibleNavigationItems } from './navigation';

// Estos destinos son datos de prueba, no rutas del producto.
const items: readonly NavigationItem[] = [
  { label: 'Común', to: '/' },
  { label: 'Emisión de prueba', to: '/fixture-issue', requiredPermission: 'auth.first_access.issue' },
  { label: 'Reinicio de prueba', to: '/fixture-reset', requiredPermission: 'auth.password_reset.issue' },
];
const roleCases: [string, string[], number][] = [
  ['ADMINISTRATOR', ['auth.first_access.issue', 'auth.password_reset.issue'], 3],
  ['BOARD', [], 1], ['RESEARCH', [], 1], ['PLANNING', [], 1],
];

describe('Filtrado de navegación por capabilities recibidas', () => {
  it.each(roleCases)('%s muestra solo items permitidos y conserva Inicio', (_role, permissions, count) => {
    expect(visibleNavigationItems(items, permissions)).toHaveLength(count);
    expect(visibleNavigationItems(items, permissions)[0]).toEqual(items[0]);
    expect(visibleNavigationItems(AUTHENTICATED_NAVIGATION, permissions)).toEqual([{ label: 'Inicio', to: '/' }]);
  });
  it('filtra un subconjunto sin inferir permisos adicionales desde el rol', () => {
    expect(visibleNavigationItems(items, ['auth.first_access.issue']).map(item => item.to)).toEqual(['/', '/fixture-issue']);
    expect(visibleNavigationItems(items, ['unassigned']).map(item => item.to)).toEqual(['/']);
  });
});
