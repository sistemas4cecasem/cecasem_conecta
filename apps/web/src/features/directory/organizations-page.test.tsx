import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../../app/router/app-routes';
import { createQueryClient } from '../../lib/query/query-client';
import { AUTH_QUERY_KEY, type AuthIdentity } from '../auth/session';
import type { Organization } from './contracts';

const stamp = '2026-10-07T00:00:00Z';
const category = { id: '11111111-1111-4111-8111-111111111111', name: 'Educación', isActive: true, version: 1, createdAt: stamp, updatedAt: stamp };
const organization = { id: 'org-ui23', name: 'Organización institucional', country: 'Bolivia', alias: null, description: null, officialWebsite: null,
  isActive: true, parentId: 'parent', parent: { id: 'parent', name: 'Matriz institucional', isActive: true }, categories: [category], version: 1, createdAt: stamp, updatedAt: stamp, lastVerifiedAt: null };
const baseIdentity: AuthIdentity = { id: 'ui23', givenNames: 'QA', familyNames: 'Directorio', username: 'ui23', email: 'qa@example.test', role: 'ADMINISTRATOR',
  permissions: ['directory.read', 'directory.write', 'relationships.process.read', 'communications.read'] };
function Location() { return <output aria-label="URL actual">{useLocation().search}</output>; }

describe('UI 2.3 listado de organizaciones', () => {
  let client = createQueryClient(), identity = baseIdentity, mode = 'ok', total = 1;
  let row: Organization = organization;
  const fetchMock = vi.fn<(url: string) => Promise<Response>>();
  beforeEach(() => {
    client = createQueryClient(); identity = baseIdentity; mode = 'ok'; total = 1; row = organization;
    fetchMock.mockReset(); fetchMock.mockImplementation(url => {
      if (url.endsWith('/auth/me')) return Promise.resolve(Response.json(identity));
      if (url.includes('/categories?')) return Promise.resolve(Response.json({ items: [category], total: 1, page: 1, pageSize: 25 }));
      if (url.includes('/organizations?')) {
        if (mode === 'pending') return new Promise(() => undefined);
        if (mode === 'error') return Promise.resolve(new Response(null, { status: 500 }));
        return Promise.resolve(Response.json({ items: mode === 'empty' ? [] : [row], total: mode === 'empty' ? 0 : total, page: 1, pageSize: 25 }));
      }
      return Promise.reject(new Error('Ruta inesperada: ' + url));
    }); vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => { client.clear(); vi.unstubAllGlobals(); });
  function view(path = '/organizations') {
    client.setQueryData(AUTH_QUERY_KEY, identity); client.setQueryDefaults(AUTH_QUERY_KEY, { staleTime: Infinity });
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Location /><AppRoutes /></MemoryRouter></QueryClientProvider>);
  }
  const results = () => within(screen.getByRole('region', { name: 'Resultados de organizaciones' }));

  it('presenta contexto, título único y creación con la ruta original', async () => {
    view(); expect(await screen.findByRole('heading', { level: 1, name: 'Organizaciones' })).toBeVisible();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Crear organización' })).toHaveAttribute('href', '/organizations/new');
    expect(screen.getByText('Consulta y administra las organizaciones registradas.')).toBeVisible();
  });
  it('conserva los accesos globales sin duplicarlos en el contenido', async () => {
    view(); await screen.findByRole('link', { name: row.name });
    const main = within(screen.getByRole('main'));
    for (const [label, href] of [['Búsqueda', '/directory/search'], ['Categorías', '/organizations/categories'], ['Personas externas', '/people']]) {
      expect(screen.getAllByRole('link', { name: label }).every(link => link.getAttribute('href') === href)).toBe(true);
      expect(main.queryByRole('link', { name: label })).not.toBeInTheDocument();
    }
  });
  it('muestra lectura sin creación cuando no tiene directory.write', async () => {
    identity = { ...baseIdentity, role: 'PLANNING', permissions: ['directory.read'] }; view();
    expect(await screen.findByRole('link', { name: row.name })).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Crear organización' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Comunicaciones externas')).not.toBeInTheDocument();
  });
  it('presenta enlace, estado, país, categorías y matriz en una lista semántica', async () => {
    view(); const link = await screen.findByRole('link', { name: row.name });
    expect(link).toHaveAttribute('href', '/organizations/org-ui23');
    const item = within(results().getByRole('listitem'));
    for (const text of ['Activa', 'Bolivia', 'Educación', 'Matriz institucional']) expect(item.getByText(text)).toBeVisible();
  });
  it('mantiene los fallbacks y el estado inactivo sin depender del color', async () => {
    row = { ...organization, country: null, parent: null, categories: [], isActive: false }; view('/organizations?status=inactive');
    await screen.findByRole('link', { name: row.name });
    for (const text of ['Inactiva', 'País sin registrar', 'Sin categorías']) expect(results().getByText(text)).toBeVisible();
  });
  it('busca al escribir y limpia solo los filtros originales manteniendo nombre y otros parámetros', async () => {
    view('/organizations?country=Perú&status=inactive&verificationStatus=NEVER_VERIFIED&withCommunications=true&categoryId=' + category.id + '&page=3&context=retain');
    await screen.findByRole('link', { name: row.name });
    fireEvent.change(screen.getByLabelText('Filtrar organizaciones por nombre'), { target: { value: 'Horizonte' } });
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.includes('name=Horizonte') && url.includes('page=1'))).toBe(true));
    await userEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect(screen.getByLabelText('URL actual')).toHaveTextContent('?page=1&context=retain&name=Horizonte');
    expect(screen.getByLabelText('País')).toHaveValue(''); expect(screen.getByLabelText('Estado')).toHaveValue('active');
    expect(screen.getByLabelText('Filtrar organizaciones por nombre')).toHaveValue('Horizonte');
  });
  it('asocia la explicación de comunicaciones a su selector', async () => {
    view(); await screen.findByRole('link', { name: row.name });
    expect(screen.getByLabelText('Comunicaciones externas')).toHaveAccessibleDescription('Incluye comunicaciones enviadas y recibidas, también invalidadas. Las notas internas y los medios de contacto no cuentan.');
  });
  it('distingue el directorio vacío cuando se consultan todas sin filtros', async () => {
    mode = 'empty'; view('/organizations?status=all'); expect(await screen.findByText('No hay organizaciones registradas.')).toBeVisible();
    expect(results().getByText('0 organizaciones')).toBeVisible();
  });
  it('mantiene el vacío filtrado y no fabrica filas', async () => {
    mode = 'empty'; view('/organizations?name=Inexistente'); expect(await screen.findByText('No hay organizaciones para estos filtros.')).toBeVisible();
    expect(results().queryByRole('list')).not.toBeInTheDocument();
  });
  it('conserva error y reintento con los filtros aplicados', async () => {
    mode = 'error'; view('/organizations?country=Bolivia'); await waitFor(() => expect(results().getByRole('alert')).toHaveTextContent('No se pudo cargar la información.'));
    mode = 'ok'; await userEvent.click(results().getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('link', { name: row.name })).toBeVisible(); expect(screen.getByLabelText('País')).toHaveValue('Bolivia');
  });
  it('usa el total real y pagina conservando filtros y límites', async () => {
    total = 26; view('/organizations?country=Bolivia'); await screen.findByRole('link', { name: row.name });
    expect(results().getByText('26 organizaciones')).toBeVisible(); expect(results().getByRole('button', { name: 'Anterior' })).toBeDisabled();
    await userEvent.click(results().getByRole('button', { name: 'Siguiente' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.includes('country=Bolivia') && url.includes('page=2'))).toBe(true));
    expect(results().getByRole('button', { name: 'Siguiente' })).toBeDisabled();
  });
});
