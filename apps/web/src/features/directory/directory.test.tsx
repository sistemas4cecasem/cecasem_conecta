import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../../app/router/app-routes';
import { createQueryClient } from '../../lib/query/query-client';
import { clearForbiddenDirectory } from './queries';
import { organizationFormSchema, type Organization } from './contracts';
import { AUTH_QUERY_KEY, type AuthIdentity } from '../auth/session';

const capabilities = ['directory.read', 'directory.write', 'directory.history.read'];
const identity: AuthIdentity = { id: 'qa', givenNames: 'QA', familyNames: 'Directorio', username: 'qa.directorio', email: 'qa@example.test', role: 'RESEARCH', permissions: capabilities };
const stamp = '2026-10-02T00:00:00.000Z';
const catA = { id: 'cat-a', name: 'Educación QA', isActive: true, version: 1, createdAt: stamp, updatedAt: stamp };
const catB = { ...catA, id: 'cat-b', name: 'Ambiente QA' };
const base: Organization = { id: 'org', name: 'Institución QA', country: null, alias: null, description: null, officialWebsite: null,
  isActive: true, version: 1, parentId: null, parent: null, categories: [], createdAt: stamp, updatedAt: stamp, lastVerifiedAt: null };
const parent = { ...base, id: 'parent', name: 'Matriz QA' };
const page = (items: unknown[], total = items.length, number = 1) => ({ items, total, page: number, pageSize: 25 });

describe('Directorio operativo', () => {
  let client = createQueryClient(); let current = identity; let row = { ...base };
  let listState = 'ok'; let conflicting = false; let total = 1; let withCategories = true; let loggedOut = false; let showHistory = false;
  const fetchMock = vi.fn<(url: string, options?: RequestInit) => Promise<Response>>();
  beforeEach(() => {
    client = createQueryClient(); current = { ...identity }; row = { ...base }; listState = 'ok'; conflicting = false; total = 1; withCategories = true; loggedOut = false; showHistory = false;
    fetchMock.mockReset();
    fetchMock.mockImplementation((url, options) => {
      const path = url.replace('/api/v1/', ''); const method = options?.method ?? 'GET';
      if (path === 'auth/me') return Promise.resolve(Response.json(loggedOut ? {} : current, { status: loggedOut ? 401 : 200 }));
      if (path === 'auth/logout') { loggedOut = true; return Promise.resolve(new Response(null, { status: 204 })); }
      if (path.startsWith('categories?')) return Promise.resolve(Response.json(page(withCategories ? [catA, catB] : [])));
      if (path === 'categories' && method === 'POST') return Promise.resolve(Response.json({ ...catA, ...(JSON.parse(String(options?.body)) as object) }, { status: 201 }));
      if (path.includes('/history')) return Promise.resolve(Response.json({
        ...page(showHistory ? [{operationId:'operation-qa',createdAt:stamp,objectType:'ORGANIZATION',actor:{id:identity.id,givenNames:identity.givenNames,familyNames:identity.familyNames,isActive:true},contextRecorded:true,relatedReferences:[],replacement:null,changes:[{field:'categoryIds',label:'Categorías',previousValue:[],newValue:[catA.id,catB.id],previousReferences:[],newReferences:[{id:catA.id,kind:'category',label:catA.name},{id:catB.id,kind:'category',label:catB.name}],added:[{id:catA.id,kind:'category',label:catA.name},{id:catB.id,kind:'category',label:catB.name}],removed:[]}]}] : []),
        references: { [catA.id]: catA.name, [catB.id]: catB.name },
      }));
      if (path.includes('/children')) return Promise.resolve(Response.json(page([])));
      if (path.includes('/people?')) return Promise.resolve(Response.json(page([])));
      if (path.includes('/contacts?')) return Promise.resolve(Response.json(page([])));
      if (path === 'organizations' && method === 'POST') {
        const input = JSON.parse(String(options?.body)) as { name: string };
        row = { ...base, ...input }; return Promise.resolve(Response.json(row, { status: 201 }));
      }
      if (path === 'organizations/org' && method === 'PUT') {
        if (conflicting) return Promise.resolve(Response.json({ code: 'VERSION_CONFLICT' }, { status: 409 }));
        const input = JSON.parse(String(options?.body)) as { name: string; description: string };
        row = { ...row, ...input, version: row.version + 1 }; return Promise.resolve(Response.json(row));
      }
      if (path === 'organizations/org') return Promise.resolve(Response.json(row));
      if (path.startsWith('organizations?')) {
        if (listState === 'pending') return new Promise<Response>(() => undefined);
        if (listState === 'error') return Promise.resolve(new Response(null, { status: 500 }));
        return Promise.resolve(Response.json(page(listState === 'empty' ? [] : path.includes('status=all') ? [parent] : [row], listState === 'empty' ? 0 : total)));
      }
      return Promise.reject(new Error('Ruta inesperada: ' + path));
    });
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => { client.clear(); vi.unstubAllGlobals(); });
  function app(path = '/organizations') {
    return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter></QueryClientProvider>);
  }
  it('capability permite navegación y edición; estado reservado no aparece', async () => {
    app('/organizations/org'); await screen.findByRole('heading', { name: 'Institución QA' });
    expect(screen.getByRole('link', { name: 'Directorio' })).toHaveAttribute('href', '/organizations');
    expect(screen.getByRole('button', { name: 'Editar ficha' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Desactivar organización' })).not.toBeInTheDocument();
    expect(screen.getByText('Sin verificar')).toBeVisible();
  });
  it('Admin recibe cambio de estado por capability', async () => {
    current = { ...identity, role: 'ADMINISTRATOR', permissions: [...capabilities, 'directory.status.update'] };
    app('/organizations/org'); expect(await screen.findByRole('button', { name: 'Desactivar organización' })).toBeVisible();
  });
  it('sin capability no consulta ni muestra navegación', async () => {
    current = { ...identity, permissions: [] }; app();
    expect(await screen.findByRole('alert')).toHaveTextContent('No tienes permiso');
    expect(screen.queryByRole('link', { name: 'Directorio' })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => url.includes('/organizations'))).toBe(false);
  });
  it.each(['pending', 'error', 'empty'])('listado maneja %s', async state => {
    listState = state; app();
    if (state === 'pending') expect(await screen.findByText('Cargando…')).toBeVisible();
    if (state === 'error') expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar');
    if (state === 'empty') expect(await screen.findByText('No hay organizaciones para estos filtros.')).toBeVisible();
  });
  it('crea ficha con solo nombre; invalida caché y conserva verificación vacía', async () => {
    const user = userEvent.setup(); withCategories = false; const invalidate = vi.spyOn(client, 'invalidateQueries');
    app('/organizations/new'); await user.type(await screen.findByLabelText('Nombre'), 'Nueva institución');
    await user.click(screen.getByRole('button', { name: 'Guardar organización' }));
    await screen.findByRole('heading', { name: 'Nueva institución' });
    const call = fetchMock.mock.calls.find(([url, options]) => url.endsWith('/organizations') && options?.method === 'POST');
    expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({ name: 'Nueva institución', parentId: null, categoryIds: [] });
    expect(JSON.parse(String(call?.[1]?.body))).not.toHaveProperty('lastVerifiedAt');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['directory', 'qa'] });
  });
  it('edita descripción, matriz y dos categorías con versión obtenida', async () => {
    const user = userEvent.setup(); app('/organizations/org');
    await user.click(await screen.findByRole('button', { name: 'Editar ficha' }));
    await user.type(screen.getByLabelText('Descripción (opcional)'), 'Descripción revisada');
    await user.click(await screen.findByRole('radio', { name: 'Matriz QA' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Educación QA' }));
    await user.click(screen.getByRole('checkbox', { name: 'Ambiente QA' }));
    await user.click(screen.getByRole('button', { name: 'Guardar organización' }));
    await screen.findByRole('button', { name: 'Editar ficha' });
    const call = fetchMock.mock.calls.find(([, options]) => options?.method === 'PUT');
    expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({ expectedVersion: 1, parentId: 'parent', categoryIds: ['cat-a', 'cat-b'], description: 'Descripción revisada' });
  });
  it('409 conserva borrador, no reintenta y recarga solo con advertencia visible', async () => {
    const user = userEvent.setup(); conflicting = true; app('/organizations/org');
    await user.click(await screen.findByRole('button', { name: 'Editar ficha' }));
    await user.type(screen.getByLabelText('Descripción (opcional)'), 'Mi borrador');
    row = { ...row, version: 2, description: 'Cambio ajeno' };
    await user.click(screen.getByRole('button', { name: 'Guardar organización' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Recargar descartará');
    expect(screen.getByLabelText('Descripción (opcional)')).toHaveValue('Mi borrador');
    expect(fetchMock.mock.calls.filter(([, options]) => options?.method === 'PUT')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Recargar ficha y descartar cambios' }));
    await waitFor(() => expect(screen.getByLabelText('Descripción (opcional)')).toHaveValue('Cambio ajeno'));
    conflicting = false; await user.click(screen.getByRole('button', { name: 'Guardar organización' }));
    await screen.findByRole('button', { name: 'Editar ficha' });
    const calls = fetchMock.mock.calls.filter(([, options]) => options?.method === 'PUT');
    expect(JSON.parse(String(calls[1]?.[1]?.body))).toMatchObject({ expectedVersion: 2, description: 'Cambio ajeno' });
  });
  it('paginación solicita página backend y conserva límites', async () => {
    total = 26; const user = userEvent.setup(); app();
    await screen.findByRole('link', { name: 'Institución QA' });
    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.includes('page=2'))).toBe(true));
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
  });
  it('historial vacío y navegación matriz/sedes son visibles', async () => {
    row = { ...row, parentId: 'parent', parent: { id: 'parent', name: 'Matriz QA', isActive: true } };
    app('/organizations/org'); expect(await screen.findByText('Aún no hay modificaciones.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Matriz QA' })).toHaveAttribute('href', '/organizations/parent');
    expect(screen.getByText('No tiene sedes registradas.')).toBeVisible();
  });
  it('catálogo mínimo crea categoría sin seeds', async () => {
    withCategories = false; const user = userEvent.setup(); app('/organizations/categories');
    await user.type(await screen.findByLabelText('Nombre de categoría'), 'Categoría QA');
    await user.click(screen.getByRole('button', { name: 'Crear categoría' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, options]) => url.endsWith('/categories') && options?.method === 'POST')).toBe(true));
    await waitFor(() => expect(screen.getByLabelText('Nombre de categoría')).toHaveValue(''));
  });
  it('historial muestra nombres de asociaciones y valores anteriores sin códigos técnicos', async () => {
    showHistory = true; app('/organizations/org');
    expect(await screen.findByText('Después: Educación QA, Ambiente QA')).toBeVisible();
    expect(screen.getByText('Antes: Sin categorías')).toBeVisible();
    expect(screen.queryByText('operation-qa')).not.toBeInTheDocument();
  });
  it('logout limpia fichas y cambio de identidad/capabilities cancela y elimina caché', async () => {
    const user = userEvent.setup(); app('/organizations/org'); await screen.findByRole('heading', { name: 'Institución QA' });
    expect(client.getQueryData(['directory', 'qa', 'organization', 'org'])).toBeDefined();
    await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    await screen.findByRole('heading', { name: 'Iniciar sesión' });
    expect(client.getQueriesData({ queryKey: ['directory'] })).toHaveLength(0);
    client.setQueryData(['directory', 'old', 'organizations', 'list'], page([row]));
    client.setQueryData(['directory', 'qa', 'history', 'history'], page([]));
    await act(async () => { await clearForbiddenDirectory(client, { ...identity, permissions: ['directory.read'] }); });
    expect(client.getQueriesData({ queryKey: ['directory'] })).toHaveLength(0);
    expect(client.getQueryData(AUTH_QUERY_KEY)).toBeNull();
  });
  it('Zod valida nombre, sitio y opcionales sin completar datos desconocidos', () => {
    const blank = { name: '', country: '', alias: '', description: '', officialWebsite: '', parentId: '', categoryIds: [] };
    expect(organizationFormSchema.safeParse(blank).success).toBe(false);
    expect(organizationFormSchema.safeParse({ ...blank, name: ' Parcial  ' }).success).toBe(true);
    expect(organizationFormSchema.safeParse({ ...blank, name: 'Ficha', officialWebsite: 'javascript:alert(1)' }).success).toBe(false);
  });
});
