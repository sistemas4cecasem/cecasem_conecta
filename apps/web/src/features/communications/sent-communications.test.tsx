import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../../app/router/app-routes';
import { createQueryClient } from '../../lib/query/query-client';
import { AUTH_QUERY_KEY, type AuthIdentity } from '../auth/session';
import { clearForbiddenCommunications, communicationIdentityKey } from './queries';
import { addresses, sentBody, sentFormSchema } from './contracts';
import type { ProcessDetail } from '../relationships/process-contracts';
const id = '11111111-1111-4111-8111-111111111111', goal = '22222222-2222-4222-8222-222222222222', ownerId = '33333333-3333-4333-8333-333333333333';
const permissions = ['directory.read', 'communications.read', 'communications.sent.create', 'relationships.intent.read', 'relationships.restriction.read', 'relationships.process.read', 'relationships.process.create', 'relationships.process.state.change', 'relationships.process.close', 'relationships.process.reopen'];
const initialIdentity: AuthIdentity = { id: ownerId, givenNames: 'Ana', familyNames: 'Prueba', username: 'ana', email: 'qa@example.test', role: 'RESEARCH', permissions };
const user = { id: ownerId, displayName: 'Ana Prueba', isActive: true }, timestamp = '2026-10-03T12:00:00.000Z';
function process(): ProcessDetail {
  return { id, purpose: 'Propuesta de cooperación', state: 'PREPARATION', version: 1, createdBy: user, sourceIntentId: null,
    target: { kind: 'ORGANIZATION', id: goal, label: 'Fundación QA', isActive: true }, createdAt: timestamp, updatedAt: timestamp, lastActivityAt: timestamp,
    currentResult: null, closureObservation: null, closedAt: null, closedBy: null, allowedStates: ['IN_PROGRESS', 'WAITING_RESPONSE'], canClose: true, canReopen: false, exceptionalAdministration: false,
    participants: [{ user, joinedAt: timestamp, origin: 'PROCESS_CREATOR' }], events: [{ id: goal, type: 'CREATED', previousState: null, newState: 'PREPARATION', result: null, observation: null, actor: user, authority: 'PARTICIPANT', version: 1, createdAt: timestamp }], eventsTotal: 1 };
}
const account = { id: goal, address: 'institucional@example.test', displayName: 'Cooperación' }, communicationId = '44444444-4444-4444-8444-444444444444';
const originalBody = '  Hola\n\n<script>literal</script>\nFirma https://example.test  ';
const communication = () => ({ id: communicationId, processId: id, direction: 'SENT', validity: 'VALID', version: 1, emailAccount: account, sender: account.address, subject: '  Asunto  original ', bodyOriginal: originalBody, sentAt: '2000-01-01T12:00:00.000Z', receivedAt: null, occurredAt: '2000-01-01T12:00:00.000Z', createdAt: timestamp, registeredBy: user,
  recipients: [{ type: 'TO', addressOriginal: 'Nueva@Example.test', normalizedAddress: 'nueva@example.test', position: 0 }, { type: 'CC', addressOriginal: 'copia@example.test', normalizedAddress: 'copia@example.test', position: 0 }, { type: 'BCC', addressOriginal: 'privada@example.test', normalizedAddress: 'privada@example.test', position: 0 }] });
describe('Registro manual de comunicación enviada', () => {
  let client = createQueryClient(), identity = initialIdentity, row = process(), accounts = [account], restricted = false, mode = 'ok', failure = 0, listTotal = 0;
  const fetchMock = vi.fn<(url: string, options?: RequestInit) => Promise<Response>>();
  beforeEach(() => {
    client = createQueryClient(); identity = initialIdentity; row = process(); accounts = [account]; restricted = false; mode = 'ok'; failure = 0; listTotal = 0;
    client.setQueryDefaults(AUTH_QUERY_KEY, { staleTime: Infinity }); client.setQueryData(AUTH_QUERY_KEY, identity);
    fetchMock.mockReset(); fetchMock.mockImplementation((url, options) => {
      if (url.endsWith('/auth/me')) return Promise.resolve(Response.json(identity));
      if (options?.method === 'POST') {
        if (mode === 'writing') return new Promise<Response>(() => undefined);
        if (failure) return Promise.resolve(Response.json({ code: failure === 403 ? 'FORBIDDEN' : 'MAILBOX_UNAVAILABLE' }, { status: failure }));
        row = { ...row, version: 2, participants: [...row.participants, { user: { ...user, id: goal, displayName: 'Registrador' }, joinedAt: timestamp, origin: 'SENT_COMMUNICATION' }] };
        return Promise.resolve(Response.json(communication(), { status: 201 }));
      }
      if (url.endsWith('/me/email-accounts')) return mode === 'pending' ? new Promise<Response>(() => undefined) : Promise.resolve(mode === 'error' ? new Response(null, { status: 500 }) : Response.json(accounts));
      if (url.includes('/relationship-context?')) return Promise.resolve(Response.json({ target: row.target, restriction: restricted ? { id: goal, reason: 'Solicitud expresa', createdAt: timestamp } : null, contactAllowed: !restricted, activeIntents: { items: [], total: 0 }, activeProcesses: { items: [], total: 0 }, recentClosedProcesses: { items: [], total: 0 }, relatedOrganizationContext: { items: [], total: 0 }, hasRelationshipHistory: false, hasRegisteredCommunicationHistory: false, communicationSummary: { total: 0, lastOccurredAt: null, lastDirection: null }, recentCommunications: [] }));
      if (url.includes('/communications?page=')) return Promise.resolve(Response.json({ items: listTotal ? [communication()] : [], total: listTotal, page: 1, pageSize: 25 }));
      if (url.endsWith('/communications/' + communicationId)) return Promise.resolve(Response.json(communication()));
      if (url.endsWith('/relationship-processes/' + id)) return Promise.resolve(Response.json(row));
      return Promise.resolve(new Response(null, { status: 404 }));
    }); vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => { client.clear(); vi.unstubAllGlobals(); });
  function view(path = '/relationship-processes/' + id + '/communications/sent') { return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter></QueryClientProvider>); }
  const writes = () => fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST');
  async function fill() {
    await userEvent.selectOptions(await screen.findByLabelText('Cuenta remitente'), goal);
    await userEvent.type(screen.getByLabelText('Para'), 'Nueva@Example.test;otra@example.test'); await userEvent.type(screen.getByLabelText('CC'), 'copia@example.test'); await userEvent.type(screen.getByLabelText('CCO'), 'privada@example.test');
    await userEvent.type(screen.getByLabelText('Asunto'), '  Asunto  original '); await userEvent.type(screen.getByLabelText('Cuerpo original'), originalBody);
    await userEvent.type(screen.getByLabelText('Fecha y hora real de envío'), '2000-01-01T12:00');
    await userEvent.click(screen.getByRole('button', { name: 'Revisar registro' }));
    await screen.findByRole('region', { name: 'Confirmar comunicación enviada' });
  }
  it('convierte separadores preservando orden/mayúsculas y conserva texto original', () => {
    expect(addresses(' A@example.test; B@example.test\nA@example.test ')).toEqual(['A@example.test', 'B@example.test', 'A@example.test']);
    const values = { emailAccountId: goal, to: 'Nueva@Example.test', cc: '', bcc: '', subject: '  original ', body: originalBody, sentAt: '2000-01-01T12:00' };
    expect(sentBody(sentFormSchema.parse(values))).toMatchObject({ body: originalBody, subject: values.subject, cc: [], bcc: [] });
    for (const patch of [{ to: '' }, { cc: 'mal' }, { bcc: 'mal' }, { sentAt: '2999-01-01T12:00' }]) expect(sentFormSchema.safeParse({ ...values, ...patch }).success).toBe(false);
  });
  it.each(['ADMINISTRATOR', 'BOARD', 'RESEARCH', 'PLANNING'] as const)('%s consulta snapshots y CCO sin edición ni interpretación HTML', async role => {
    identity = { ...initialIdentity, role }; client.setQueryData(AUTH_QUERY_KEY, identity); const rendered = view('/communications/' + communicationId);
    expect(await screen.findByText('privada@example.test')).toBeVisible(); expect(screen.getByText('Remitente: ' + account.address)).toBeVisible(); expect(rendered.container.querySelector('pre')?.textContent).toBe(originalBody); expect(rendered.container.querySelector('script')).toBeNull(); expect(screen.queryByRole('button', { name: /editar|eliminar/i })).not.toBeInTheDocument();
  });
  it('validación evita envío sin campos obligatorios y remitente no puede introducirse libremente', async () => {
    view(); await screen.findByLabelText('Cuenta remitente'); await userEvent.click(screen.getByRole('button', { name: 'Revisar registro' }));
    expect(await screen.findByText('Incluye al menos un destinatario Para.')).toBeVisible(); expect(writes()).toHaveLength(0); expect(screen.queryByLabelText('Remitente')).not.toBeInTheDocument();
  });
  it('confirmación explícita registra texto, destinatarios externos y fecha real; refresca proceso/participantes', async () => {
    view(); await fill(); expect(writes()).toHaveLength(0); const confirmation = screen.getByRole('region', { name: 'Confirmar comunicación enviada' }); expect(within(confirmation).getByText('CCO: privada@example.test')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar registro' })); await screen.findByRole('heading', { name: 'Comunicación enviada registrada' });
    const options = writes()[0]![1]!; expect(JSON.parse(String(options.body))).toEqual({ emailAccountId: goal, to: ['Nueva@Example.test', 'otra@example.test'], cc: ['copia@example.test'], bcc: ['privada@example.test'], subject: '  Asunto  original ', body: originalBody, sentAt: new Date('2000-01-01T12:00').toISOString() }); expect(new Headers(options.headers).get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/);
    await userEvent.click(screen.getByRole('link', { name: 'Volver al proceso' })); const participants = await screen.findByRole('region', { name: 'Participantes' }); expect(participants).toHaveTextContent('Registrador'); expect(participants).toHaveTextContent('Comunicación enviada');
  });
  it.each([403, 409])('rechazo %s conserva borrador y reutiliza clave de solicitud', async status => {
    failure = status; view(); await fill(); await userEvent.click(screen.getByRole('button', { name: 'Confirmar registro' })); await screen.findByRole('alert');
    expect(screen.getByLabelText('Cuerpo original')).toHaveValue(originalBody); expect(screen.getByLabelText('Asunto')).toHaveValue('  Asunto  original ');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar registro' })); await waitFor(() => expect(writes()).toHaveLength(2)); expect(new Headers(writes()[0]![1]?.headers).get('Idempotency-Key')).toBe(new Headers(writes()[1]![1]?.headers).get('Idempotency-Key'));
  });
  it('pendiente impide duplicar confirmación y revisión', async () => {
    mode = 'writing'; view(); await fill(); await userEvent.click(screen.getByRole('button', { name: 'Confirmar registro' })); expect(screen.getByRole('button', { name: 'Confirmar registro' })).toBeDisabled(); expect(screen.getByRole('button', { name: 'Revisar registro' })).toBeDisabled(); expect(writes()).toHaveLength(1);
  });
  it.each(['none', 'closed', 'restricted'])('%s no habilita registro y explica la condición', async condition => {
    if (condition === 'none') accounts = []; else if (condition === 'closed') row = { ...row, state: 'CLOSED' }; else restricted = true;
    view(); if (condition === 'none') await screen.findByText('No tienes una cuenta institucional habilitada para registrar comunicaciones.'); else if (condition === 'closed') await screen.findByText(/El proceso está cerrado/); else await screen.findByText('RESTRICCIÓN ACTIVA — NO CONTACTAR');
    expect(screen.queryByRole('button', { name: 'Confirmar registro' })).not.toBeInTheDocument(); expect(writes()).toHaveLength(0);
  });
  it.each(['pending', 'error'])('cuentas muestran %s y no ofrecen formulario', async state => {
    mode = state; view(); if (state === 'pending') expect(screen.getByRole('status')).toHaveTextContent('Cargando'); else expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar'); expect(screen.queryByLabelText('Cuenta remitente')).not.toBeInTheDocument();
  });
  it('listado vacío y paginación; acción contextual solo con capacidad y proceso abierto', async () => {
    listTotal = 30; view('/relationship-processes/' + id); await screen.findByRole('link', { name: 'Registrar comunicación enviada' }); const list = await screen.findByRole('region', { name: 'Comunicaciones registradas' }); await within(list).findByRole('link', { name: 'Asunto original' }); await userEvent.click(within(list).getByRole('button', { name: 'Siguiente' })); await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.includes('/communications?page=2'))).toBe(true));
  });
  it('permisos y limpieza de cache evitan exposición tras cambio de identidad', async () => {
    const prefix = communicationIdentityKey(identity); client.setQueryData([...prefix, 'detail', communicationId], communication()); await clearForbiddenCommunications(client, null); expect(client.getQueryData([...prefix, 'detail', communicationId])).toBeUndefined();
    identity = { ...identity, permissions: ['relationships.process.read'] }; client.setQueryData(AUTH_QUERY_KEY, identity); view(); expect(screen.getByRole('alert')).toHaveTextContent('No tienes permiso'); expect(fetchMock.mock.calls.some(([url]) => url.includes('/me/email-accounts'))).toBe(false);
  });
  it('listado vacío explica ausencia sin afirmar un envío', async () => { view('/relationship-processes/' + id); expect(await screen.findByText('No hay comunicaciones registradas en este proceso.')).toBeVisible(); });
  it('volver sin registrar conserva el borrador sin escribir', async () => { view(); await fill(); await userEvent.click(screen.getByRole('button', { name: 'Volver sin registrar' })); expect(screen.getByLabelText('Cuerpo original')).toHaveValue(originalBody); expect(screen.queryByRole('region', { name: 'Confirmar comunicación enviada' })).not.toBeInTheDocument(); expect(writes()).toHaveLength(0); });
});
