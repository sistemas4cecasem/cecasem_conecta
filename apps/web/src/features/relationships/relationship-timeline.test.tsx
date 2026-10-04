import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '../../lib/query/query-client';
import { AppRoutes } from '../../app/router/app-routes';
import { AUTH_QUERY_KEY, type AuthIdentity } from '../auth/session';
import { RelationshipTimeline } from './relationship-timeline';
import { clearForbiddenTimeline, timelineIdentityKey } from './timeline-queries';
import type { TimelineItem } from './timeline-contracts';
import type { ProcessDetail } from './process-contracts';
import { useSentCommunication, useReceivedCommunication } from '../communications/queries';
import { useProcessMutation } from './process-queries';
const id = '11111111-1111-4111-8111-111111111111', ownerId = '22222222-2222-4222-8222-222222222222', orgId = '33333333-3333-4333-8333-333333333333';
const at = '2000-10-01T12:00:00.000Z', user = { id: ownerId, displayName: 'Ana QA', isActive: true };
const identity: AuthIdentity = { id: ownerId, givenNames: 'Ana', familyNames: 'QA', username: 'ana', email: 'qa@example.test', role: 'PLANNING',
  permissions: ['relationships.process.read', 'communications.read', 'relationships.note.create', 'relationships.process.state.change', 'relationships.process.close', 'relationships.process.reopen', 'communications.sent.create', 'communications.received.create'] };
function event(kind: 'PROCESS_CREATED' | 'PROCESS_STATE_CHANGED' | 'PROCESS_CLOSED' | 'PROCESS_REOPENED' = 'PROCESS_CREATED'): TimelineItem {
  return { id, kind, occurredAt: at, registeredAt: at, actor: user, summary: 'Evento funcional', payload: { eventId: id, previousState: kind === 'PROCESS_CREATED' ? null : 'PREPARATION',
    newState: kind === 'PROCESS_CLOSED' ? 'CLOSED' : kind === 'PROCESS_CREATED' ? 'PREPARATION' : 'IN_PROGRESS', result: kind === 'PROCESS_CLOSED' ? 'REJECTED' : null, observation: kind === 'PROCESS_CREATED' ? null : 'Motivo histórico' } };
}
function mail(kind: 'SENT_COMMUNICATION' | 'RECEIVED_COMMUNICATION', itemId = id): TimelineItem {
  return { id: itemId, kind, occurredAt: '2000-10-02T12:00:00.000Z', registeredAt: '2026-10-04T12:00:00.000Z', actor: user, summary: 'Asunto original',
    payload: { validity: 'VALID', invalidation: null, communicationId: itemId, sender: 'Old@Example.test', subject: 'Asunto original', recipients: [{ type: 'TO', addressOriginal: 'Original@Example.test', position: 0 }, { type: 'CC', addressOriginal: 'Copia@Example.test', position: 0 }, { type: 'BCC', addressOriginal: 'Privada@Example.test', position: 0 }], recipientTotal: 3 } };
}
function note(body = 'Contexto interno'): TimelineItem { return { id: orgId, kind: 'INTERNAL_NOTE', occurredAt: '2000-10-05T12:00:00.000Z', registeredAt: '2000-10-05T12:00:00.000Z', actor: user, summary: 'Nota interna', payload: { noteId: orgId, body } }; }
function process(closed = false): ProcessDetail {
  return { id, purpose: 'Proceso QA', target: { id: orgId, kind: 'ORGANIZATION', label: 'Institución QA', isActive: true }, createdBy: user,
    createdAt: at, updatedAt: at, lastActivityAt: at, state: closed ? 'CLOSED' : 'PREPARATION', currentResult: closed ? 'REJECTED' : null,
    closureObservation: null, closedAt: closed ? at : null, closedBy: closed ? user : null, sourceIntentId: null, version: 1,
    canClose: false, canReopen: false, allowedStates: [], exceptionalAdministration: false, events: [], eventsTotal: 0, participants: [] };
}
describe('Conversación institucional y notas internas', () => {
  let client = createQueryClient(), items: TimelineItem[] = [], mode = 'ok', next: string | null = null, closed = false, noteFailure = false;
  const fetchMock = vi.fn<(url: string, options?: RequestInit) => Promise<Response>>();
  beforeEach(() => {
    client = createQueryClient(); items = []; mode = 'ok'; next = null; closed = false; noteFailure = false;
    client.setQueryDefaults(AUTH_QUERY_KEY, { staleTime: Infinity }); client.setQueryData(AUTH_QUERY_KEY, identity);
    fetchMock.mockReset(); fetchMock.mockImplementation((url, options) => {
      if (url.endsWith('/auth/me')) return Promise.resolve(Response.json(identity));
      if (url.includes('/timeline?')) {
        if (mode === 'pending') return new Promise<Response>(() => undefined);
        if (mode === 'error' || (mode === 'next-error' && url.includes('after='))) return Promise.resolve(new Response(null, { status: 500 }));
        return Promise.resolve(Response.json({ items: url.includes('after=') ? [note('Segunda página')] : items, nextCursor: url.includes('after=') ? null : next }));
      }
      if (url.endsWith('/notes') && options?.method === 'POST') {
        if (noteFailure) return Promise.resolve(new Response(null, { status: 500 }));
        const input = JSON.parse(String(options.body)) as { body: string }, created = note(input.body); items.push(created); return Promise.resolve(Response.json(created, { status: 201 }));
      }
      if (url.includes('/communications/') && options?.method === 'POST') {
        const direction = url.endsWith('/sent') ? 'SENT' : 'RECEIVED', item = mail(direction === 'SENT' ? 'SENT_COMMUNICATION' : 'RECEIVED_COMMUNICATION'); items.push(item);
        return Promise.resolve(Response.json({ id, processId: id, direction, subject: 'Asunto', sentAt: direction === 'SENT' ? at : null, receivedAt: direction === 'RECEIVED' ? at : null,
          occurredAt: at, createdAt: at, validity: 'VALID', version: 1, sender: 'externo@example.test', recipients: [], bodyOriginal: 'Cuerpo original completo', registeredBy: user,
          emailAccount: direction === 'SENT' ? { id, address: 'institucional@example.test', displayName: 'Buzón' } : null }, { status: 201 }));
      }
      if (options?.method === 'POST') { items.push(event(url.endsWith('/close') ? 'PROCESS_CLOSED' : url.endsWith('/reopen') ? 'PROCESS_REOPENED' : 'PROCESS_STATE_CHANGED')); return Promise.resolve(Response.json(process(), { status: 201 })); }
      if (url.endsWith('/relationship-processes/' + id)) return Promise.resolve(Response.json(process(closed)));
      if (url.includes('/communications?page=')) return Promise.resolve(Response.json({ items: [], total: 0, page: 1, pageSize: 25 }));
      return Promise.resolve(new Response(null, { status: 404 }));
    }); vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => { client.clear(); vi.unstubAllGlobals(); });
  const wrap = (content: React.ReactNode) => <QueryClientProvider client={client}><MemoryRouter>{content}</MemoryRouter></QueryClientProvider>;
  const panel = (actor = identity) => render(wrap(<RelationshipTimeline identity={actor} processId={id} />));
  const reads = () => fetchMock.mock.calls.filter(([url]) => url.includes('/timeline?'));
  it('vacío, sin insinuar contacto ni mensajería', async () => { panel(); expect(await screen.findByText('No hay hechos registrados en este historial.')).toBeVisible(); expect(screen.getByText(/no se envía al contacto/)).toBeVisible(); });
  it('loading', () => { mode = 'pending'; panel(); expect(screen.getByRole('status')).toHaveTextContent('Cargando historial'); });
  it('error permite reintentar', async () => { mode = 'error'; panel(); await screen.findByText('No se pudo cargar el historial.'); mode = 'ok'; await userEvent.click(screen.getByRole('button', { name: 'Reintentar historial' })); expect(await screen.findByText('No hay hechos registrados en este historial.')).toBeVisible(); });
  it.each(['SENT_COMMUNICATION', 'RECEIVED_COMMUNICATION'] as const)('%s conserva snapshots, fecha real, registrador y enlace sin cuerpo', async kind => {
    items = [mail(kind)]; panel(); const entry = await screen.findByRole('listitem');
    expect(within(entry).getByRole('heading', { name: kind === 'SENT_COMMUNICATION' ? 'ENVIADA' : 'RECIBIDA' })).toBeVisible();
    expect(entry).toHaveTextContent('Remitente: Old@Example.test'); expect(entry).toHaveTextContent('CCO: Privada@Example.test'); expect(entry).toHaveTextContent('Registrador: Ana QA');
    expect(within(entry).getByText(/Fecha del hecho:/)).toHaveTextContent(new Date(items[0]!.occurredAt).toLocaleString('es-BO'));
    expect(within(entry).getByRole('link', { name: 'Ver detalle de comunicación' })).toHaveAttribute('href', '/communications/' + id); expect(entry).not.toHaveTextContent('Cuerpo original completo');
  });
  it.each(['PROCESS_CREATED', 'PROCESS_STATE_CHANGED', 'PROCESS_CLOSED', 'PROCESS_REOPENED'] as const)('%s muestra cambios funcionales y conserva cierre', async kind => {
    items = [event(kind)]; panel(); const entry = await screen.findByRole('listitem'); expect(entry).toHaveTextContent('Autor: Ana QA');
    if (kind === 'PROCESS_CLOSED') expect(entry).toHaveTextContent('Resultado histórico: No aceptado');
    if (kind === 'PROCESS_REOPENED') expect(entry).toHaveTextContent('Proceso reabierto');
    if (kind !== 'PROCESS_CREATED') expect(entry).toHaveTextContent('Motivo histórico');
  });
  it('orden cronológico unificado recibido/enviado/nota/evento', async () => {
    items = [event(), mail('SENT_COMMUNICATION'), event('PROCESS_CLOSED'), mail('RECEIVED_COMMUNICATION', ownerId), note(), event('PROCESS_REOPENED')]; panel();
    await screen.findByText('NOTA INTERNA'); expect(screen.getAllByRole('listitem').map(item => within(item).getByRole('heading').textContent)).toEqual(['Proceso iniciado', 'ENVIADA', 'Proceso cerrado', 'RECIBIDA', 'NOTA INTERNA', 'Proceso reabierto']);
  });
  it('nota se presenta como contexto interno y escapa HTML', async () => {
    items = [note('<script>literal</script>\nContexto')]; panel(); const entry = await screen.findByRole('listitem');
    expect(entry).toHaveTextContent('NOTA INTERNA'); expect(entry).toHaveTextContent('no es una comunicación enviada ni recibida'); expect(entry.querySelector('script')).toBeNull(); expect(entry).not.toHaveTextContent('Destinatarios');
  });
  it('cargar más usa cursor sin sustituir los hechos anteriores', async () => {
    items = [event()]; next = 'cursor-opaco'; panel(); await screen.findByText('Proceso iniciado'); await userEvent.click(screen.getByRole('button', { name: 'Cargar más historial' }));
    await screen.findByText('Segunda página'); expect(screen.getAllByRole('listitem')).toHaveLength(2); expect(reads().at(-1)?.[0]).toContain('after=cursor-opaco'); expect(screen.queryByRole('button', { name: 'Cargar más historial' })).not.toBeInTheDocument();
  });
  it('error de página siguiente mantiene historial y reintenta cursor', async () => {
    items = [event()]; next = 'cursor'; mode = 'next-error'; panel(); await screen.findByText('Proceso iniciado'); await userEvent.click(screen.getByRole('button', { name: 'Cargar más historial' }));
    await screen.findByText('No se pudo cargar el historial.'); expect(screen.getByText('Proceso iniciado')).toBeVisible(); mode = 'ok'; await userEvent.click(screen.getByRole('button', { name: 'Reintentar historial' })); expect(await screen.findByText('Segunda página')).toBeVisible();
  });
  it.each([false, true])('no participante agrega nota en cerrado=%s, sigue sin permiso contextual de cierre', async isClosed => {
    closed = isClosed; items = [event(isClosed ? 'PROCESS_CLOSED' : 'PROCESS_CREATED')];
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/relationship-processes/' + id]}><AppRoutes /></MemoryRouter></QueryClientProvider>);
    await screen.findByRole('textbox', { name: 'Contenido de la nota interna' }); expect(screen.queryByRole('button', { name: 'Cerrar proceso' })).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Contenido de la nota interna'), 'Contexto sin actuación externa'); await userEvent.click(screen.getByRole('button', { name: 'Guardar nota interna' }));
    expect(await screen.findByText('Contexto sin actuación externa')).toBeVisible(); expect(screen.getByRole('region', { name: 'Participantes' })).not.toHaveTextContent('Ana QA'); expect(screen.queryByRole('button', { name: 'Cerrar proceso' })).not.toBeInTheDocument();
    if (closed) expect(screen.queryByRole('link', { name: 'Registrar comunicación enviada' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Contenido de la nota interna')).toHaveValue(''); expect(reads().length).toBeGreaterThan(1);
  });
  it('nota vacía no envía y error conserva borrador', async () => {
    panel(); await screen.findByText('No hay hechos registrados en este historial.'); await userEvent.click(screen.getByRole('button', { name: 'Guardar nota interna' })); expect(await screen.findByText('Incluye el contexto interno.')).toBeVisible();
    expect(fetchMock.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false); noteFailure = true;
    await userEvent.type(screen.getByLabelText('Contenido de la nota interna'), 'Borrador interno'); await userEvent.click(screen.getByRole('button', { name: 'Guardar nota interna' }));
    await screen.findByRole('alert'); expect(screen.getByLabelText('Contenido de la nota interna')).toHaveValue('Borrador interno');
  });
  function Mutate({ kind }: { kind: string }) {
    const sent = useSentCommunication(identity), received = useReceivedCommunication(identity), mutation = useProcessMutation(identity);
    return <button onClick={() => {
      const shared = { to: ['qa@example.test'], cc: [], bcc: [], subject: 'Asunto', body: 'Original' };
      const operation = kind === 'sent' ? sent.mutateAsync({ processId: id, requestKey: id, body: { ...shared, emailAccountId: id, sentAt: at } })
        : kind === 'received' ? received.mutateAsync({ processId: id, requestKey: id, body: { ...shared, sender: 'externo@example.test', receivedAt: at } })
          : mutation.mutateAsync({ path: 'relationship-processes/' + id + '/' + kind, body: {} });
      void operation.catch(() => undefined);
    }}>Registrar actuación</button>;
  }
  it.each(['sent', 'received', 'state', 'close', 'reopen'])('%s invalida timeline tras nueva actuación', async kind => {
    render(wrap(<><RelationshipTimeline identity={identity} processId={id} /><Mutate kind={kind} /></>)); await screen.findByText('No hay hechos registrados en este historial.');
    await userEvent.click(screen.getByRole('button', { name: 'Registrar actuación' })); await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1)); expect(reads().length).toBeGreaterThan(1);
  });
  it('sin capabilities no consulta ni permite agregar', () => {
    panel({ ...identity, permissions: ['relationships.process.read'] }); expect(reads()).toHaveLength(0); expect(screen.queryByLabelText('Contenido de la nota interna')).not.toBeInTheDocument();
  });
  it('lectura sin capability de escritura mantiene historial y omite formulario', async () => {
    panel({ ...identity, permissions: ['relationships.process.read', 'communications.read'] }); await screen.findByText('No hay hechos registrados en este historial.'); expect(screen.queryByLabelText('Contenido de la nota interna')).not.toBeInTheDocument();
  });
  it.each(['logout', 'role', 'permission'])('%s elimina caché del timeline', async change => {
    client.setQueryData([...timelineIdentityKey(identity), id], { pages: [{ items: [note()], nextCursor: null }], pageParams: [null] });
    const current = change === 'logout' ? null : { ...identity, ...(change === 'role' ? { role: 'BOARD' as const } : { permissions: ['relationships.process.read'] }) };
    await clearForbiddenTimeline(client, current); expect(client.getQueryCache().findAll({ queryKey: ['relationship-timeline'] })).toHaveLength(0);
  });
  it('respuesta tardía tras retirar identidad no repuebla caché', async () => {
    let finish!: (value: Response) => void; fetchMock.mockImplementation(() => new Promise(resolve => { finish = resolve; })); const view = panel();
    await waitFor(() => expect(reads()).toHaveLength(1)); view.unmount(); await clearForbiddenTimeline(client, null);
    await act(async () => finish(Response.json({ items: [note()], nextCursor: null }))); expect(client.getQueryCache().findAll({ queryKey: ['relationship-timeline'] })).toHaveLength(0);
  });
});
