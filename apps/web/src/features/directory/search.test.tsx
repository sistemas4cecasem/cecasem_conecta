import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '../../lib/query/query-client';
import { AUTH_QUERY_KEY, type AuthIdentity } from '../auth/session';
import { AppRoutes } from '../../app/router/app-routes';
import DirectorySearchPage from './search-page';
import { clearForbiddenDirectory, useDirectoryMutation } from './queries';
import type { DirectorySearchResponse } from './search.contracts';

const orgId = '11111111-1111-4111-8111-111111111111', personId = '22222222-2222-4222-8222-222222222222', emailId = '33333333-3333-4333-8333-333333333333';
const identity: AuthIdentity = { id: 'qa-search', email: 'qa@example.test', givenNames: 'QA', familyNames: 'Búsqueda', username: 'qa-search', role: 'RESEARCH', permissions: ['directory.read', 'directory.write'] };
const org = { type: 'ORGANIZATION' as const, id: orgId, name: 'Fundación Esperanza', alias: 'FE', country: 'Bolivia', isActive: true, parent: null, duplicateOf: null };
const person = { type: 'PERSON' as const, id: personId, displayName: 'María Fernanda Pérez', isActive: true, duplicateOf: null, currentRelations: [], currentRelationsTotal: 0 };
function response(q = 'esperanza'): DirectorySearchResponse { return { query: q, organizations: { items: [], total: 0, page: 1, pageSize: 25 }, people: { items: [], total: 0, page: 1, pageSize: 25 }, email: null }; }
describe('Búsqueda inicial del Directorio', () => {
  let client = createQueryClient(), data = response(), mode = 'ok', currentIdentity: AuthIdentity | null = identity;
  const fetchMock = vi.fn<(url: string, options?: RequestInit) => Promise<Response>>();
  beforeEach(() => {
    client = createQueryClient(); client.setQueryDefaults(AUTH_QUERY_KEY, { staleTime: Infinity }); client.setQueryData(AUTH_QUERY_KEY, identity);
    data = response(); mode = 'ok'; currentIdentity = identity;
    fetchMock.mockReset(); fetchMock.mockImplementation((url, options) => {
      if (url.endsWith('auth/me')) return Promise.resolve(Response.json(currentIdentity ?? {}, { status: currentIdentity ? 200 : 401 }));
      if (url.endsWith('auth/logout')) { currentIdentity = null; return Promise.resolve(new Response(null, { status: 204 })); }
      if (options?.method && options.method !== 'GET') { data = { ...data, organizations: { ...data.organizations, items: [{ ...org, name: 'Ficha actualizada' }], total: 1 } }; return Promise.resolve(Response.json({})); }
      if (url.includes('/search?')) {
        if (mode === 'pending') return new Promise<Response>(() => undefined);
        if (mode === 'error') return Promise.resolve(new Response(null, { status: 500 }));
        return Promise.resolve(Response.json(data));
      }
      return Promise.resolve(new Response(null, { status: 404 }));
    }); vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => { client.clear(); vi.useRealTimers(); vi.unstubAllGlobals(); });
  function view(route = '/directory/search', full = false, extra?: React.ReactNode) {
    return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[route]}>
      {extra}{full ? <AppRoutes /> : <Routes><Route path="directory/search" element={<DirectorySearchPage />} />
        <Route path="organizations/:id" element={<h1>Ficha abierta de organización</h1>} /><Route path="people/:id" element={<h1>Ficha abierta de persona</h1>} />
        <Route path="contact-methods/:id" element={<h1>Ficha abierta del correo</h1>} /></Routes>}
    </MemoryRouter></QueryClientProvider>);
  }
  const searchCalls = () => fetchMock.mock.calls.filter(([url]) => url.includes('/search?'));
  it('no consulta con input vacío', () => { view(); expect(screen.getByText(/Escribe al menos dos caracteres/)).toBeInTheDocument(); expect(searchCalls()).toHaveLength(0); });
  it.each(['a', 'a@', '---'])('no consulta query inválida %s', async q => { view('/directory/search?q=' + encodeURIComponent(q)); await new Promise(resolve => setTimeout(resolve, 400)); expect(searchCalls()).toHaveLength(0); });
  it('espera 350 ms y no realiza una petición por cada tecla', async () => {
    vi.useFakeTimers(); view(); fireEvent.change(screen.getByLabelText('Nombre o correo'), { target: { value: 'mar' } });
    await act(() => vi.advanceTimersByTimeAsync(200)); expect(searchCalls()).toHaveLength(0);
    fireEvent.change(screen.getByLabelText('Nombre o correo'), { target: { value: 'maria' } });
    await act(() => vi.advanceTimersByTimeAsync(349)); expect(searchCalls()).toHaveLength(0);
    await act(() => vi.advanceTimersByTimeAsync(1)); expect(searchCalls()).toHaveLength(1); expect(searchCalls()[0]?.[0]).toContain('q=maria');
  });
  it('muestra loading mientras espera el backend', async () => { mode = 'pending'; view('/directory/search?q=maria'); expect(await screen.findByText('Cargando…')).toBeInTheDocument(); });
  it('presenta error y permite reintentar', async () => {
    mode = 'error'; view('/directory/search?q=maria'); await screen.findByRole('alert'); mode = 'ok';
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' })); expect(await screen.findByText('No se encontraron resultados.')).toBeInTheDocument(); expect(searchCalls()).toHaveLength(2);
  });
  it('presenta sin resultados', async () => { view('/directory/search?q=maria'); expect(await screen.findByText('No se encontraron resultados.')).toBeInTheDocument(); });
  it('muestra organizaciones con país/sigla/matriz y abre la ficha', async () => {
    data.organizations = { ...data.organizations, items: [{ ...org, parent: { id: emailId, name: 'Matriz Esperanza', isActive: true } }], total: 1 };
    view('/directory/search?q=esperanza'); const link = await screen.findByRole('link', { name: org.name }); expect(screen.getByText('Bolivia · FE')).toBeInTheDocument(); expect(screen.getByRole('link', { name: 'Matriz Esperanza' })).toHaveAttribute('href', '/organizations/' + emailId);
    await userEvent.click(link); expect(screen.getByRole('heading', { name: 'Ficha abierta de organización' })).toBeInTheDocument();
  });
  it('muestra personas y vínculos vigentes y abre la ficha', async () => {
    data.people = { ...data.people, items: [{ ...person, currentRelations: [{ id: emailId, positionTitle: 'Coordinación', organization: { id: orgId, name: org.name, isActive: true } }], currentRelationsTotal: 4 }], total: 1 };
    view('/directory/search?q=maria'); const link = await screen.findByRole('link', { name: person.displayName }); expect(screen.getByText(/Otros vínculos vigentes/)).toBeInTheDocument(); await userEvent.click(link);
    expect(screen.getByRole('heading', { name: 'Ficha abierta de persona' })).toBeInTheDocument();
  });
  it('muestra EMAIL canónico, condición y asociaciones actuales/históricas y abre su ficha existente', async () => {
    data.email = { type: 'EMAIL', id: emailId, value: 'maria@example.test', condition: 'UNUSABLE', people: { items: [{ id: personId, isActive: false, person }], total: 12, limit: 10 }, organizations: { items: [{ id: orgId, isActive: true, organization: org }], total: 1, limit: 10 } };
    view('/directory/search?q=MARIA%40EXAMPLE.TEST'); const link = await screen.findByRole('link', { name: 'maria@example.test' });
    expect(screen.getByText('Condición del medio: No utilizable')).toBeInTheDocument(); expect(screen.getByText('Asociación histórica/inactiva')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: person.displayName })).toHaveAttribute('href', '/people/' + personId); expect(screen.getByText(/Se muestran hasta 10 asociaciones/)).toBeInTheDocument();
    expect(screen.getByText(/no acreditan comunicaciones/)).toBeInTheDocument(); await userEvent.click(link); expect(screen.getByRole('heading', { name: 'Ficha abierta del correo' })).toBeInTheDocument();
  });
  it('opción explícita de antecedentes reinicia la página y envía includeInactive', async () => {
    view('/directory/search?q=maria&page=2'); await screen.findByText('No se encontraron resultados.');
    await userEvent.click(screen.getByLabelText('Incluir fichas inactivas y antecedentes consolidados'));
    await waitFor(() => expect(searchCalls().at(-1)?.[0]).toContain('includeInactive=true')); expect(searchCalls().at(-1)?.[0]).toContain('page=1');
  });
  it('identifica consolidada y enlaza claramente el principal', async () => {
    data.people = { ...data.people, items: [{ ...person, displayName: 'Maria F. Perez', isActive: false, duplicateOf: { id: orgId, displayName: person.displayName, isActive: true } }], total: 1 };
    view('/directory/search?q=Maria+F.+Perez'); expect(await screen.findByText(/Ficha histórica consolidada/)).toBeInTheDocument(); expect(screen.getByRole('link', { name: person.displayName })).toHaveAttribute('href', '/people/' + orgId);
  });
  it('mantiene consulta de URL al recargar y página común con totales de cada tipo', async () => {
    data.organizations = { ...data.organizations, items: [org], total: 26 }; data.people = { ...data.people, items: [person], total: 2 };
    view('/directory/search?q=esperanza'); expect(screen.getByLabelText('Nombre o correo')).toHaveValue('esperanza'); await screen.findByRole('link', { name: org.name });
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' })); await waitFor(() => expect(searchCalls().at(-1)?.[0]).toContain('page=2'));
    expect(screen.getByRole('heading', { name: 'Organizaciones · 26' })).toBeInTheDocument(); expect(screen.getByRole('heading', { name: 'Personas · 2' })).toBeInTheDocument();
  });
  it('cancela la consulta anterior y una respuesta tardía no reemplaza la nueva', async () => {
    let resolveA!: (value: Response) => void, resolveB!: (value: Response) => void;
    fetchMock.mockImplementation(url => url.includes('q=mar&') ? new Promise(resolve => { resolveA = resolve; }) : new Promise(resolve => { resolveB = resolve; }));
    view('/directory/search?q=mar'); await waitFor(() => expect(searchCalls()).toHaveLength(1));
    fireEvent.change(screen.getByLabelText('Nombre o correo'), { target: { value: 'maria' } }); await waitFor(() => expect(searchCalls()).toHaveLength(2));
    expect(searchCalls()[0]?.[1]?.signal?.aborted).toBe(true);
    const newer = response('maria'); newer.people = { ...newer.people, items: [person], total: 1 };
    await act(async () => resolveB(Response.json(newer))); await screen.findByRole('link', { name: person.displayName });
    const older = response('mar'); older.people = { ...older.people, items: [{ ...person, displayName: 'Respuesta antigua' }], total: 1 };
    await act(async () => resolveA(Response.json(older))); expect(screen.queryByText('Respuesta antigua')).not.toBeInTheDocument(); expect(screen.getByRole('link', { name: person.displayName })).toBeInTheDocument();
  });
  function MutationTrigger({ path }: { path: string }) { const mutation = useDirectoryMutation(identity); return <button onClick={() => mutation.mutate({ path, method: 'PUT', body: {} })}>Actualizar ficha</button>; }
  it.each(['organizations/' + orgId, 'people/' + personId, 'contact-methods/' + emailId, 'duplicate-candidates/' + emailId + '/consolidate'])('invalida búsqueda tras mutación %s', async path => {
    data.organizations = { ...data.organizations, items: [org], total: 1 }; view('/directory/search?q=esperanza', false, <MutationTrigger path={path} />);
    await screen.findByRole('link', { name: org.name }); await userEvent.click(screen.getByRole('button', { name: 'Actualizar ficha' }));
    expect(await screen.findByRole('link', { name: 'Ficha actualizada' })).toBeInTheDocument(); expect(searchCalls()).toHaveLength(2);
  });
  it('logout cancela y elimina resultados sensibles', async () => {
    data.organizations = { ...data.organizations, items: [org], total: 1 }; view('/directory/search?q=esperanza', true);
    await screen.findByRole('link', { name: org.name }); await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    await screen.findByRole('heading', { name: 'Iniciar sesión' }); expect(client.getQueriesData({ queryKey: ['directory'] })).toHaveLength(0);
  });
  it('pérdida de directory.read retira caché y oculta resultados', async () => {
    data.organizations = { ...data.organizations, items: [org], total: 1 }; view('/directory/search?q=esperanza', true); await screen.findByRole('link', { name: org.name });
    currentIdentity = { ...identity, permissions: [] };
    await act(async () => { await client.invalidateQueries({ queryKey: AUTH_QUERY_KEY }); });
    await screen.findByText('No tienes permiso para consultar el directorio.');
    expect(screen.queryByText(org.name)).not.toBeInTheDocument(); expect(client.getQueriesData({ queryKey: ['directory', identity.id, 'search'] })).toHaveLength(0);
  });
  it('cambio de identidad cancela y elimina la caché anterior', async () => {
    view('/directory/search?q=maria'); await screen.findByText('No se encontraron resultados.'); await clearForbiddenDirectory(client, { ...identity, id: 'otra-identidad' });
    expect(client.getQueriesData({ queryKey: ['directory', identity.id, 'search'] })).toHaveLength(0);
  });
});
