import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../../app/router/app-routes';
import { createQueryClient } from '../../lib/query/query-client';
import { AUTH_QUERY_KEY, type AuthIdentity } from '../auth/session';

const stamp = '2026-10-07T00:00:00Z';
const category = { id: 'category-ui24', name: 'Cooperación', isActive: true, version: 1, createdAt: stamp, updatedAt: stamp };
const actor: AuthIdentity = { id: 'ui24', username: 'ui24', email: 'qa@example.test', givenNames: 'QA', familyNames: 'Categorías', role: 'ADMINISTRATOR',
  permissions: ['directory.read', 'directory.write', 'directory.status.update', 'directory.history.read'] };
describe('UI 2.4 categorías institucionales', () => {
  let client = createQueryClient(), identity = actor, row = category, mode = 'ok', total = 1, conflict = false;
  const fetchMock = vi.fn<(url: string, options?: RequestInit) => Promise<Response>>();
  beforeEach(() => {
    client = createQueryClient(); identity = actor; row = category; mode = 'ok'; total = 1; conflict = false;
    fetchMock.mockReset(); fetchMock.mockImplementation((url, options) => {
      if (url.endsWith('/auth/me')) return Promise.resolve(Response.json(identity));
      if (url.includes('/history')) return Promise.resolve(Response.json({ items: [], total: 0, page: 1, pageSize: 25 }));
      if (url.includes('/categories?')) {
        if (mode === 'pending') return new Promise(() => undefined);
        if (mode === 'error') return Promise.resolve(new Response(null, { status: 500 }));
        return Promise.resolve(Response.json({ items: mode === 'empty' ? [] : [row], total: mode === 'empty' ? 0 : total, page: 1, pageSize: 25 }));
      }
      if (options?.method === 'POST') return Promise.resolve(Response.json({ ...row, ...JSON.parse(String(options.body)) as object }));
      if (options?.method === 'PUT') {
        if (conflict) return Promise.resolve(Response.json({ code: 'VERSION_CONFLICT' }, { status: 409 }));
        row = { ...row, ...JSON.parse(String(options.body)) as object, version: row.version + 1 }; return Promise.resolve(Response.json(row));
      }
      if (options?.method === 'PATCH') { row = { ...row, isActive: !row.isActive, version: row.version + 1 }; return Promise.resolve(Response.json(row)); }
      return Promise.reject(new Error('Ruta inesperada: ' + url));
    }); vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => { client.clear(); vi.unstubAllGlobals(); });
  function view() {
    client.setQueryData(AUTH_QUERY_KEY, identity); client.setQueryDefaults(AUTH_QUERY_KEY, { staleTime: Infinity });
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/organizations/categories']}><AppRoutes /></MemoryRouter></QueryClientProvider>);
  }
  const writes = (method: string) => fetchMock.mock.calls.filter(([, options]) => options?.method === method);
  it('presenta encabezado y estado textual con acciones permitidas', async () => {
    view(); expect(await screen.findByRole('heading', { name: category.name })).toBeVisible();
    expect(screen.getByRole('heading', { level: 1, name: 'Categorías institucionales' })).toBeVisible();
    expect(screen.getByText('Activa')).toBeVisible(); expect(screen.getByRole('button', { name: 'Editar Cooperación' })).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Volver al directorio' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Organizaciones' }).every(link => link.getAttribute('href') === '/organizations')).toBe(true);
  });
  it('valida el nombre antes de crear y asocia el error al input', async () => {
    view(); await userEvent.click(screen.getByRole('button', { name: 'Crear categoría' }));
    expect(await screen.findByText('El nombre es obligatorio.')).toBeVisible();
    expect(screen.getByLabelText('Nombre de categoría')).toHaveAttribute('aria-invalid', 'true'); expect(writes('POST')).toHaveLength(0);
  });
  it('crea con validación original y limpia el formulario', async () => {
    view(); await userEvent.type(screen.getByLabelText('Nombre de categoría'), ' Educación ');
    await userEvent.click(screen.getByRole('button', { name: 'Crear categoría' }));
    await waitFor(() => expect(writes('POST')).toHaveLength(1)); expect(JSON.parse(String(writes('POST')[0]?.[1]?.body))).toEqual({ name: 'Educación' });
    await waitFor(() => expect(screen.getByLabelText('Nombre de categoría')).toHaveValue(''));
  });
  it('edita con versión y mantiene el destino de la mutación', async () => {
    view(); await userEvent.click(await screen.findByRole('button', { name: 'Editar Cooperación' }));
    await userEvent.clear(screen.getByLabelText('Nuevo nombre de categoría')); await userEvent.type(screen.getByLabelText('Nuevo nombre de categoría'), 'Cooperación revisada');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar categoría' }));
    expect(await screen.findByRole('heading', { name: 'Cooperación revisada' })).toBeVisible();
    expect(writes('PUT')[0]?.[0]).toContain('/categories/category-ui24'); expect(JSON.parse(String(writes('PUT')[0]?.[1]?.body))).toEqual({ name: 'Cooperación revisada', expectedVersion: 1 });
  });
  it('conflicto preserva borrador, advertencia y recarga explícita', async () => {
    conflict = true; view(); await userEvent.click(await screen.findByRole('button', { name: 'Editar Cooperación' }));
    await userEvent.clear(screen.getByLabelText('Nuevo nombre de categoría')); await userEvent.type(screen.getByLabelText('Nuevo nombre de categoría'), 'Mi borrador');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar categoría' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Recargar descartará'); expect(screen.getByLabelText('Nuevo nombre de categoría')).toHaveValue('Mi borrador');
    expect(writes('PUT')).toHaveLength(1); await userEvent.click(screen.getByRole('button', { name: 'Recargar ficha y descartar cambios' }));
    await waitFor(() => expect(screen.queryByLabelText('Nuevo nombre de categoría')).not.toBeInTheDocument());
  });
  it('desactiva y reactiva directamente conservando versión y sin inventar confirmación', async () => {
    view(); await userEvent.click(await screen.findByRole('button', { name: 'Desactivar Cooperación' }));
    expect(await screen.findByText('Inactiva')).toBeVisible(); expect(JSON.parse(String(writes('PATCH')[0]?.[1]?.body))).toEqual({ isActive: false, expectedVersion: 1 });
    await userEvent.click(screen.getByRole('button', { name: 'Reactivar Cooperación' }));
    expect(await screen.findByText('Activa')).toBeVisible(); expect(JSON.parse(String(writes('PATCH')[1]?.[1]?.body))).toEqual({ isActive: true, expectedVersion: 2 });
  });
  it('consulta y cierra historial existente sin escribir', async () => {
    view(); const history = await screen.findByRole('button', { name: 'Historial de Cooperación' }); await userEvent.click(history);
    expect(await screen.findByText('Aún no hay modificaciones.')).toBeVisible(); expect(history).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(history); expect(screen.queryByText('Aún no hay modificaciones.')).not.toBeInTheDocument(); expect(writes('PATCH')).toHaveLength(0);
  });
  it('filtra con estado local, pagina y vuelve a la primera al cambiar estado', async () => {
    total = 26; view(); await screen.findByRole('heading', { name: category.name });
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' })); await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.includes('categories?page=2&status=active'))).toBe(true));
    await userEvent.selectOptions(screen.getByLabelText('Estado de categorías'), 'inactive');
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.includes('categories?page=1&status=inactive'))).toBe(true));
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
  });
  it.each(['ADMINISTRATOR', 'RESEARCH', 'BOARD', 'PLANNING'] as const)('lectura sin capabilities de escritura oculta acciones para %s', async role => {
    identity = { ...actor, role, permissions: ['directory.read'] }; view(); await screen.findByRole('heading', { name: category.name });
    const main = within(screen.getByRole('main')); expect(main.queryByRole('button', { name: /Crear|Editar|Desactivar|Historial/u })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Nombre de categoría')).not.toBeInTheDocument();
  });
  it.each(['empty', 'error', 'pending'])('conserva el estado %s del catálogo', async state => {
    mode = state; view();
    if (state === 'pending') expect(await screen.findByText('Cargando…')).toBeVisible();
    if (state === 'empty') expect(await screen.findByText('No hay categorías para estos filtros. El catálogo comienza vacío.')).toBeVisible();
    if (state === 'error') { await screen.findByRole('alert'); mode = 'ok'; await userEvent.click(screen.getByRole('button', { name: 'Reintentar' })); expect(await screen.findByRole('heading', { name: category.name })).toBeVisible(); }
  });
});
