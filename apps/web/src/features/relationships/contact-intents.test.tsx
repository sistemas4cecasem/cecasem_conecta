import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../../app/router/app-routes';
import { createQueryClient } from '../../lib/query/query-client';
import { AUTH_QUERY_KEY, type AuthIdentity } from '../auth/session';
import type { DirectorySearchResponse } from '../directory/search.contracts';
import { clearForbiddenIntents, intentIdentityKey } from './queries';
import type { ContactIntent } from './contracts';
import type { ProcessDetail } from './process-contracts';
import { processIdentityKey } from './process-queries';
const id = '11111111-1111-4111-8111-111111111111', goal = '22222222-2222-4222-8222-222222222222', ownerId = '33333333-3333-4333-8333-333333333333';
const permissions = ['directory.read', 'relationships.intent.read', 'relationships.intent.create', 'relationships.intent.cancel', 'relationships.intent.convert', 'relationships.process.read'];
const initialIdentity: AuthIdentity = { id: ownerId, givenNames: 'Ana', familyNames: 'Prueba', username: 'ana', email: 'qa@example.test', role: 'RESEARCH', permissions };
function intent(): ContactIntent {
  return { id, purpose: 'Preparar cooperación', state: 'ACTIVE', version: 1, author: { id: ownerId, displayName: 'Ana Prueba', isActive: true },
    target: { kind: 'ORGANIZATION', id: goal, label: 'Fundación QA', isActive: true }, createdAt: '2026-10-03T12:00:00.000Z',
    updatedAt: '2026-10-03T12:00:00.000Z', lastActivityAt: '2026-10-03T12:00:00.000Z', cancelledAt: null, cancelledBy: null, canCancel: true, canConvert: true, processId: null };
}
const processId = '44444444-4444-4444-8444-444444444444';
function convertedProcess(row: ContactIntent): ProcessDetail {
  return { id: processId, purpose: row.purpose, state: 'PREPARATION', version: 1, sourceIntentId: row.id, createdBy: row.author, target: row.target,
    createdAt: row.createdAt, updatedAt: row.updatedAt, lastActivityAt: row.lastActivityAt, currentResult: null, closureObservation: null, closedAt: null, closedBy: null,
    allowedStates: ['IN_PROGRESS', 'WAITING_RESPONSE'], canClose: true, canReopen: false, exceptionalAdministration: false,
    participants: [{ user: row.author, joinedAt: row.createdAt, origin: 'PROCESS_CREATOR' }],
    events: [{ id: goal, type: 'CREATED', previousState: null, newState: 'PREPARATION', result: null, observation: null, actor: row.author, authority: 'PARTICIPANT', version: 1, createdAt: row.createdAt }], eventsTotal: 1 };
}
describe('Intenciones de contacto', () => {
  let client = createQueryClient(), identity: AuthIdentity | null = initialIdentity, row = intent(), mode = 'ok', status = 201, total = 1;
  const fetchMock = vi.fn<(url: string, options?: RequestInit) => Promise<Response>>();
  beforeEach(() => {
    client = createQueryClient(); identity = initialIdentity; row = intent(); mode = 'ok'; status = 201; total = 1;
    client.setQueryDefaults(AUTH_QUERY_KEY, { staleTime: Infinity }); client.setQueryData(AUTH_QUERY_KEY, identity);
    fetchMock.mockReset(); fetchMock.mockImplementation((url, options) => {
      if (url.endsWith('auth/me')) return Promise.resolve(Response.json(identity ?? {}, { status: identity ? 200 : 401 }));
      if (url.endsWith('auth/logout')) { identity = null; return Promise.resolve(new Response(null, { status: 204 })); }
      if (url.includes('/search?')) return Promise.resolve(Response.json({ query: 'QA', email: null,
        organizations: { items: [{ type: 'ORGANIZATION', id: goal, name: 'Fundación QA', alias: null, country: null, parent: null, duplicateOf: null, isActive: true }], total: 1, page: 1, pageSize: 25 },
        people: { items: [{ type: 'PERSON', id: ownerId, displayName: 'Persona QA', isActive: true, duplicateOf: null, currentRelations: [], currentRelationsTotal: 0 }], total: 1, page: 1, pageSize: 25 } }));
      if (options?.method === 'POST') {
        if (status !== 201) return Promise.resolve(Response.json({ code: status === 409 ? 'VERSION_CONFLICT' : 'FORBIDDEN' }, { status }));
        if (url.endsWith('/cancel')) row = { ...row, state: 'CANCELLED', version: 2, canCancel: false, cancelledAt: row.createdAt, cancelledBy: row.author };
        if (url.endsWith('/convert')) { row = { ...row, state: 'CONVERTED', version: 2, canCancel: false, canConvert: false, processId }; return Promise.resolve(Response.json({ intent: row, process: convertedProcess(row) }, { status: 201 })); }
        return Promise.resolve(Response.json(row, { status: 201 }));
      }
      if (mode === 'pending') return new Promise<Response>(() => undefined);
      if (mode === 'error') return Promise.resolve(new Response(null, { status: 500 }));
      if (url.includes('/contact-intents?')) return Promise.resolve(Response.json({ items: total ? [row] : [], total, page: 1, pageSize: 25 }));
      if (url.endsWith('/contact-intents/' + id)) return Promise.resolve(Response.json(row));
      if (url.endsWith('/relationship-processes/' + processId)) return Promise.resolve(Response.json(convertedProcess(row)));
      return Promise.resolve(new Response(null, { status: 404 }));
    }); vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => { client.clear(); vi.unstubAllGlobals(); });
  function view(path = '/contact-intents') { return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter></QueryClientProvider>); }
  const writes = () => fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST');
  it('UI 2.6 presenta encabezado, creación autorizada y metadata sin enriquecer la consulta', async () => {
    view(); const results = await screen.findByRole('region', { name: 'Resultados de intenciones' }); await within(results).findByRole('link', { name: row.purpose });
    expect(screen.getByRole('heading', { level: 1, name: 'Intenciones de contacto' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Crear intención' })).toHaveAttribute('href', '/contact-intents/new');
    expect(within(results).getByRole('link', { name: row.target.label })).toHaveAttribute('href', '/organizations/' + goal);
    expect(results).toHaveTextContent(row.author.displayName); expect(within(results).getByText('Creación')).toBeVisible(); expect(within(results).getByText('Última actividad')).toBeVisible();
    expect(results.querySelectorAll('time')).toHaveLength(2); expect(writes()).toHaveLength(0);
  });
  it('UI 2.6 oculta crear sin capability y conserva lectura', async () => {
    identity = { ...initialIdentity, permissions: permissions.filter(p => p !== 'relationships.intent.create') }; client.setQueryData(AUTH_QUERY_KEY, identity); view();
    await screen.findByRole('link', { name: row.purpose }); expect(screen.queryByRole('link', { name: 'Crear intención' })).not.toBeInTheDocument();
  });
  it.each(['ACTIVE', 'CONVERTED', 'CANCELLED', 'CLOSED'] as const)('UI 2.6 mantiene estado textual %s', async state => {
    row.state = state; view(); const results = screen.getByRole('region', { name: 'Resultados de intenciones' }); await within(results).findByRole('link', { name: row.purpose });
    expect(results).toHaveTextContent({ ACTIVE: 'Activa', CONVERTED: 'Convertida', CANCELLED: 'Cancelada', CLOSED: 'Cerrada' }[state]);
  });
  it('UI 2.6 conserva autor inactivo y cancelación como antecedentes', async () => {
    row = { ...row, state: 'CANCELLED', author: { ...row.author, isActive: false }, cancelledBy: row.author, cancelledAt: row.createdAt };
    view(); const results = screen.getByRole('region', { name: 'Resultados de intenciones' }); await within(results).findByRole('link', { name: row.purpose });
    expect(results).toHaveTextContent('Ana Prueba (cuenta inactiva)'); expect(within(results).getByText('Cancelada por')).toBeVisible(); expect(results.querySelectorAll('time')).toHaveLength(3);
  });
  it.each(['capability', 'contexto', 'cancelada', 'convertida', 'cerrada'])('no muestra convertir sin %s', async reason => {
    if (reason === 'capability') client.setQueryData(AUTH_QUERY_KEY, { ...identity, permissions: permissions.filter(p => !p.endsWith('.convert')) });
    if (reason === 'contexto') row.canConvert = false;
    if (reason === 'cancelada') row.state = 'CANCELLED';
    if (reason === 'convertida') row.state = 'CONVERTED';
    if (reason === 'cerrada') row.state = 'CLOSED';
    view('/contact-intents/' + id); await screen.findByText(row.purpose); expect(screen.queryByRole('button', { name: 'Convertir en proceso' })).not.toBeInTheDocument();
  });
  it('confirmar conversión usa versión, invalida ambas familias y navega a participantes', async () => {
    const invalidate = vi.spyOn(client, 'invalidateQueries'); view('/contact-intents/' + id);
    await userEvent.click(await screen.findByRole('button', { name: 'Convertir en proceso' })); expect(writes()).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: 'Volver sin convertir' })); expect(writes()).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: 'Convertir en proceso' }));
    expect(screen.getByText(/Tú serás su creador/)).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar conversión' }));
    expect(await screen.findByRole('heading', { name: 'Proceso de relación' })).toBeVisible();
    expect(screen.getByRole('region', { name: 'Participantes' })).toHaveTextContent('Creador del proceso');
    expect(JSON.parse(writes()[0]?.[1]?.body as string)).toEqual({ expectedVersion: 1 });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['relationships', ownerId] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['relationship-processes', ownerId] });
    expect(client.getQueryData([...intentIdentityKey(initialIdentity), 'intent', id])).toMatchObject({ state: 'CONVERTED', processId });
    expect(client.getQueryData([...processIdentityKey(initialIdentity), 'detail', processId])).toMatchObject({ sourceIntentId: id });
  });
  it.each([403, 409])('conversión %s mantiene contexto, bloquea reintento y permite recargar', async failure => {
    status = failure; view('/contact-intents/' + id); await userEvent.click(await screen.findByRole('button', { name: 'Convertir en proceso' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar conversión' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(failure === 403 ? 'No tienes permiso' : 'La intención cambió');
    expect(screen.getByText(row.purpose)).toBeVisible(); expect(screen.getByRole('link', { name: 'Fundación QA' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Confirmar conversión' })).toBeDisabled(); expect(writes()).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Recargar intención y revisar estado' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });
  it('intención convertida ofrece vínculo al proceso', async () => {
    row = { ...row, state: 'CONVERTED', canConvert: false, canCancel: false, processId };
    view('/contact-intents/' + id); expect(await screen.findByRole('link', { name: 'Ver proceso de relación' })).toHaveAttribute('href', '/relationship-processes/' + processId);
  });
  it.each(['logout', 'rol', 'capability'])('conversión tardía tras cambiar %s no repuebla datos ni navega', async change => {
    let finish!: (response: Response) => void;
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url, options) => url.endsWith('/convert') ? new Promise(resolve => { finish = resolve; }) : original(url, options));
    view('/contact-intents/' + id); await userEvent.click(await screen.findByRole('button', { name: 'Convertir en proceso' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar conversión' }));
    if (change === 'logout') { await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' })); await screen.findByRole('heading', { name: 'Iniciar sesión' }); }
    else await act(async () => { identity = { ...initialIdentity, ...(change === 'rol' ? { role: 'BOARD' } : { permissions: permissions.filter(p => p !== 'relationships.intent.convert') }) }; client.setQueryData(AUTH_QUERY_KEY, identity); });
    await waitFor(() => expect(client.getQueryData([...intentIdentityKey(initialIdentity), 'intent', id])).toBeUndefined());
    await act(async () => finish(Response.json({ intent: { ...row, state: 'CONVERTED', version: 2, canConvert: false, canCancel: false, processId }, process: convertedProcess(row) })));
    expect(client.getQueryData([...intentIdentityKey(initialIdentity), 'intent', id])).toBeUndefined();
    expect(client.getQueryData([...processIdentityKey(initialIdentity), 'detail', processId])).toBeUndefined();
    expect(screen.queryByRole('heading', { name: 'Proceso de relación' })).not.toBeInTheDocument();
  });
  it('lista cargando', () => { mode = 'pending'; view(); expect(screen.getByText('Cargando…')).toBeVisible(); });
  it('lista vacía', async () => { total = 0; view(); expect(await screen.findByText('No hay intenciones para estos filtros.')).toBeVisible(); });
  it('lista error con reintento', async () => { mode = 'error'; view(); await screen.findByRole('alert'); mode = 'ok'; await userEvent.click(screen.getByRole('button', { name: 'Reintentar' })); expect(await screen.findByRole('link', { name: row.purpose })).toBeVisible(); });
  it('lista contexto y abre detalle', async () => {
    view(); await userEvent.click(await screen.findByRole('link', { name: row.purpose }));
    expect(await screen.findByRole('heading', { name: 'Intención de contacto' })).toBeVisible(); expect(screen.getByText('Autor: Ana Prueba')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Fundación QA' })).toHaveAttribute('href', '/organizations/' + goal);
    expect(screen.getByText(/Última actividad:/)).toBeVisible();
  });
  it('lista pagina y filtra estado', async () => {
    total = 26; view(); await screen.findByRole('link', { name: row.purpose }); await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.includes('page=2'))).toBe(true));
    await userEvent.selectOptions(screen.getByLabelText('Estado de intenciones'), 'CANCELLED');
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.includes('page=1&state=CANCELLED'))).toBe(true));
  });
  it('validación exige propósito y selección contextual', async () => {
    view('/contact-intents/new'); await userEvent.click(screen.getByRole('button', { name: 'Guardar intención' }));
    expect(await screen.findByText('Describe el propósito.')).toBeVisible(); expect(screen.getByText('Selecciona un objetivo del Directorio.')).toBeVisible(); expect(writes()).toHaveLength(0);
  });
  it.each(['organización', 'persona'])('selección de %s y creación sin author/estado desde cliente', async kind => {
    view('/contact-intents/new'); const user = userEvent.setup();
    await user.type(screen.getByLabelText('Buscar objetivo por nombre'), 'QA');
    await user.click(await screen.findByRole('button', { name: kind === 'organización' ? 'Seleccionar organización: Fundación QA' : 'Seleccionar persona: Persona QA' }));
    await user.type(screen.getByLabelText('Propósito'), 'Preparar propuesta'); await user.click(screen.getByRole('button', { name: 'Guardar intención' }));
    await screen.findByRole('heading', { name: 'Intención de contacto' });
    expect(JSON.parse(writes()[0]?.[1]?.body as string)).toEqual({ purpose: 'Preparar propuesta', ...(kind === 'organización' ? { organizationId: goal } : { personId: ownerId }) });
  });
  it('quitar objetivo exige seleccionar nuevamente', async () => {
    view('/contact-intents/new'); await userEvent.type(screen.getByLabelText('Buscar objetivo por nombre'), 'QA'); await userEvent.click(await screen.findByRole('button', { name: 'Seleccionar organización: Fundación QA' }));
    await userEvent.click(screen.getByRole('button', { name: 'Quitar objetivo' })); expect(await screen.findByText('Selecciona un objetivo del Directorio.')).toBeVisible();
  });
  it.each(['vinculada', 'inactiva', 'consolidada'])('no ofrece una persona %s', async condition => {
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url, options) => {
      const response = await original(url, options);
      if (!url.includes('/search?')) return response;
      const data = await response.json() as DirectorySearchResponse;
      data.organizations.items = []; data.organizations.total = 0;
      if (condition === 'vinculada') data.people.items[0]!.currentRelationsTotal = 1;
      if (condition === 'inactiva') data.people.items[0]!.isActive = false;
      if (condition === 'consolidada') data.people.items[0]!.duplicateOf = { id: goal, displayName: 'Principal', isActive: true };
      return Response.json(data);
    });
    view('/contact-intents/new'); await userEvent.type(screen.getByLabelText('Buscar objetivo por nombre'), 'QA');
    expect(await screen.findByText(/No hay objetivos seleccionables/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Seleccionar persona: Persona QA' })).not.toBeInTheDocument();
  });
  it('creación 409 conserva propósito y objetivo', async () => {
    status = 409; view('/contact-intents/new'); await userEvent.type(screen.getByLabelText('Buscar objetivo por nombre'), 'QA');
    await userEvent.click(await screen.findByRole('button', { name: 'Seleccionar organización: Fundación QA' })); await userEvent.type(screen.getByLabelText('Propósito'), 'Borrador conservado');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar intención' })); await screen.findByRole('alert');
    expect(screen.getByLabelText('Propósito')).toHaveValue('Borrador conservado'); expect(screen.getByText('Fundación QA')).toBeVisible();
  });
  it.each(['capability', 'contexto', 'cancelada'])('no muestra cancelar sin %s', async reason => {
    if (reason === 'capability') client.setQueryData(AUTH_QUERY_KEY, { ...identity, permissions: permissions.filter(p => !p.endsWith('.cancel')) });
    if (reason === 'contexto') row.canCancel = false;
    if (reason === 'cancelada') row = { ...row, state: 'CANCELLED', canCancel: false };
    view('/contact-intents/' + id); await screen.findByText(row.purpose); expect(screen.queryByRole('button', { name: 'Cancelar intención' })).not.toBeInTheDocument();
  });
  it('confirmación no escribe hasta confirmar; volver no cancela', async () => {
    view('/contact-intents/' + id); await userEvent.click(await screen.findByRole('button', { name: 'Cancelar intención' })); expect(writes()).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: 'Volver sin cancelar' })); expect(writes()).toHaveLength(0);
  });
  it('cancelación invalida queries y muestra estado actualizado', async () => {
    const invalidate = vi.spyOn(client, 'invalidateQueries'); view('/contact-intents/' + id);
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar intención' })); await userEvent.click(screen.getByRole('button', { name: 'Confirmar cancelación' }));
    expect(await screen.findByText('Estado: Cancelada')).toBeVisible(); expect(invalidate).toHaveBeenCalledWith({ queryKey: ['relationships', ownerId] });
    expect(JSON.parse(writes()[0]?.[1]?.body as string)).toEqual({ expectedVersion: 1 });
  });
  it.each([403, 409])('cancelación %s conserva contexto y explica fallo', async failure => {
    status = failure; view('/contact-intents/' + id); await userEvent.click(await screen.findByRole('button', { name: 'Cancelar intención' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar cancelación' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(failure === 403 ? 'No tienes permiso' : 'La intención cambió');
    expect(screen.getByText(row.purpose)).toBeVisible(); expect(screen.getByRole('link', { name: 'Fundación QA' })).toBeVisible(); expect(writes()).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Recargar intención y revisar estado' })); await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });
  it('ruta prohibida no consulta intenciones', () => {
    client.setQueryData(AUTH_QUERY_KEY, { ...identity, permissions: ['directory.read'] }); view();
    expect(screen.getByRole('alert')).toHaveTextContent('No tienes permiso para consultar intenciones'); expect(fetchMock.mock.calls.some(([url]) => url.includes('/contact-intents'))).toBe(false);
  });
  it.each(['logout', 'identidad', 'permiso', 'rol'])('limpia caché al cambiar %s', async change => {
    client.setQueryData([...intentIdentityKey(initialIdentity), 'intents'], { private: 'QA' });
    const next = change === 'logout' ? null : { ...initialIdentity,
      ...(change === 'identidad' ? { id: goal } : {}), ...(change === 'permiso' ? { permissions: ['directory.read'] } : {}), ...(change === 'rol' ? { role: 'BOARD' as const } : {}) };
    await clearForbiddenIntents(client, next); expect(client.getQueryCache().findAll({ queryKey: ['relationships'] })).toHaveLength(0);
  });
  it('logout real retira detalle y caché', async () => {
    view('/contact-intents/' + id); await screen.findByText(row.purpose); await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    await screen.findByRole('heading', { name: 'Iniciar sesión' }); expect(screen.queryByText(row.purpose)).not.toBeInTheDocument();
    expect(client.getQueryCache().findAll({ queryKey: ['relationships'] })).toHaveLength(0);
  });
  it('respuesta tardía de cancelación después de logout no repuebla caché', async () => {
    let finish!: (response: Response) => void;
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url, options) => url.endsWith('/cancel') ? new Promise(resolve => { finish = resolve; }) : original(url, options));
    view('/contact-intents/' + id);
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar intención' })); await userEvent.click(screen.getByRole('button', { name: 'Confirmar cancelación' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' })); await screen.findByRole('heading', { name: 'Iniciar sesión' });
    await act(async () => finish(Response.json({ ...row, state: 'CANCELLED', canCancel: false, version: 2, cancelledAt: row.createdAt, cancelledBy: row.author })));
    expect(client.getQueryCache().findAll({ queryKey: ['relationships'] })).toHaveLength(0);
  });
  it('cambio de rol en layout elimina capacidades contextuales anteriores', async () => {
    view('/contact-intents/' + id); await screen.findByText(row.purpose);
    const oldKey = [...intentIdentityKey(initialIdentity), 'intent', id];
    await act(async () => { identity = { ...initialIdentity, role: 'BOARD' }; client.setQueryData(AUTH_QUERY_KEY, identity); });
    await waitFor(() => expect(client.getQueryData(oldKey)).toBeUndefined());
  });
});
