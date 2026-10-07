import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../../app/router/app-routes';
import { createQueryClient } from '../../lib/query/query-client';
import { AUTH_QUERY_KEY, type AuthIdentity } from '../auth/session';
import { clearForbiddenProcesses, processIdentityKey } from './process-queries';
import type { ProcessDetail, ProcessEvent } from './process-contracts';
const id = '11111111-1111-4111-8111-111111111111', goal = '22222222-2222-4222-8222-222222222222', ownerId = '33333333-3333-4333-8333-333333333333';
const permissions = ['directory.read', 'relationships.process.read', 'relationships.process.create', 'relationships.process.state.change', 'relationships.process.close', 'relationships.process.reopen'];
const initialIdentity: AuthIdentity = { id: ownerId, givenNames: 'Ana', familyNames: 'Prueba', username: 'ana', email: 'qa@example.test', role: 'RESEARCH', permissions };
const user = { id: ownerId, displayName: 'Ana Prueba', isActive: true }, timestamp = '2026-10-03T12:00:00.000Z';
function process(): ProcessDetail {
  return { id, purpose: 'Propuesta de cooperación', state: 'PREPARATION', version: 1, createdBy: user, sourceIntentId: null,
    target: { kind: 'ORGANIZATION', id: goal, label: 'Fundación QA', isActive: true }, createdAt: timestamp, updatedAt: timestamp, lastActivityAt: timestamp,
    currentResult: null, closureObservation: null, closedAt: null, closedBy: null, allowedStates: ['IN_PROGRESS', 'WAITING_RESPONSE'], canClose: true, canReopen: false, exceptionalAdministration: false,
    participants: [{ user, joinedAt: timestamp, origin: 'PROCESS_CREATOR' }], events: [{ id: goal, type: 'CREATED', previousState: null, newState: 'PREPARATION', result: null, observation: null, actor: user, authority: 'PARTICIPANT', version: 1, createdAt: timestamp }], eventsTotal: 1 };
}
function closed(): ProcessDetail {
  const row = process();
  return { ...row, state: 'CLOSED', version: 2, allowedStates: [], canClose: false, canReopen: true, currentResult: 'OTHER', closureObservation: 'Cierre histórico', closedAt: timestamp, closedBy: user,
    events: [{ ...row.events[0]!, id: ownerId, type: 'CLOSED', previousState: 'PREPARATION', newState: 'CLOSED', result: 'OTHER', observation: 'Cierre histórico', version: 2 }, ...row.events], eventsTotal: 2 };
}
describe('Procesos de relación frontend', () => {
  let client = createQueryClient(), identity: AuthIdentity | null = initialIdentity, row = process(), mode = 'ok', status = 201, total = 1;
  const fetchMock = vi.fn<(url: string, options?: RequestInit) => Promise<Response>>();
  beforeEach(() => {
    client = createQueryClient(); identity = initialIdentity; row = process(); mode = 'ok'; status = 201; total = 1;
    client.setQueryDefaults(AUTH_QUERY_KEY, { staleTime: Infinity }); client.setQueryData(AUTH_QUERY_KEY, identity);
    fetchMock.mockReset(); fetchMock.mockImplementation((url, options) => {
      if (url.endsWith('auth/me')) return Promise.resolve(Response.json(identity ?? {}, { status: identity ? 200 : 401 }));
      if (url.endsWith('auth/logout')) { identity = null; return Promise.resolve(new Response(null, { status: 204 })); }
      if (url.includes('/search?')) return Promise.resolve(Response.json({ query: 'QA', email: null,
        organizations: { items: [{ type: 'ORGANIZATION', id: goal, name: 'Fundación QA', alias: null, country: null, parent: null, duplicateOf: null, isActive: true }], total: 1, page: 1, pageSize: 25 },
        people: { items: [], total: 0, page: 1, pageSize: 25 } }));
      if (options?.method === 'POST') {
        if (status !== 201) return Promise.resolve(Response.json({ code: status === 409 ? 'VERSION_CONFLICT' : 'FORBIDDEN' }, { status }));
        const body = JSON.parse(String(options.body)) as { state?: ProcessDetail['state']; result?: ProcessDetail['currentResult']; observation?: string; reason?: string };
        if (url.endsWith('/close')) row = { ...closed(), currentResult: body.result!, closureObservation: body.observation ?? null };
        else if (url.endsWith('/reopen') || url.endsWith('/state')) {
          const event: ProcessEvent = { id: goal, type: url.endsWith('/reopen') ? 'REOPENED' : 'STATE_CHANGED', previousState: row.state, newState: body.state!, result: null, observation: body.reason ?? null, actor: user, authority: 'PARTICIPANT', version: row.version + 1, createdAt: timestamp };
          row = { ...row, state: body.state!, version: row.version + 1, currentResult: null, closureObservation: null, closedAt: null, closedBy: null, canClose: true, canReopen: false, allowedStates: ['WAITING_RESPONSE', 'NEGOTIATION'], events: [event, ...row.events], eventsTotal: row.eventsTotal + 1 };
        }
        return Promise.resolve(Response.json(row, { status: 201 }));
      }
      if (mode === 'pending') return new Promise<Response>(() => undefined);
      if (mode === 'error') return Promise.resolve(new Response(null, { status: 500 }));
      if (url.includes('/relationship-processes?')) return Promise.resolve(Response.json({ items: total ? [row] : [], total, page: 1, pageSize: 25 }));
      if (url.includes('/events?')) return Promise.resolve(Response.json({ items: [row.events[row.events.length - 1]], total: row.eventsTotal, page: 2, pageSize: 25 }));
      if (url.endsWith('/relationship-processes/' + id)) return Promise.resolve(Response.json(row));
      return Promise.resolve(new Response(null, { status: 404 }));
    }); vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => { client.clear(); vi.unstubAllGlobals(); });
  function view(path = '/relationship-processes') { return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter></QueryClientProvider>); }
  it.each(['SENT_COMMUNICATION', 'RECEIVED_COMMUNICATION'] as const)('participante histórico por %s se distingue del creador', async origin => {
    row.participants.push({ user: { id: goal, displayName: 'Participante histórico', isActive: false }, joinedAt: timestamp, origin });
    view('/relationship-processes/' + id);
    const participants = await screen.findByRole('region', { name: 'Participantes' });
    expect(participants).toHaveTextContent('Participante histórico (cuenta inactiva)');
    expect(participants).toHaveTextContent(origin === 'SENT_COMMUNICATION' ? 'Comunicación enviada' : 'Comunicación recibida');
    expect(within(participants).getAllByText(/Creador del proceso/)).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /añadir participante/i })).not.toBeInTheDocument();
  });
  function writes() { return fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST'); }
  it('listado muestra contexto institucional y navegación', async () => {
    view(); expect(await screen.findByRole('link', { name: 'Propuesta de cooperación' })).toBeVisible(); expect(screen.getAllByRole('link', { name: 'Procesos' }).length).toBeGreaterThan(0);
    expect(screen.getByText('Creador: Ana Prueba')).toBeVisible(); expect(screen.getByText('Estado: En preparación')).toBeVisible(); expect(screen.getByText(/Última actividad formal:/)).toBeVisible();
  });
  it('estado filtra y reinicia página, paginación cambia solicitud', async () => {
    total = 30; view(); await screen.findByText('Página 1 de 2 · 30 registros'); await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.includes('page=2'))).toBe(true));
    await userEvent.selectOptions(screen.getByLabelText('Estado de procesos'), 'CLOSED');
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.includes('page=1&state=CLOSED'))).toBe(true));
  });
  it.each(['pending', 'error', 'empty'])('listado maneja %s', async state => {
    mode = state === 'empty' ? 'ok' : state; total = state === 'empty' ? 0 : 1; view();
    if (state === 'pending') expect(screen.getByRole('status')).toHaveTextContent('Cargando');
    else if (state === 'error') expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar');
    else expect(await screen.findByText('No hay procesos para estos filtros.')).toBeVisible();
  });
  it('error de lectura permite reintentar', async () => { mode = 'error'; view(); await screen.findByRole('alert'); mode = 'ok'; await userEvent.click(screen.getByRole('button', { name: 'Reintentar' })); expect(await screen.findByRole('link', { name: row.purpose })).toBeVisible(); });
  it('creación valida campos y no permite elegir estado inicial', async () => {
    view('/relationship-processes/new'); await userEvent.click(screen.getByRole('button', { name: 'Guardar proceso' }));
    expect(await screen.findByText('Describe el propósito.')).toBeVisible(); expect(screen.getByText('Selecciona un actor del Directorio.')).toBeVisible(); expect(writes()).toHaveLength(0);
    expect(screen.queryByLabelText('Estado de destino')).not.toBeInTheDocument();
  });
  it('crea con selector existente y autor de sesión', async () => {
    view('/relationship-processes/new'); await userEvent.type(screen.getByLabelText('Buscar objetivo por nombre'), 'QA');
    await userEvent.click(await screen.findByRole('button', { name: 'Seleccionar organización: Fundación QA' })); await userEvent.type(screen.getByLabelText('Propósito'), 'Meta');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar proceso' })); await screen.findByRole('heading', { name: 'Proceso de relación' });
    expect(JSON.parse(String(writes()[0]![1]?.body))).toEqual({ purpose: 'Meta', organizationId: goal });
  });
  it.each([403, 409])('creación %s preserva borrador y objetivo', async failure => {
    status = failure; view('/relationship-processes/new'); await userEvent.type(screen.getByLabelText('Buscar objetivo por nombre'), 'QA');
    await userEvent.click(await screen.findByRole('button', { name: 'Seleccionar organización: Fundación QA' })); await userEvent.type(screen.getByLabelText('Propósito'), 'Borrador');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar proceso' })); await screen.findByRole('alert');
    expect(screen.getByLabelText('Propósito')).toHaveValue('Borrador'); expect(screen.getByText('Fundación QA')).toBeVisible();
  });
  it('detalle muestra participante creador e historial funcional', async () => {
    view('/relationship-processes/' + id); await screen.findByText(row.purpose);
    expect(within(screen.getByRole('region', { name: 'Participantes' })).getByText(/Creador del proceso/)).toBeVisible();
    expect(within(screen.getByRole('region', { name: 'Historial del proceso' })).getByText(/Creación ·/)).toBeVisible();
    expect(screen.queryByText('Comunicaciones')).not.toBeInTheDocument();
  });
  it('historial pagina sin ocultar cierres anteriores', async () => {
    row = { ...closed(), eventsTotal: 30 }; view('/relationship-processes/' + id); await screen.findByText(row.purpose);
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' })); expect(await screen.findByText(/Creación ·/)).toBeVisible();
    expect(fetchMock.mock.calls.some(([url]) => url.includes('/events?page=2'))).toBe(true);
  });
  it('cambio muestra únicamente destinos permitidos y manda expectedVersion', async () => {
    view('/relationship-processes/' + id); await screen.findByText(row.purpose); await userEvent.click(screen.getByRole('button', { name: 'Cambiar estado' }));
    const select = screen.getByLabelText('Estado de destino'); expect(within(select).queryByRole('option', { name: 'Cerrado' })).not.toBeInTheDocument(); expect(within(select).queryByRole('option', { name: 'En negociación' })).not.toBeInTheDocument();
    await userEvent.selectOptions(select, 'IN_PROGRESS'); await userEvent.click(screen.getByRole('button', { name: 'Confirmar cambio de estado' }));
    expect(await screen.findByText('Estado: En curso')).toBeVisible(); expect(JSON.parse(String(writes()[0]![1]?.body))).toEqual({ state: 'IN_PROGRESS', expectedVersion: 1 });
  });
  it('cierre exige resultado y Otro exige observación', async () => {
    view('/relationship-processes/' + id); await screen.findByText(row.purpose); await userEvent.click(screen.getByRole('button', { name: 'Cerrar proceso' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar cierre' })); expect(await screen.findByText('Selecciona un resultado.')).toBeVisible();
    await userEvent.selectOptions(screen.getByLabelText('Resultado de cierre'), 'OTHER'); await userEvent.click(screen.getByRole('button', { name: 'Confirmar cierre' }));
    expect(await screen.findByText('Explica el resultado Otro.')).toBeVisible(); expect(writes()).toHaveLength(0);
    await userEvent.type(screen.getByLabelText('Observación de cierre (obligatoria para Otro)'), 'Razón conservada'); await userEvent.click(screen.getByRole('button', { name: 'Confirmar cierre' }));
    expect(await screen.findByText('Estado: Cerrado')).toBeVisible(); expect(JSON.parse(String(writes()[0]![1]?.body))).toEqual({ result: 'OTHER', observation: 'Razón conservada', expectedVersion: 1 });
  });
  it('reapertura exige estado explícito, motivo y confirmación, conservando cierre previo', async () => {
    row = closed(); view('/relationship-processes/' + id); await screen.findByText(row.purpose); await userEvent.click(screen.getByRole('button', { name: 'Reabrir proceso' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar reapertura' })); expect(await screen.findByText('Selecciona un estado abierto.')).toBeVisible();
    await userEvent.selectOptions(screen.getByLabelText('Estado de destino'), 'NEGOTIATION'); await userEvent.type(screen.getByLabelText('Motivo de reapertura'), 'Respuesta tardía');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar reapertura' })); expect(await screen.findByText('Estado: En negociación')).toBeVisible();
    expect(screen.getByText('Cierre histórico')).toBeVisible(); expect(screen.getByText('Resultado histórico: Otro')).toBeVisible();
    expect(JSON.parse(String(writes()[0]![1]?.body))).toEqual({ state: 'NEGOTIATION', reason: 'Respuesta tardía', expectedVersion: 2 });
  });
  it.each(['state', 'close', 'reopen'] as const)('sin capability %s oculta acción aunque backend permita', async action => {
    if (action === 'reopen') row = closed(); identity = { ...initialIdentity, permissions: permissions.filter(p => p !== 'relationships.process.' + (action === 'state' ? 'state.change' : action)) };
    client.setQueryData(AUTH_QUERY_KEY, identity); view('/relationship-processes/' + id); await screen.findByText(row.purpose);
    expect(screen.queryByRole('button', { name: action === 'state' ? 'Cambiar estado' : action === 'close' ? 'Cerrar proceso' : 'Reabrir proceso' })).not.toBeInTheDocument();
  });
  it.each(['RESEARCH', 'PLANNING'] as const)('%s no participante solo consulta', async role => {
    identity = { ...initialIdentity, role }; client.setQueryData(AUTH_QUERY_KEY, identity); row = { ...row, canClose: false, canReopen: false, allowedStates: [] };
    view('/relationship-processes/' + id); await screen.findByText(row.purpose); expect(screen.queryByRole('button', { name: 'Cerrar proceso' })).not.toBeInTheDocument(); expect(screen.getByText(/Consulta disponible/)).toBeVisible();
  });
  it('Administración ve intervención excepcional y Directorio en historial', async () => {
    row = { ...closed(), exceptionalAdministration: true, events: closed().events.map(event => ({ ...event, authority: 'BOARD' })) };
    view('/relationship-processes/' + id); await screen.findByText(row.purpose); expect(screen.getByText(/se registrará como intervención excepcional/)).toBeVisible(); expect(screen.getAllByText('Intervención de Directorio')).toHaveLength(2);
  });
  it.each([403, 409])('cierre %s conserva formulario, bloquea reintento y exige recarga', async failure => {
    status = failure; view('/relationship-processes/' + id); await screen.findByText(row.purpose); await userEvent.click(screen.getByRole('button', { name: 'Cerrar proceso' }));
    await userEvent.selectOptions(screen.getByLabelText('Resultado de cierre'), 'OTHER'); await userEvent.type(screen.getByLabelText('Observación de cierre (obligatoria para Otro)'), 'Propuesta conservada');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar cierre' })); await screen.findByRole('alert');
    expect(screen.getByLabelText('Observación de cierre (obligatoria para Otro)')).toHaveValue('Propuesta conservada'); expect(screen.getByRole('button', { name: 'Confirmar cierre' })).toBeDisabled(); expect(writes()).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Recargar proceso y revisar estado' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirmar cierre' })).toBeEnabled()); expect(screen.getByLabelText('Observación de cierre (obligatoria para Otro)')).toHaveValue('Propuesta conservada');
  });
  it.each([403, 409])('cambio %s conserva destino y motivo', async failure => {
    status = failure; view('/relationship-processes/' + id); await screen.findByText(row.purpose); await userEvent.click(screen.getByRole('button', { name: 'Cambiar estado' }));
    await userEvent.selectOptions(screen.getByLabelText('Estado de destino'), 'WAITING_RESPONSE'); await userEvent.type(screen.getByLabelText('Motivo del cambio (opcional)'), 'Contexto');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar cambio de estado' })); await screen.findByRole('alert'); expect(screen.getByLabelText('Estado de destino')).toHaveValue('WAITING_RESPONSE'); expect(screen.getByLabelText('Motivo del cambio (opcional)')).toHaveValue('Contexto');
  });
  it.each(['/relationship-processes', '/relationship-processes/new', '/relationship-processes/' + id])('sin capability no muestra datos ni formulario en %s', path => {
    identity = { ...initialIdentity, permissions: [] }; client.setQueryData(AUTH_QUERY_KEY, identity); view(path);
    expect(screen.getByRole('alert')).toHaveTextContent('No tienes permiso'); expect(screen.queryByLabelText('Propósito')).not.toBeInTheDocument(); expect(screen.queryByText(row.purpose)).not.toBeInTheDocument();
  });
  it.each([403, 409])('reapertura %s conserva estado y motivo antes de recargar', async failure => {
    row = closed(); status = failure; view('/relationship-processes/' + id); await screen.findByText(row.purpose); await userEvent.click(screen.getByRole('button', { name: 'Reabrir proceso' }));
    await userEvent.selectOptions(screen.getByLabelText('Estado de destino'), 'NEGOTIATION'); await userEvent.type(screen.getByLabelText('Motivo de reapertura'), 'Mismo acercamiento');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar reapertura' })); await screen.findByRole('alert');
    expect(screen.getByLabelText('Estado de destino')).toHaveValue('NEGOTIATION'); expect(screen.getByLabelText('Motivo de reapertura')).toHaveValue('Mismo acercamiento');
    expect(screen.getByRole('button', { name: 'Confirmar reapertura' })).toBeDisabled(); expect(screen.getByText('Resultado histórico: Otro')).toBeVisible();
  });
  it.each(['identidad', 'rol', 'capabilities', 'logout'])('caché se retira por %s', async reason => {
    const key = [...processIdentityKey(initialIdentity), 'detail', id]; client.setQueryData(key, row);
    const next = reason === 'logout' ? null : { ...initialIdentity, ...(reason === 'identidad' ? { id: goal } : reason === 'rol' ? { role: 'PLANNING' as const } : { permissions: [] }) };
    await clearForbiddenProcesses(client, next); expect(client.getQueryData(key)).toBeUndefined();
  });
  it('identidad cambia durante consulta: no muestra datos anteriores', async () => {
    const key = [...processIdentityKey(initialIdentity), 'detail', id]; client.setQueryData(key, row); view('/relationship-processes/' + id); await screen.findByText(row.purpose); mode = 'pending';
    await act(async () => { client.setQueryData(AUTH_QUERY_KEY, { ...initialIdentity, id: goal }); });
    await waitFor(() => expect(screen.queryByText(row.purpose)).not.toBeInTheDocument()); await waitFor(() => expect(client.getQueryData(key)).toBeUndefined());
  });
  it('respuesta de mutación tardía no repuebla caché después de logout', async () => {
    let resolve!: (response: Response) => void;
    const normal = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url, options) => options?.method === 'POST' && url.endsWith('/close') ? new Promise<Response>(done => { resolve = done; }) : normal(url, options));
    view('/relationship-processes/' + id); await screen.findByText(row.purpose); await userEvent.click(screen.getByRole('button', { name: 'Cerrar proceso' })); await userEvent.selectOptions(screen.getByLabelText('Resultado de cierre'), 'ACHIEVED'); await userEvent.click(screen.getByRole('button', { name: 'Confirmar cierre' }));
    await waitFor(() => expect(resolve).toBeDefined()); await act(async () => { client.setQueryData(AUTH_QUERY_KEY, null); await clearForbiddenProcesses(client, null); resolve(Response.json(closed(), { status: 201 })); });
    await waitFor(() => expect(client.getQueriesData({ queryKey: ['relationship-processes'] })).toHaveLength(0));
  });
});
