import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../../app/router/app-routes';
import { createQueryClient } from '../../lib/query/query-client';
import { AUTH_QUERY_KEY, type AuthIdentity } from '../auth/session';
import type { Organization } from './contracts';

const identity: AuthIdentity = { id: 'rf12-user', givenNames: 'QA', familyNames: 'RF12', username: 'qa.rf12', email: 'rf12@example.test', role: 'RESEARCH', permissions: ['directory.read'] };
const stamp = '2026-10-03T00:00:00.000Z';
const x = { id: '00000000-0000-4000-8000-000000000001', name: 'Educación', isActive: true, version: 1, createdAt: stamp, updatedAt: stamp };
const y = { ...x, id: '00000000-0000-4000-8000-000000000002', name: 'Ambiente', isActive: false };
const empty = { ...x, id: '00000000-0000-4000-8000-000000000003', name: 'Sin organizaciones' };
const a: Organization = { id: 'a', name: 'Organización A', country: null, alias: null, description: null, officialWebsite: null, isActive: true, version: 1, parentId: null, parent: null, categories: [x, y], createdAt: stamp, updatedAt: stamp, lastVerifiedAt: null };
const b = { ...a, id: 'b', name: 'Organización B', isActive: false, categories: [x] };
const d = { ...a, id: 'd', name: 'Organización sin categoría', categories: [] };
const page = (items: unknown[], total = items.length, number = 1) => ({ items, total, page: number, pageSize: 25 });

describe('RF-12: categoría y estado del listado de organizaciones', () => {
  let client = createQueryClient(), current: AuthIdentity | null = identity;
  let catalogMode = 'ok', listMode = 'ok', paginated = false, largeCatalog = false;
  const fetchMock = vi.fn<(url: string, options?: RequestInit) => Promise<Response>>();
  beforeEach(() => {
    client = createQueryClient(); current = identity; catalogMode = 'ok'; listMode = 'ok'; paginated = false; largeCatalog = false;
    fetchMock.mockReset(); fetchMock.mockImplementation((url, options) => {
      if (url.endsWith('auth/me')) return Promise.resolve(Response.json(current ?? {}, { status: current ? 200 : 401 }));
      if (url.endsWith('auth/logout')) { current = null; return Promise.resolve(new Response(null, { status: 204 })); }
      const query = new URL(url, 'http://localhost').searchParams;
      if (url.includes('/categories?')) {
        if (catalogMode === 'pending') return new Promise<Response>(() => undefined);
        if (catalogMode === 'error') return Promise.resolve(new Response(null, { status: 500 }));
        return Promise.resolve(Response.json(page(catalogMode === 'empty' ? [] : largeCatalog && query.get('page') === '2' ? [empty] : [x, y, empty], largeCatalog ? 26 : catalogMode === 'empty' ? 0 : 3, Number(query.get('page')))));
      }
      if (url.includes('/organizations?')) {
        if (listMode === 'pending') return new Promise<Response>(() => undefined);
        if (listMode === 'error') return Promise.resolve(new Response(null, { status: 500 }));
        const items = [a, b, d].filter(row => (query.get('status') === 'all' || row.isActive === (query.get('status') !== 'inactive')) &&
          (!query.has('categoryId') || row.categories.some(category => category.id === query.get('categoryId'))));
        return Promise.resolve(Response.json(page(paginated && query.get('page') === '2' ? [{ ...a, id: 'page2', name: 'Segunda página' }] : items, paginated ? 26 : items.length, Number(query.get('page')))));
      }
      void options;
      return Promise.resolve(new Response(null, { status: 404 }));
    }); vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => { client.clear(); vi.unstubAllGlobals(); });
  function view() { return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/organizations']}><AppRoutes /></MemoryRouter></QueryClientProvider>); }
  const listCalls = () => fetchMock.mock.calls.filter(([url]) => url.includes('/organizations?'));
  const catalog = () => within(screen.getByRole('region', { name: 'Catálogo de categorías para filtrar' }));
  const results = () => within(screen.getByRole('region', { name: 'Resultados de organizaciones' }));
  async function select(id: string) { await waitFor(() => expect(screen.getByLabelText('Categoría')).toBeEnabled()); await userEvent.selectOptions(screen.getByLabelText('Categoría'), id); }

  it('incluye todas las categorías y consulta el catálogo, incluidas las inactivas', async () => {
    view(); await screen.findByRole('option', { name: 'Ambiente (inactiva)' });
    expect(screen.getByLabelText('Categoría')).toHaveValue(''); expect(screen.getByRole('option', { name: 'Todas las categorías' })).toBeVisible();
    expect(fetchMock.mock.calls.find(([url]) => url.includes('/categories?'))?.[0]).toContain('status=all');
    expect(listCalls()[0]?.[0]).not.toContain('categoryId'); expect(await screen.findByRole('link', { name: d.name })).toBeVisible();
  });
  it('solicita categoría al backend y una organización multiclase aparece una sola vez', async () => {
    view(); await select(x.id); await waitFor(() => expect(listCalls().at(-1)?.[0]).toContain('categoryId=' + x.id));
    expect(await screen.findByRole('link', { name: a.name })).toBeVisible();
    await waitFor(() => expect(screen.queryByRole('link', { name: d.name })).not.toBeInTheDocument());
    expect(screen.getAllByRole('link', { name: a.name })).toHaveLength(1); expect(results().getByText(/1 registros/)).toBeVisible();
  });
  it('combina categoría con estado y volver a todas recupera las fichas sin categoría', async () => {
    view(); await select(x.id); await userEvent.selectOptions(screen.getByLabelText('Estado'), 'inactive');
    expect(await screen.findByRole('link', { name: b.name })).toBeVisible();
    expect(listCalls().at(-1)?.[0]).toContain('status=inactive'); expect(listCalls().at(-1)?.[0]).toContain('categoryId=' + x.id);
    await userEvent.selectOptions(screen.getByLabelText('Estado'), 'all'); await select('');
    expect(await screen.findByRole('link', { name: d.name })).toBeVisible(); expect(listCalls().at(-1)?.[0]).not.toContain('categoryId');
  });
  it('reinicia página al cambiar categoría y estado, conservando filtros al paginar', async () => {
    paginated = true; view(); await screen.findByRole('link', { name: a.name }); await select(x.id);
    await userEvent.click(results().getByRole('button', { name: 'Siguiente' })); await screen.findByRole('link', { name: 'Segunda página' });
    expect(screen.getByLabelText('Categoría')).toHaveValue(x.id); expect(listCalls().at(-1)?.[0]).toContain('page=2'); expect(listCalls().at(-1)?.[0]).toContain('categoryId=' + x.id);
    await select(y.id); await waitFor(() => expect(listCalls().at(-1)?.[0]).toContain('page=1')); expect(listCalls().at(-1)?.[0]).toContain('categoryId=' + y.id);
    await userEvent.click(results().getByRole('button', { name: 'Siguiente' })); await screen.findByRole('link', { name: 'Segunda página' });
    await userEvent.selectOptions(screen.getByLabelText('Estado'), 'all'); await waitFor(() => expect(listCalls().at(-1)?.[0]).toContain('page=1'));
    expect(listCalls().at(-1)?.[0]).toContain('status=all'); expect(listCalls().at(-1)?.[0]).toContain('categoryId=' + y.id);
  });
  it('permite recorrer el catálogo sin perder categoría elegida ni descargar todas sus páginas', async () => {
    largeCatalog = true; view(); await select(x.id);
    expect(fetchMock.mock.calls.filter(([url]) => url.includes('/categories?'))).toHaveLength(1);
    await userEvent.click(catalog().getByRole('button', { name: 'Siguiente' })); await waitFor(() => expect(catalog().getByText(/Página 2 de 2/)).toBeVisible());
    expect(screen.getByLabelText('Categoría')).toHaveValue(x.id); expect(catalog().getByRole('option', { name: x.name })).toBeVisible();
    await select(empty.id); expect(await screen.findByText('No hay organizaciones para estos filtros.')).toBeVisible();
    expect(fetchMock.mock.calls.filter(([url]) => url.includes('/categories?'))).toHaveLength(2);
  });
  it('muestra resultado vacío para una categoría sin organizaciones', async () => { view(); await select(empty.id); expect(await screen.findByText('No hay organizaciones para estos filtros.')).toBeVisible(); expect(results().getByText(/0 registros/)).toBeVisible(); });
  it('muestra carga del catálogo y deshabilita el selector mientras espera', async () => { catalogMode = 'pending'; view(); expect(await screen.findByText('Cargando categorías…')).toBeVisible(); expect(screen.getByLabelText('Categoría')).toBeDisabled(); });
  it('recupera un error del catálogo sin perder el listado', async () => {
    catalogMode = 'error'; view(); await waitFor(() => expect(catalog().getByRole('alert')).toBeVisible()); expect(screen.getByLabelText('Categoría')).toBeDisabled();
    expect(await screen.findByRole('link', { name: a.name })).toBeVisible(); catalogMode = 'ok'; await userEvent.click(catalog().getByRole('button', { name: 'Reintentar' })); await select(y.id); expect(screen.getByLabelText('Categoría')).toHaveValue(y.id);
  });
  it('un catálogo vacío mantiene la opción Todas las categorías', async () => { catalogMode = 'empty'; view(); expect(await screen.findByText('No hay categorías registradas.')).toBeVisible(); expect(screen.getByLabelText('Categoría')).toHaveValue(''); expect(await screen.findByRole('link', { name: a.name })).toBeVisible(); });
  it('muestra carga y permite reintentar el listado filtrado conservando controles', async () => {
    view(); await screen.findByRole('link', { name: a.name }); listMode = 'pending'; await select(x.id); expect(await screen.findByText('Cargando…')).toBeVisible();
    listMode = 'error'; await select(y.id); await waitFor(() => expect(results().getByRole('alert')).toBeVisible());
    listMode = 'ok'; await userEvent.click(results().getByRole('button', { name: 'Reintentar' })); expect(await screen.findByRole('link', { name: a.name })).toBeVisible(); expect(screen.getByLabelText('Categoría')).toHaveValue(y.id);
  });
  it.each(['ADMINISTRATOR', 'BOARD', 'RESEARCH', 'PLANNING'] as const)('permite filtrar con directory.read al rol %s sin permiso de edición', async role => {
    current = { ...identity, role }; view(); await select(x.id); expect(await screen.findByRole('link', { name: a.name })).toBeVisible(); expect(screen.queryByRole('link', { name: 'Crear organización' })).not.toBeInTheDocument(); expect(listCalls().at(-1)?.[0]).toContain('categoryId=' + x.id);
  });
  it('sin directory.read no consulta categorías ni organizaciones', async () => { current = { ...identity, permissions: [] }; view(); await screen.findByText('No tienes permiso para consultar el directorio.'); expect(listCalls()).toHaveLength(0); expect(fetchMock.mock.calls.some(([url]) => url.includes('/categories?'))).toBe(false); });
  it('logout elimina resultados y catálogo de la caché', async () => {
    view(); await select(x.id); await screen.findByRole('link', { name: a.name }); await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    await screen.findByRole('heading', { name: 'Iniciar sesión' }); expect(client.getQueriesData({ queryKey: ['directory'] })).toHaveLength(0);
  });
  it('el cambio de identidad elimina el filtro, catálogo y caché de la sesión anterior', async () => {
    view(); await select(x.id); await screen.findByRole('link', { name: a.name }); current = { ...identity, id: 'segunda-identidad' };
    await act(async () => { await client.invalidateQueries({ queryKey: AUTH_QUERY_KEY }); });
    await waitFor(() => expect(screen.getByLabelText('Categoría')).toHaveValue(''));
    await screen.findByRole('link', { name: d.name }); expect(client.getQueriesData({ queryKey: ['directory', identity.id] })).toHaveLength(0); expect(listCalls().at(-1)?.[0]).not.toContain('categoryId');
  });
});
