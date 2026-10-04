import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../../app/router/app-routes';
import { createQueryClient } from '../../lib/query/query-client';
import { AUTH_QUERY_KEY, type AuthIdentity } from '../auth/session';
import { clearForbiddenCommunications, communicationIdentityKey } from './queries';
import { addresses, receivedBody, receivedFormSchema } from './contracts';
import type { ProcessDetail } from '../relationships/process-contracts';
const id = '11111111-1111-4111-8111-111111111111', goal = '22222222-2222-4222-8222-222222222222', ownerId = '33333333-3333-4333-8333-333333333333';
const permissions = ['directory.read', 'communications.read', 'communications.sent.create', 'communications.received.create', 'relationships.intent.read', 'relationships.restriction.read', 'relationships.process.read', 'relationships.process.create', 'relationships.process.state.change', 'relationships.process.close', 'relationships.process.reopen'];
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
const communication = () => ({ id: communicationId, processId: id, direction: 'RECEIVED', validity: 'VALID', version: 1, emailAccount: null, sender: 'Fundacion@Example.test', subject: '  Asunto  original ', bodyOriginal: originalBody, sentAt: null, receivedAt: '2000-01-01T12:00:00.000Z', occurredAt: '2000-01-01T12:00:00.000Z', createdAt: timestamp, registeredBy: user,
  recipients: [{ type: 'TO', addressOriginal: 'Nueva@Example.test', normalizedAddress: 'nueva@example.test', position: 0, emailAccount: { id: account.id, displayName: account.displayName } }, { type: 'CC', addressOriginal: 'copia@example.test', normalizedAddress: 'copia@example.test', position: 0 }, { type: 'BCC', addressOriginal: 'privada@example.test', normalizedAddress: 'privada@example.test', position: 0 }] });
describe('Registro manual recibido', () => {
  let client = createQueryClient(), identity = initialIdentity, row = process(), restricted = false, failure = 0, pending = false;
  const fetchMock = vi.fn<(url: string, options?: RequestInit) => Promise<Response>>();
  beforeEach(() => {
    client = createQueryClient(); identity = initialIdentity; row = process(); restricted = false; failure = 0; pending = false;
    client.setQueryDefaults(AUTH_QUERY_KEY, { staleTime: Infinity }); client.setQueryData(AUTH_QUERY_KEY, identity);
    fetchMock.mockReset(); fetchMock.mockImplementation((url, options) => {
      if (url.endsWith('/auth/me')) return Promise.resolve(Response.json(identity));
      if (options?.method === 'POST') {
        if (failure) return Promise.resolve(Response.json({ code: 'FORBIDDEN' }, { status: failure })); if (pending) return new Promise<Response>(() => undefined);
        if (url.endsWith('/reopen')) { row = { ...row, state: 'IN_PROGRESS', version: row.version + 1, canReopen: false, canClose: true, closedAt: null, closedBy: null, currentResult: null, closureObservation: null }; return Promise.resolve(Response.json(row, { status: 201 })); }
        row = { ...row, version: row.version + 1, canReopen: row.state === 'CLOSED', participants: [...row.participants, { user: { ...user, id: goal, displayName: 'Registrador de respuesta' }, joinedAt: timestamp, origin: 'RECEIVED_COMMUNICATION' }] };
        return Promise.resolve(Response.json(communication(), { status: 201 }));
      }
      if (url.includes('/relationship-context?')) return Promise.resolve(Response.json({ target: row.target, restriction: restricted ? { id: goal, reason: 'Solicitud expresa', createdAt: timestamp } : null, contactAllowed: !restricted, activeIntents: { items: [], total: 0 }, activeProcesses: { items: [], total: 0 }, recentClosedProcesses: { items: [], total: 0 }, relatedOrganizationContext: { items: [], total: 0 }, hasRelationshipHistory: false, hasRegisteredCommunicationHistory: false, communicationSummary: { total: 0, lastOccurredAt: null, lastDirection: null }, recentCommunications: [] }));
      if (url.endsWith('/communications/' + communicationId)) return Promise.resolve(Response.json(communication()));
      if (url.includes('/communications?page=')) return Promise.resolve(Response.json({ items: [communication()], total: 1, page: 1, pageSize: 25 }));
      if (url.endsWith('/relationship-processes/' + id)) return Promise.resolve(Response.json(row));
      return Promise.resolve(new Response(null, { status: 404 }));
    }); vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => { client.clear(); vi.unstubAllGlobals(); });
  function view(path = '/relationship-processes/' + id + '/communications/received') { return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter></QueryClientProvider>); }
  const writes = () => fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST');
  async function fill() {
    await userEvent.type(await screen.findByLabelText('Remitente externo'), 'Fundacion@Example.test'); await userEvent.type(screen.getByLabelText('Para'), 'Nueva@Example.test;institucional@example.test'); await userEvent.type(screen.getByLabelText('CC'), 'copia@example.test'); await userEvent.type(screen.getByLabelText('CCO'), 'privada@example.test');
    await userEvent.type(screen.getByLabelText('Asunto'), '  Asunto  original '); await userEvent.type(screen.getByLabelText('Cuerpo original'), originalBody); await userEvent.type(screen.getByLabelText('Fecha y hora real de recepción'), '2000-01-01T12:00');
    await userEvent.click(screen.getByRole('button', { name: 'Revisar registro' })); await screen.findByRole('region', { name: 'Confirmar comunicación recibida' });
  }
  it('contrato preserva originales y admite múltiples destinatarios observados', () => {
    expect(addresses('A@example.test; B@example.test\nA@example.test')).toEqual(['A@example.test', 'B@example.test', 'A@example.test']);
    const values = { sender: 'Fundacion@Example.test', to: 'Nueva@Example.test', cc: '', bcc: '', subject: '  Original ', body: originalBody, receivedAt: '2000-01-01T12:00' }; expect(receivedBody(receivedFormSchema.parse(values))).toMatchObject({ sender: values.sender, body: originalBody, subject: values.subject, cc: [], bcc: [] });
    for (const patch of [{ sender: 'bad' }, { to: '' }, { receivedAt: '2999-01-01T12:00' }]) expect(receivedFormSchema.safeParse({ ...values, ...patch }).success).toBe(false);
  });
  it.each(['ADMINISTRATOR', 'BOARD', 'RESEARCH', 'PLANNING'] as const)('%s registra sin selector ni consulta de buzones asignados', async role => {
    identity = { ...identity, role }; client.setQueryData(AUTH_QUERY_KEY, identity); view(); await screen.findByLabelText('Remitente externo'); expect(screen.queryByLabelText('Cuenta remitente')).not.toBeInTheDocument(); expect(fetchMock.mock.calls.some(([url]) => url.includes('/me/email-accounts'))).toBe(false);
  });
  it('valida campos antes de confirmar', async () => { view(); await screen.findByLabelText('Remitente externo'); await userEvent.click(screen.getByRole('button', { name: 'Revisar registro' })); expect(await screen.findByText('Indica un remitente externo válido.')).toBeVisible(); expect(screen.getByText('Incluye al menos un destinatario Para.')).toBeVisible(); expect(writes()).toHaveLength(0); });
  it('confirma payload recibido, conserva texto literal y actualiza participantes', async () => {
    const rendered = view(); await fill(); expect(writes()).toHaveLength(0); expect(within(screen.getByRole('region', { name: 'Confirmar comunicación recibida' })).getByText('CCO: privada@example.test')).toBeVisible(); await userEvent.click(screen.getByRole('button', { name: 'Confirmar registro' })); await screen.findByRole('heading', { name: 'Comunicación recibida registrada' });
    const options = writes()[0]![1]!; expect(JSON.parse(String(options.body))).toEqual({ sender: 'Fundacion@Example.test', to: ['Nueva@Example.test', 'institucional@example.test'], cc: ['copia@example.test'], bcc: ['privada@example.test'], subject: '  Asunto  original ', body: originalBody, receivedAt: new Date('2000-01-01T12:00').toISOString() }); expect(new Headers(options.headers).get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/);
    expect(rendered.container.querySelector('pre')?.textContent).toBe(originalBody); expect(rendered.container.querySelector('script')).toBeNull(); expect(screen.getByText('Remitente: Fundacion@Example.test')).toBeVisible(); expect(screen.getByText('Registrada por: Ana Prueba')).toBeVisible();
    await userEvent.click(screen.getByRole('link', { name: 'Volver al proceso' })); const participants = await screen.findByRole('region', { name: 'Participantes' }); expect(participants).toHaveTextContent('Registrador de respuesta'); expect(participants).toHaveTextContent('Comunicación recibida');
  });
  it('proceso cerrado advierte, registra y ofrece reapertura mediante flujo existente', async () => {
    row = { ...row, state: 'CLOSED', canClose: false, canReopen: false, currentResult: 'REJECTED', closedAt: timestamp, closedBy: user, allowedStates: [] }; view(); await screen.findByText(/Esta comunicación se registrará como respuesta recibida en un proceso cerrado/); await fill(); await userEvent.click(screen.getByRole('button', { name: 'Confirmar registro' })); await screen.findByRole('heading', { name: 'Comunicación recibida registrada' }); expect(writes()).toHaveLength(1); expect(row.state).toBe('CLOSED');
    await userEvent.click(await screen.findByRole('link', { name: 'Reabrir proceso' })); await screen.findByRole('button', { name: 'Confirmar reapertura' }); await userEvent.selectOptions(screen.getByLabelText('Estado de destino'), 'IN_PROGRESS'); await userEvent.type(screen.getByLabelText('Motivo de reapertura'), 'Respuesta tardía del mismo acercamiento'); await userEvent.click(screen.getByRole('button', { name: 'Confirmar reapertura' })); await waitFor(() => expect(writes()).toHaveLength(2)); expect(writes()[1]![0]).toContain('/reopen');
  });
  it('restricción activa se advierte y no impide registrar una entrada', async () => { restricted = true; view(); await screen.findByText('RESTRICCIÓN ACTIVA — NO CONTACTAR'); await fill(); await userEvent.click(screen.getByRole('button', { name: 'Confirmar registro' })); await screen.findByRole('heading', { name: 'Comunicación recibida registrada' }); expect(restricted).toBe(true); });
  it.each([403, 409])('error %s conserva borrador y clave para reintento', async status => { failure = status; view(); await fill(); await userEvent.click(screen.getByRole('button', { name: 'Confirmar registro' })); await screen.findByRole('alert'); expect(screen.getByLabelText('Cuerpo original')).toHaveValue(originalBody); expect(screen.getByLabelText('Remitente externo')).toHaveValue('Fundacion@Example.test'); await userEvent.click(screen.getByRole('button', { name: 'Confirmar registro' })); await waitFor(() => expect(writes()).toHaveLength(2)); expect(new Headers(writes()[0]![1]?.headers).get('Idempotency-Key')).toBe(new Headers(writes()[1]![1]?.headers).get('Idempotency-Key')); });
  it('pendiente evita doble confirmación', async () => { pending = true; view(); await fill(); await userEvent.click(screen.getByRole('button', { name: 'Confirmar registro' })); expect(screen.getByRole('button', { name: 'Confirmar registro' })).toBeDisabled(); expect(screen.getByRole('button', { name: 'Revisar registro' })).toBeDisabled(); expect(writes()).toHaveLength(1); });
  it('capacidad ausente bloquea formulario y elimina cache previa', async () => { const prefix = communicationIdentityKey(identity); client.setQueryData([...prefix, 'detail', communicationId], communication()); await clearForbiddenCommunications(client, null); expect(client.getQueryData([...prefix, 'detail', communicationId])).toBeUndefined(); identity = { ...identity, permissions: ['relationships.process.read'] }; client.setQueryData(AUTH_QUERY_KEY, identity); view(); expect(screen.getByRole('alert')).toHaveTextContent('No tienes permiso'); });
  it('acción recibida sigue disponible en proceso cerrado y listado distingue dirección', async () => { row = { ...row, state: 'CLOSED' }; view('/relationship-processes/' + id); await screen.findByRole('link', { name: 'Registrar comunicación recibida' }); expect(screen.queryByRole('link', { name: 'Registrar comunicación enviada' })).not.toBeInTheDocument(); const list = await screen.findByRole('region', { name: 'Comunicaciones registradas' }); expect(list).toHaveTextContent('Recibida:'); });
});
