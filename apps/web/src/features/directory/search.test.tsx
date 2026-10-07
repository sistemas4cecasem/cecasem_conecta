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
const processId = '44444444-4444-4444-8444-444444444444';
const process = { type: 'PROCESS' as const, id: processId, purpose: 'Cooperación educativa', state: 'WAITING_RESPONSE' as const,
  target: { kind: 'ORGANIZATION' as const, id: orgId, label: org.name, isActive: true } };
const historical = { type: 'COMMUNICATION' as const, id: emailId, matchedAddress: 'Antiguo+Red@Example.test', direction: 'RECEIVED' as const, validity: 'VALID' as const,
  occurredAt: '2025-01-02T12:00:00.000Z', registeredBy: { id: personId, displayName: 'Usuario registrador original', isActive: false }, process };
function response(q = 'esperanza'): DirectorySearchResponse { return { query: q, organizations: { items: [], total: 0, page: 1, pageSize: 25 }, people: { items: [], total: 0, page: 1, pageSize: 25 }, email: null, processes: null, emailHistory: null }; }
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
      if (url.includes('/categories?')) return Promise.resolve(Response.json({ items: [], total: 0, page: 1, pageSize: 25 }));
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
        <Route path="contact-methods/:id" element={<h1>Ficha abierta del correo</h1>} />
        <Route path="relationship-processes/:id" element={<h1>Proceso abierto</h1>} /><Route path="communications/:id" element={<h1>Comunicación abierta</h1>} /></Routes>}
    </MemoryRouter></QueryClientProvider>);
  }
  const searchCalls = () => fetchMock.mock.calls.filter(([url]) => url.includes('/search?'));
  it('UI 2.4 mantiene encabezado único y estado inicial sin mostrar vacío de resultados',()=>{
    view();expect(screen.getByRole('heading',{level:1,name:'Búsqueda global'})).toBeVisible();
    expect(screen.getByRole('searchbox',{name:'Nombre o correo'})).toBeVisible();
    expect(screen.queryByText('No se encontraron resultados.')).not.toBeInTheDocument();
    expect(screen.queryByRole('link',{name:'Organizaciones'})).not.toBeInTheDocument();
  });
  it('UI 2.4 conserva filtro prefijado y limpieza limitada a organizaciones',async()=>{
    view('/directory/search?q=maria&organizationCountry=Bolivia&includeInactive=true');
    await screen.findByText('No se encontraron resultados.');
    expect(screen.getByText('País: Bolivia · Estado: Todas')).toBeVisible();
    await userEvent.click(screen.getByRole('button',{name:'Limpiar filtros de organizaciones'}));
    await waitFor(()=>expect(searchCalls().at(-1)?.[0]).not.toContain('organizationCountry'));
    expect(searchCalls().at(-1)?.[0]).toContain('q=maria');expect(searchCalls().at(-1)?.[0]).toContain('includeInactive=true');
    expect(screen.getByLabelText('Estado de organizaciones')).toHaveValue('all');
  });
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
  it('muestra procesos con contexto/estado y navega al detalle', async () => {
    data.processes = { items: [process], total: 1, page: 1, pageSize: 25 };
    view('/directory/search?q=cooperacion'); const link = await screen.findByRole('link', { name: process.purpose });
    expect(screen.getByText('Estado del proceso: Esperando respuesta')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: org.name })).toHaveAttribute('href', '/organizations/' + orgId);
    await userEvent.click(link); expect(screen.getByRole('heading', { name: 'Proceso abierto' })).toBeInTheDocument();
  });
  it('correo histórico sin ContactMethod muestra fecha real/registrador/proceso y permite navegar', async () => {
    data.emailHistory = { address: 'antiguo+red@example.test', items: [historical], total: 1, page: 1, pageSize: 25, lastValidContact: historical, importedRecords: { items: [], total: 0, page: 1, pageSize: 25 } };
    view('/directory/search?q=antiguo%2Bred%40example.test'); await screen.findByRole('heading', { name: 'Último contacto válido registrado' });
    expect(screen.getByText(/no tiene un medio de contacto actual/)).toBeInTheDocument();
    expect(screen.getAllByText(/Usuario registrador original \(cuenta inactiva\)/)).toHaveLength(2);
    const dates = document.querySelectorAll('time'); expect(dates[0]).toHaveAttribute('dateTime', historical.occurredAt);
    expect(screen.getAllByRole('link', { name: process.purpose })[0]).toHaveAttribute('href', '/relationship-processes/' + processId);
    await userEvent.click(screen.getAllByRole('link', { name: 'Abrir comunicación' })[0]!); expect(screen.getByRole('heading', { name: 'Comunicación abierta' })).toBeInTheDocument();
  });
  it('no presenta antecedentes invalidados como último contacto válido', async () => {
    data.emailHistory = { address: 'antiguo+red@example.test', items: [{ ...historical, validity: 'INVALIDATED' }], total: 1, page: 1, pageSize: 25, lastValidContact: null, importedRecords: { items: [], total: 0, page: 1, pageSize: 25 } };
    view('/directory/search?q=antiguo%2Bred%40example.test'); await screen.findByText(/Solo existen antecedentes invalidados/);
    expect(screen.getByText(/Invalidada · antecedente histórico/)).toBeInTheDocument(); expect(screen.queryByRole('heading', { name: 'Último contacto válido registrado' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: process.purpose })); expect(screen.getByRole('heading', { name: 'Proceso abierto' })).toBeInTheDocument();
  });
  it('correo actual sin historia declara ausencia de comunicaciones', async () => {
    data.email = { type: 'EMAIL', id: emailId, value: 'actual@example.test', condition: 'USABLE', people: { items: [], total: 0, limit: 10 }, organizations: { items: [], total: 0, limit: 10 } };
    data.emailHistory = { address: 'actual@example.test', items: [], total: 0, page: 1, pageSize: 25, lastValidContact: null, importedRecords: { items: [], total: 0, page: 1, pageSize: 25 } };
    view('/directory/search?q=actual%40example.test'); await screen.findByText('No hay comunicaciones registradas para esta dirección.');
    expect(screen.queryByRole('heading', { name: 'Último contacto válido registrado' })).not.toBeInTheDocument();
  });
  it('pagina antecedentes conservando el resumen de último contacto', async () => {
    data.emailHistory = { address: 'antiguo+red@example.test', items: [historical], total: 26, page: 1, pageSize: 25, lastValidContact: historical, importedRecords: { items: [], total: 0, page: 1, pageSize: 25 } };
    view('/directory/search?q=antiguo%2Bred%40example.test'); await screen.findByRole('heading', { name: 'Antecedentes de correo · 26' });
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' })); await waitFor(() => expect(searchCalls().at(-1)?.[0]).toContain('page=2'));
    expect(screen.getByRole('heading', { name: 'Último contacto válido registrado' })).toBeInTheDocument();
  });
  it('cambio de permisos conserva directory.read y retira antecedentes y caché anterior', async () => {
    currentIdentity = { ...identity, permissions: [...identity.permissions, 'relationships.process.read', 'communications.read'] };
    client.setQueryData(AUTH_QUERY_KEY, currentIdentity);
    data.emailHistory = { address: 'antiguo+red@example.test', items: [historical], total: 1, page: 1, pageSize: 25, lastValidContact: historical, importedRecords: { items: [], total: 0, page: 1, pageSize: 25 } };
    view('/directory/search?q=antiguo%2Bred%40example.test', true); await screen.findByRole('heading', { name: 'Último contacto válido registrado' });
    data.emailHistory = null; currentIdentity = identity;
    await act(async () => { await client.invalidateQueries({ queryKey: AUTH_QUERY_KEY }); }); await screen.findByText('No se encontraron resultados.');
    expect(screen.queryByText(/Usuario registrador original/)).not.toBeInTheDocument();
    expect(client.getQueriesData({ queryKey: ['directory', identity.id, 'search'] }).every(([key]) => !String(key[5]).includes('communications.read'))).toBe(true);
  });
});
