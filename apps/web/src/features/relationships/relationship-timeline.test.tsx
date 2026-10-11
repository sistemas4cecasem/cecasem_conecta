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
function event(kind: 'PROCESS_CREATED' | 'PROCESS_STATE_CHANGED' | 'PROCESS_CLOSED' | 'PROCESS_REOPENED' = 'PROCESS_CREATED'): Extract<TimelineItem, { kind: 'PROCESS_CREATED' | 'PROCESS_STATE_CHANGED' | 'PROCESS_CLOSED' | 'PROCESS_REOPENED' }> {
  return { id, kind, occurredAt: at, registeredAt: at, actor: user, summary: 'Evento funcional', payload: { authority: 'PARTICIPANT', eventId: id, previousState: kind === 'PROCESS_CREATED' ? null : 'PREPARATION',
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
      if (url.endsWith('/communications/' + id)) {
        if (mode === 'body-pending') return new Promise<Response>(() => undefined);
        if (mode === 'body-error') return Promise.resolve(new Response(null, { status: 500 }));
        return Promise.resolve(Response.json({ id, processId: id, direction: 'RECEIVED', subject: 'Asunto original', sentAt: null, receivedAt: at,
          occurredAt: at, createdAt: at, validity: 'VALID', version: 1, sender: 'Old@Example.test', recipients: [],
          bodyOriginal: '<script>literal</script>\n\n\n' + 'Contenido original extenso. '.repeat(1000) + '\n' + 'cadena'.repeat(500), registeredBy: user, emailAccount: null }));
      }
      if (url.includes('/communications?page=')) return Promise.resolve(Response.json({ items: [], total: 0, page: 1, pageSize: 25 }));
      return Promise.resolve(new Response(null, { status: 404 }));
    }); vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => { client.clear(); vi.unstubAllGlobals(); });
  const wrap = (content: React.ReactNode) => <QueryClientProvider client={client}><MemoryRouter>{content}</MemoryRouter></QueryClientProvider>;
  const panel = (actor = identity) => render(wrap(<RelationshipTimeline identity={actor} processId={id} />));
  const reads = () => fetchMock.mock.calls.filter(([url]) => url.includes('/timeline?'));
  it('consulta el cuerpo solo al expandir, conserva texto literal y reutiliza el detalle al contraer', async () => {
    items = [mail('RECEIVED_COMMUNICATION')]; panel(); await screen.findByText('Asunto original');
    const bodies = () => fetchMock.mock.calls.filter(([url]) => url.endsWith('/communications/' + id));
    expect(bodies()).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: 'Consultar contenido' }));
    await screen.findByText('Cuerpo original registrado');
    const body = document.querySelector('.process-original-body pre');
    expect(body?.textContent).toBe('<script>literal</script>\n\n\n' + 'Contenido original extenso. '.repeat(1000) + '\n' + 'cadena'.repeat(500));
    expect(body?.querySelector('script')).toBeNull(); expect(bodies()).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Contraer contenido' }));
    expect(screen.queryByText('Cuerpo original registrado')).not.toBeInTheDocument();
    expect(document.querySelector('.process-body-excerpt')).toHaveTextContent('Contenido original extenso.');
    expect(document.querySelector('.process-body-excerpt')?.textContent).not.toContain('\n');
    expect(document.querySelector('.process-body-excerpt')?.textContent?.length).toBeLessThanOrEqual(241);
    await userEvent.click(screen.getByRole('button', { name: 'Consultar contenido' }));
    expect(screen.getByText('Cuerpo original registrado')).toBeVisible(); expect(bodies()).toHaveLength(2);
  });
  it('cuerpo bajo demanda muestra carga y permite contraer durante la consulta', async () => {
    items = [mail('RECEIVED_COMMUNICATION')]; panel(); await screen.findByText('Asunto original'); mode = 'body-pending';
    await userEvent.click(screen.getByRole('button', { name: 'Consultar contenido' }));
    expect(screen.getByRole('status')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Contraer contenido' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
  it('error del cuerpo se reintenta sin perder el resumen ni navegar', async () => {
    items = [mail('RECEIVED_COMMUNICATION')]; panel(); await screen.findByText('Asunto original'); mode = 'body-error';
    await userEvent.click(screen.getByRole('button', { name: 'Consultar contenido' })); await screen.findByRole('alert');
    expect(screen.getByText('Asunto original')).toBeVisible(); mode = 'ok';
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Cuerpo original registrado')).toBeVisible();
  });
  it.each(['BOARD', 'ADMINISTRATOR'] as const)('autoridad %s conserva transición, motivo y resultado en un único evento', async authority => {
    const original = event('PROCESS_CLOSED');
    if (!('eventId' in original.payload)) throw new Error('Fixture administrativa inválida');
    items = [{ ...original, payload: { ...original.payload, authority } }]; panel();
    const entry = await screen.findByRole('listitem');
    expect(entry).toHaveTextContent(authority === 'BOARD' ? 'Intervención de Directorio' : 'Intervención excepcional de Administración');
    expect(entry).toHaveTextContent('En preparación → Cerrado'); expect(entry).toHaveTextContent('Motivo histórico');
    expect(entry).toHaveTextContent('Resultado histórico: No aceptado');
  });
  it('archivos conservan nombres y acceso al índice privado del proceso', async () => {
    items = [{ id, kind: 'FILES_ATTACHED', occurredAt: at, registeredAt: at, actor: user, summary: 'Adjuntos incorporados',
      payload: { uploadId: id, communicationId: null, names: ['Acuerdo.pdf', 'Informe.xlsx'] } }]; panel();
    const entry = await screen.findByRole('listitem'); expect(entry).toHaveTextContent('Acuerdo.pdf · Informe.xlsx');
    expect(within(entry).getByRole('link', { name: 'Consultar adjuntos' })).toHaveAttribute('href', expect.stringContaining('#adjuntos'));
  });
  it('UI 2.7 diferencia fecha del hecho y registro en comunicaciones y notas', async () => {
    items = [mail('SENT_COMMUNICATION'), note()]; panel(); const entries = await screen.findAllByRole('listitem');
    for (const [index, entry] of entries.entries()) { const times = entry.querySelectorAll('time'); expect(times).toHaveLength(index === 0 ? 2 : 1); expect(times[0]).toHaveAttribute('datetime', items[index]!.occurredAt); if (index === 0) expect(times[1]).toHaveAttribute('datetime', items[index]!.registeredAt); }
    expect(entries[1]).toHaveTextContent('Contexto interno; no es una comunicación enviada ni recibida.');
  });
  it('UI 2.7 nota inválida mantiene asociación accesible y no registra una actuación', async () => {
    panel(); await screen.findByText('No hay hechos registrados en este historial.'); await userEvent.click(screen.getByRole('button', { name: 'Añadir nota interna' })); await userEvent.click(screen.getByRole('button', { name: 'Guardar nota interna' }));
    expect(screen.getByLabelText('Contenido de la nota interna')).toHaveAttribute('aria-invalid', 'true'); expect(screen.getByLabelText('Contenido de la nota interna')).toHaveAttribute('aria-describedby'); expect(fetchMock.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false);
  });
  it('vacío, sin insinuar contacto ni mensajería', async () => { panel(); expect(await screen.findByText('No hay hechos registrados en este historial.')).toBeVisible(); expect(screen.getByText(/Las comunicaciones son registros manuales/)).toBeVisible(); });
  it('loading', () => { mode = 'pending'; panel(); expect(screen.getByRole('status')).toHaveTextContent('Cargando historial'); });
  it('error permite reintentar', async () => { mode = 'error'; panel(); await screen.findByText('No se pudo cargar el historial.'); mode = 'ok'; await userEvent.click(screen.getByRole('button', { name: 'Reintentar historial' })); expect(await screen.findByText('No hay hechos registrados en este historial.')).toBeVisible(); });
  it('muestra eventos de reunión con el snapshot histórico parcial sin inventar datos ausentes', async () => {
    items = [{ id: orgId, kind: 'MEETING_ACTIVITY', occurredAt: at, registeredAt: at, actor: user, summary: 'Actuación de reunión',
      payload: { meetingId: id, type: 'CREATED', snapshot: { status: 'SCHEDULED', purpose: 'Reunión histórica', scheduledAt: at }, changes: { type: 'CREATED' } } }];
    panel();
    const entry = await screen.findByRole('listitem');
    expect(entry).toHaveTextContent('Reunión histórica');
    expect(entry).toHaveTextContent('Fecha programada registrada:');
    expect(entry).toHaveTextContent('UTC');
    expect(within(entry).getByRole('link', { name: 'Ver reunión' })).toHaveAttribute('href', '/meetings/' + id);
    expect(screen.queryByText('No se pudo cargar el historial.')).not.toBeInTheDocument();
    expect(entry).not.toHaveTextContent('participantes');
  });
  it('conserva el detalle de los eventos de reunión con snapshot completo', async () => {
    items = [{ id: orgId, kind: 'MEETING_ACTIVITY', occurredAt: at, registeredAt: at, actor: user, summary: 'Actuación de reunión',
      payload: { meetingId: id, type: 'CREATED', snapshot: { purpose: 'Reunión completa', scheduledAt: at, timezone: 'America/La_Paz', modality: 'ONLINE', meetingUrl: null, location: null, participantCount: 2, opportunity: null }, changes: {} } }];
    panel();
    const entry = await screen.findByRole('listitem');
    expect(entry).toHaveTextContent('Reunión completa');
    expect(entry).toHaveTextContent('En línea · 2 participantes');
    expect(entry).not.toHaveTextContent('Fecha programada registrada:');
  });
  it.each(['SENT_COMMUNICATION', 'RECEIVED_COMMUNICATION'] as const)('%s conserva snapshots, fecha real, registrador y enlace sin cuerpo', async kind => {
    items = [mail(kind)]; panel(); const entry = await screen.findByRole('listitem');
    expect(within(entry).getByRole('heading', { name: kind === 'SENT_COMMUNICATION' ? 'Comunicación enviada' : 'Comunicación recibida' })).toBeVisible();
    expect(entry).toHaveTextContent('Remitente: Old@Example.test'); expect(entry).toHaveTextContent('CCO: Privada@Example.test'); expect(entry).toHaveTextContent('Registrador: Ana QA');
    expect(within(entry).getByText(/Fecha efectiva/)).toHaveTextContent(new Date(items[0]!.occurredAt).toLocaleString('es-BO'));
    expect(within(entry).getByRole('link', { name: 'Ver detalle de comunicación' })).toHaveAttribute('href', '/communications/' + id); expect(entry).not.toHaveTextContent('Cuerpo original completo');
  });
  it.each(['PROCESS_CREATED', 'PROCESS_STATE_CHANGED', 'PROCESS_CLOSED', 'PROCESS_REOPENED'] as const)('%s muestra cambios funcionales y conserva cierre', async kind => {
    items = [event(kind)]; panel(); const entry = await screen.findByRole('listitem'); expect(entry).toHaveTextContent('Autor: Ana QA');
    if (kind === 'PROCESS_CLOSED') expect(entry).toHaveTextContent('Resultado histórico: No aceptado');
    if (kind === 'PROCESS_REOPENED') expect(entry).toHaveTextContent('Proceso reabierto');
    if (kind !== 'PROCESS_CREATED') expect(entry).toHaveTextContent('Motivo histórico');
  });
  it('solicita orden descendente global y conserva el orden del servidor entre fuentes', async () => {
    items = [{ ...event('PROCESS_REOPENED'), occurredAt: '2000-10-06T12:00:00.000Z', registeredAt: '2000-10-06T12:00:00.000Z' }, note(),
      { ...event('PROCESS_CLOSED'), occurredAt: '2000-10-04T12:00:00.000Z', registeredAt: '2000-10-04T12:00:00.000Z' }, mail('RECEIVED_COMMUNICATION', ownerId), mail('SENT_COMMUNICATION'), event()]; panel();
    await screen.findByText('Nota interna'); expect(screen.getAllByRole('listitem').map(item => within(item).getByRole('heading').textContent)).toEqual(['Proceso reabierto', 'Nota interna', 'Proceso cerrado', 'Comunicación recibida', 'Comunicación enviada', 'Proceso iniciado']);
    expect(reads()[0]?.[0]).toContain('order=desc');
  });
  it('nota se presenta como contexto interno y escapa HTML', async () => {
    items = [note('<script>literal</script>\nContexto')]; panel(); const entry = await screen.findByRole('listitem');
    expect(entry).toHaveTextContent('Nota interna'); expect(entry).toHaveTextContent('no es una comunicación enviada ni recibida'); expect(entry.querySelector('script')).toBeNull(); expect(entry).not.toHaveTextContent('Destinatarios');
  });
  it('cargar más usa cursor sin sustituir los hechos anteriores', async () => {
    items = [event()]; next = 'cursor-opaco'; panel(); await screen.findByText('Proceso iniciado'); await userEvent.click(screen.getByRole('button', { name: 'Cargar acontecimientos anteriores' }));
    await screen.findByText('Segunda página'); expect(screen.getAllByRole('listitem')).toHaveLength(2); expect(reads().at(-1)?.[0]).toContain('after=cursor-opaco'); expect(screen.queryByRole('button', { name: 'Cargar acontecimientos anteriores' })).not.toBeInTheDocument();
  });
  it('error de página siguiente mantiene historial y reintenta cursor', async () => {
    items = [event()]; next = 'cursor'; mode = 'next-error'; panel(); await screen.findByText('Proceso iniciado'); await userEvent.click(screen.getByRole('button', { name: 'Cargar acontecimientos anteriores' }));
    await screen.findByText('No se pudo cargar el historial.'); expect(screen.getByText('Proceso iniciado')).toBeVisible(); mode = 'ok'; await userEvent.click(screen.getByRole('button', { name: 'Reintentar historial' })); expect(await screen.findByText('Segunda página')).toBeVisible();
  });
  it.each([false, true])('no participante agrega nota en cerrado=%s, sigue sin permiso contextual de cierre', async isClosed => {
    closed = isClosed; items = [event(isClosed ? 'PROCESS_CLOSED' : 'PROCESS_CREATED')];
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/relationship-processes/' + id]}><AppRoutes /></MemoryRouter></QueryClientProvider>);
    await userEvent.click(await screen.findByRole('button', { name: 'Añadir nota interna' })); await screen.findByRole('textbox', { name: 'Contenido de la nota interna' }); expect(screen.queryByRole('button', { name: 'Cerrar proceso' })).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Contenido de la nota interna'), 'Contexto sin actuación externa'); await userEvent.click(screen.getByRole('button', { name: 'Guardar nota interna' }));
    expect(await screen.findByText('Contexto sin actuación externa')).toBeVisible(); expect(screen.getByRole('region', { name: 'Participantes' })).not.toHaveTextContent('Ana QA'); expect(screen.queryByRole('button', { name: 'Cerrar proceso' })).not.toBeInTheDocument();
    if (closed) expect(screen.queryByRole('link', { name: 'Registrar comunicación enviada' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Contenido de la nota interna')).toHaveValue(''); expect(reads().length).toBeGreaterThan(1);
  });
  it('nota vacía no envía y error conserva borrador', async () => {
    panel(); await screen.findByText('No hay hechos registrados en este historial.'); await userEvent.click(screen.getByRole('button', { name: 'Añadir nota interna' })); await userEvent.click(screen.getByRole('button', { name: 'Guardar nota interna' })); expect(await screen.findByText('Incluye el contexto interno.')).toBeVisible();
    expect(fetchMock.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false); noteFailure = true;
    await userEvent.type(screen.getByLabelText('Contenido de la nota interna'), 'Borrador interno'); await userEvent.click(screen.getByRole('button', { name: 'Guardar nota interna' }));
    await screen.findByRole('alert'); expect(screen.getByLabelText('Contenido de la nota interna')).toHaveValue('Borrador interno');
  });
  it('plegar el formulario conserva el borrador de nota sin registrar ni enviar', async () => {
    panel(); await screen.findByText('No hay hechos registrados en este historial.');
    await userEvent.click(screen.getByRole('button', { name: 'Añadir nota interna' }));
    await userEvent.type(screen.getByLabelText('Contenido de la nota interna'), 'Contexto pendiente');
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar formulario de nota' }));
    expect(screen.queryByRole('textbox', { name: 'Contenido de la nota interna' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Añadir nota interna' }));
    expect(screen.getByLabelText('Contenido de la nota interna')).toHaveValue('Contexto pendiente');
    expect(fetchMock.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false);
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
