import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../../app/router/app-routes';
import { createQueryClient } from '../../lib/query/query-client';
import { AUTH_QUERY_KEY, type AuthIdentity } from '../auth/session';
import { RelationshipContextPanel } from './relationship-context-panel';
import { contextIdentityKey, clearForbiddenContext } from './context-queries';
import type { ActorContext, RelationshipContext } from './context-contracts';
import { useIntentMutation, useIntentConversion } from './queries';
import { useProcessMutation } from './process-queries';
import { useRestrictionMutation } from './restriction-queries';
import type { ContactIntent } from './contracts';
import type { ProcessDetail } from './process-contracts';
import { useReceivedCommunication, useSentCommunication } from '../communications/queries';
const orgId = '11111111-1111-4111-8111-111111111111', personId = '22222222-2222-4222-8222-222222222222', userId = '33333333-3333-4333-8333-333333333333', itemId = '44444444-4444-4444-8444-444444444444';
const at = '2026-10-04T12:00:00.000Z';
const identity: AuthIdentity = { id: userId, givenNames: 'Ana', familyNames: 'QA', email: 'qa@example.test', username: 'ana', role: 'BOARD',
  permissions: ['communications.read', 'communications.sent.create', 'communications.received.create', 'directory.read', 'relationships.intent.read', 'relationships.intent.create', 'relationships.intent.convert', 'relationships.process.read', 'relationships.process.create', 'relationships.restriction.read', 'relationships.restriction.create', 'relationships.restriction.lift'] };
const user = { id: userId, displayName: 'Ana QA', isActive: true };
function empty(): RelationshipContext {
  return { target: { kind: 'ORGANIZATION', id: orgId, label: 'Fundación QA', isActive: true }, restriction: null, contactAllowed: true,
    activeIntents: { items: [], total: 0 }, activeProcesses: { items: [], total: 0 }, recentClosedProcesses: { items: [], total: 0 }, relatedOrganizationContext: { items: [], total: 0 },
    hasRelationshipHistory: false, hasRegisteredCommunicationHistory: false, communicationSummary: { total: 0, lastOccurredAt: null, lastDirection: null }, recentCommunications: [] };
}
function active(context: ActorContext = empty()): ActorContext['activeProcesses']['items'][number] {
  return { id: itemId, purpose: 'Cooperación institucional', state: 'PREPARATION', target: context.target, createdBy: user, createdAt: at, lastActivityAt: at, result: null, closedAt: null };
}
function intent(): ContactIntent { return { id: itemId, purpose: 'Preparación de alianza', target: empty().target, author: user, state: 'ACTIVE', version: 1,
  createdAt: at, updatedAt: at, lastActivityAt: at, cancelledAt: null, cancelledBy: null, processId: null, canCancel: false, canConvert: true }; }
function process(): ProcessDetail { return { ...active(), currentResult: null, sourceIntentId: null, updatedAt: at, closureObservation: null, closedBy: null, version: 1,
  canClose: true, canReopen: false, exceptionalAdministration: false, allowedStates: ['IN_PROGRESS'], events: [], eventsTotal: 0, participants: [] }; }
function mail(direction: 'SENT' | 'RECEIVED', id = itemId): ActorContext['recentCommunications'][number] {
  return { validity: 'VALID', id, processId: itemId, direction, subject: direction === 'SENT' ? 'Propuesta registrada' : 'Respuesta registrada', sender: 'Old@Example.test',
    sentAt: direction === 'SENT' ? at : null, receivedAt: direction === 'RECEIVED' ? at : null, occurredAt: at, createdAt: '2026-10-05T12:00:00.000Z',
    process: { id: itemId, purpose: 'Proceso de cooperación' }, recipients: [{ type: 'TO', addressOriginal: 'Original@Example.test', position: 0 }], recipientTotal: 1 };
}
function withHistory(context: ActorContext, items: ActorContext['recentCommunications']): ActorContext {
  return { ...context, hasRegisteredCommunicationHistory: !!items.length, recentCommunications: items,
    communicationSummary: { total: items.length, lastOccurredAt: items[0]?.occurredAt ?? null, lastDirection: items[0]?.direction ?? null } };
}
describe('Contexto institucional previo', () => {
  let client = createQueryClient(), row = empty(), mode = 'ok', writeStatus = 201;
  const fetchMock = vi.fn<(url: string, options?: RequestInit) => Promise<Response>>();
  beforeEach(() => {
    client = createQueryClient(); row = empty(); mode = 'ok'; writeStatus = 201;
    client.setQueryDefaults(AUTH_QUERY_KEY, { staleTime: Infinity }); client.setQueryData(AUTH_QUERY_KEY, identity);
    fetchMock.mockReset(); fetchMock.mockImplementation((url, options) => {
      if (url.endsWith('/auth/me')) return Promise.resolve(Response.json(identity));
      if (url.includes('/relationship-context?')) {
        if (mode === 'pending') return new Promise<Response>(() => undefined);
        return Promise.resolve(mode === 'error' ? new Response(null, { status: 500 }) : Response.json(row));
      }
      if (url.includes('/search?')) return Promise.resolve(Response.json({ query: 'QA', email: null,
        organizations: { items: [{ type: 'ORGANIZATION', id: orgId, name: 'Fundación QA', alias: null, country: null, parent: null, duplicateOf: null, isActive: true }], total: 1, page: 1, pageSize: 25 },
        people: { items: [], total: 0, page: 1, pageSize: 25 } }));
      if (options?.method === 'POST') {
        if (writeStatus !== 201) return Promise.resolve(Response.json({ code: 'CONTACT_RESTRICTED' }, { status: writeStatus }));
        if (url.includes('/communications/')) {
          const summary = mail(url.endsWith('/sent') ? 'SENT' : 'RECEIVED'); row = { ...row, ...withHistory(row, [summary]) };
          return Promise.resolve(Response.json({ ...summary, validity: 'VALID', version: 1, bodyOriginal: 'Cuerpo solo en detalle', registeredBy: user,
            emailAccount: summary.direction === 'SENT' ? { id: itemId, address: 'institucional@example.test', displayName: 'Buzón' } : null,
            recipients: summary.recipients.map(item => ({ ...item, normalizedAddress: item.addressOriginal.toLowerCase(), emailAccount: null })) }, { status: 201 }));
        }
        if (url.includes('/convert')) return Promise.resolve(Response.json({ intent: { ...intent(), state: 'CONVERTED', canConvert: false, processId: itemId }, process: process() }, { status: 201 }));
        if (url.includes('/contact-intents')) return Promise.resolve(Response.json(intent(), { status: 201 }));
        if (url.includes('/relationship-processes')) return Promise.resolve(Response.json(process(), { status: 201 }));
        return Promise.resolve(Response.json({ id: itemId, reason: 'Solicitud', state: 'LIFTED', version: 2, target: row.target, registeredBy: user, createdAt: at, updatedAt: at, liftedAt: at, liftedBy: user, liftReason: 'Decisión', canLift: false }, { status: 201 }));
      }
      if (url.endsWith('/contact-intents/' + itemId)) return Promise.resolve(Response.json(intent()));
      if (url.endsWith('/relationship-processes/' + itemId)) return Promise.resolve(Response.json(process()));
      return Promise.resolve(new Response(null, { status: 404 }));
    }); vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => { client.clear(); vi.unstubAllGlobals(); });
  function wrap(content: React.ReactNode) { return <QueryClientProvider client={client}><MemoryRouter>{content}</MemoryRouter></QueryClientProvider>; }
  function panel() { return render(wrap(<RelationshipContextPanel identity={identity} target={row.target} />)); }
  function form(path: string) { return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter></QueryClientProvider>); }
  const writes = () => fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST');
  const reads = () => fetchMock.mock.calls.filter(([url]) => url.includes('/relationship-context?'));
  function restrict() { row.restriction = { id: itemId, reason: 'Solicitud explícita', createdAt: at }; row.contactAllowed = false; }
  it('vacío distingue gestiones de comunicaciones y no afirma contacto', async () => {
    panel(); expect(await screen.findByText('No hay gestiones registradas para este objetivo.')).toBeVisible();
    expect(screen.getByText(/No hay comunicaciones válidas registradas en CECASEM Conecta/)).toBeVisible(); expect(writes()).toHaveLength(0);
    expect(screen.getByText('CECASEM Conecta solo puede mostrar comunicaciones registradas en el sistema.')).toBeVisible();
    expect(screen.queryByText(/Nunca se contactó/i)).not.toBeInTheDocument();
  });
  it.each(['SENT', 'RECEIVED'] as const)('%s muestra fecha real, snapshots y enlaces sin cuerpo', async direction => {
    const item = mail(direction); row = { ...row, ...withHistory(row, [item]) }; panel();
    const section = await screen.findByRole('region', { name: 'Comunicaciones registradas de Fundación QA' });
    expect(within(section).getByText(/Última comunicación:/)).toHaveTextContent(direction === 'SENT' ? 'Enviada' : 'Recibida');
    expect(within(section).getByText(/Fecha real:/)).toHaveTextContent(new Date(item.occurredAt).toLocaleString('es-BO'));
    expect(within(section).getByRole('link', { name: item.subject })).toHaveAttribute('href', '/communications/' + item.id);
    expect(within(section).getByRole('link', { name: item.process.purpose })).toHaveAttribute('href', '/relationship-processes/' + item.process.id);
    expect(within(section).getByText('Remitente: Old@Example.test')).toBeVisible(); expect(within(section).getByText('Destinatarios: Para: Original@Example.test')).toBeVisible();
    expect(section).not.toHaveTextContent('Cuerpo solo en detalle'); expect(section).not.toHaveTextContent(new Date(item.createdAt).toLocaleString('es-BO'));
  });
  it('mixtas conserva orden del servidor, total y límite de destinatarios', async () => {
    const received = { ...mail('RECEIVED'), recipientTotal: 20 }, sent = mail('SENT', personId); row = { ...row, ...withHistory(row, [received, sent]) }; row.communicationSummary.total = 8; panel();
    const section = await screen.findByRole('region', { name: 'Comunicaciones registradas de Fundación QA' });
    expect(within(section).getAllByRole('listitem')).toHaveLength(2);
    expect(within(section).getByText(/Última comunicación:/)).toHaveTextContent('Recibida');
    expect(within(section).getByText('Se muestran 2 de 8 comunicaciones.')).toBeVisible();
    expect(within(section).getByText(/Se muestran 1 de 20 destinatarios/)).toBeVisible();
  });
  it('restricción y recibida reciente son visibles juntas sin levantar el bloqueo', async () => {
    restrict(); row = { ...row, ...withHistory(row, [mail('RECEIVED')]) }; panel();
    expect(await screen.findByText('RESTRICCIÓN ACTIVA — NO CONTACTAR')).toBeVisible(); expect(screen.getByText(/Última comunicación: Recibida/)).toBeVisible();
  });
  it('carga', () => { mode = 'pending'; panel(); expect(screen.getByRole('status')).toHaveTextContent('Consultando gestiones'); });
  it('error permite reintentar', async () => { mode = 'error'; panel(); await screen.findByText(/No se pudo consultar el contexto institucional/); mode = 'ok'; await userEvent.click(screen.getByRole('button', { name: 'Reintentar contexto' })); expect(await screen.findByText('No hay gestiones registradas para este objetivo.')).toBeVisible(); });
  it('procesos activos son advertencia, con creador y enlace, sin prohibición', async () => {
    row.activeProcesses = { items: [active()], total: 2 }; panel();
    expect(await screen.findByRole('heading', { name: 'Advertencia: 2 procesos activos' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Cooperación institucional' })).toHaveAttribute('href', '/relationship-processes/' + itemId);
    expect(screen.getByText(/Creador: Ana QA/)).toBeVisible(); expect(screen.getByText(/objetivos diferentes/)).toBeVisible(); expect(screen.getByText('Se muestran 1 de 2 gestiones.')).toBeVisible();
    expect(screen.getByText('Existe un proceso activo, pero no hay comunicaciones válidas registradas.')).toBeVisible();
  });
  it('intenciones son preparativos, con autor y fechas', async () => {
    row.activeIntents = { total: 1, items: [{ id: itemId, purpose: 'Preparar proyecto', target: row.target, author: user, createdAt: at, lastActivityAt: at }] }; panel();
    expect(await screen.findByRole('heading', { name: 'Advertencia: 1 intenciones activas' })).toBeVisible(); expect(screen.getByRole('link', { name: 'Preparar proyecto' })).toHaveAttribute('href', '/contact-intents/' + itemId); expect(screen.getByText(/Autor: Ana QA/)).toBeVisible();
  });
  it('cerrados informan resultado y cierre sin bloqueo', async () => {
    row.recentClosedProcesses = { total: 1, items: [{ ...active(), state: 'CLOSED', result: 'REJECTED', closedAt: at }] }; panel();
    expect(await screen.findByRole('heading', { name: 'Información: 1 procesos cerrados' })).toBeVisible(); expect(screen.getByText(/Resultado: No aceptado/)).toBeVisible(); expect(screen.queryByText('RESTRICCIÓN ACTIVA — NO CONTACTAR')).not.toBeInTheDocument();
  });
  it('restricción domina antes de advertencias', async () => {
    restrict(); row.activeProcesses = { total: 1, items: [active()] }; panel(); const block = await screen.findByRole('alert');
    expect(block).toHaveTextContent('RESTRICCIÓN ACTIVA — NO CONTACTAR'); expect(block.compareDocumentPosition(screen.getByText('Advertencia: 1 procesos activos')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(block).getByRole('link', { name: 'Consultar restricción' })).toHaveAttribute('href', '/contact-restrictions/' + itemId);
  });
  it('levantada no genera aviso de no contactar', async () => { panel(); await screen.findByText('No hay gestiones registradas para este objetivo.'); expect(screen.queryByRole('alert')).not.toBeInTheDocument(); });
  it('persona vinculada separa contexto personal e institucional sin duplicar ni afirmar contacto', async () => {
    const org = { ...withHistory(empty(), [mail('RECEIVED')]), activeProcesses: { items: [active()], total: 1 } };
    row.target = { kind: 'PERSON', id: personId, label: 'María QA', isActive: true }; row.relatedOrganizationContext = { items: [org], total: 1 }; panel();
    const section = await screen.findByRole('region', { name: 'Contexto de organizaciones vinculadas' });
    expect(screen.getAllByRole('link', { name: 'Cooperación institucional' })).toHaveLength(1); expect(within(section).getByRole('link', { name: 'Fundación QA' })).toBeVisible();
    expect(screen.getByText(/no demuestra contacto con esta persona/)).toBeVisible(); expect(reads()[0]?.[0]).toContain('personId=' + personId);
    expect(screen.getAllByRole('link', { name: 'Respuesta registrada' })).toHaveLength(1);
    expect(screen.getByRole('region', { name: 'Comunicaciones registradas de María QA' })).toHaveTextContent('No hay comunicaciones válidas registradas en CECASEM Conecta.');
  });
  it('persona con comunicaciones directas y organización conserva conteos y enlaces separados', async () => {
    row = { ...row, ...withHistory(row, [mail('SENT')]), target: { kind: 'PERSON', id: personId, label: 'María QA', isActive: true },
      relatedOrganizationContext: { items: [withHistory(empty(), [mail('RECEIVED', orgId)])], total: 1 } }; panel();
    const own = await screen.findByRole('region', { name: 'Comunicaciones registradas de María QA' }), org = screen.getByRole('region', { name: 'Comunicaciones registradas de Fundación QA' });
    expect(within(own).getByRole('link', { name: 'Propuesta registrada' })).toBeVisible(); expect(within(own).queryByText('Respuesta registrada')).not.toBeInTheDocument();
    expect(within(org).getByRole('link', { name: 'Respuesta registrada' })).toBeVisible(); expect(within(org).queryByText('Propuesta registrada')).not.toBeInTheDocument();
  });
  it('restricción de organización vinculada indica actor exacto', async () => {
    const organization = { ...empty(), restriction: { id: itemId, reason: 'Solo institución', createdAt: at }, contactAllowed: false };
    row.target = { kind: 'PERSON', id: personId, label: 'María QA', isActive: true }; row.relatedOrganizationContext = { items: [organization], total: 6 }; panel();
    expect(await screen.findByText('Aplica a Fundación QA.')).toBeVisible(); expect(screen.getByText(/Se muestran 1 de 6 organizaciones/)).toBeVisible();
  });
  it('intenciones históricas solas no se presentan activas', async () => { row.hasRelationshipHistory = true; panel(); expect(await screen.findByText(/Existen intenciones históricas/)).toBeVisible(); expect(screen.queryByText(/Advertencia:/)).not.toBeInTheDocument(); });
  it('target nuevo limpia contexto visible anterior y consulta solo ese actor', async () => {
    row.activeProcesses = { items: [active()], total: 1 }; const view = panel(); await screen.findByRole('link', { name: 'Cooperación institucional' });
    row = { ...empty(), target: { kind: 'PERSON', id: personId, label: 'Otra persona', isActive: true } }; mode = 'pending';
    view.rerender(wrap(<RelationshipContextPanel identity={identity} target={row.target} />));
    expect(screen.queryByRole('link', { name: 'Cooperación institucional' })).not.toBeInTheDocument(); await waitFor(() => expect(reads().at(-1)?.[0]).toContain('personId=' + personId));
  });
  it('sin target o permiso no consulta', () => {
    const view = render(wrap(<RelationshipContextPanel identity={identity} target={null} />));
    view.rerender(wrap(<RelationshipContextPanel identity={{ ...identity, permissions: ['directory.read'] }} target={row.target} />)); expect(reads()).toHaveLength(0);
  });
  it.each(['/contact-intents/new', '/relationship-processes/new'])('selector consulta contexto y antecedentes permiten enviar en %s', async path => {
    row.activeProcesses = { total: 1, items: [active()] }; row = { ...row, ...withHistory(row, [mail('RECEIVED')]) }; form(path); await userEvent.type(screen.getByLabelText('Buscar objetivo por nombre'), 'QA');
    await userEvent.click(await screen.findByRole('button', { name: 'Seleccionar organización: Fundación QA' })); await screen.findByText('Advertencia: 1 procesos activos');
    expect(screen.getByRole('link', { name: 'Respuesta registrada' })).toBeVisible();
    await userEvent.type(screen.getByLabelText('Propósito'), 'Nuevo objetivo'); await userEvent.click(screen.getByRole('button', { name: path.includes('contact-intents') ? 'Guardar intención' : 'Guardar proceso' }));
    await waitFor(() => expect(writes()).toHaveLength(1)); expect(reads().every(([url]) => url.includes('organizationId=' + orgId))).toBe(true);
  });
  it.each(['/contact-intents/new', '/relationship-processes/new'])('bloqueo impide guardar y no ofrece bypass en %s', async path => {
    restrict(); form(path); await userEvent.type(screen.getByLabelText('Buscar objetivo por nombre'), 'QA'); await userEvent.click(await screen.findByRole('button', { name: 'Seleccionar organización: Fundación QA' }));
    await screen.findByText('RESTRICCIÓN ACTIVA — NO CONTACTAR'); expect(screen.getByRole('button', { name: path.includes('contact-intents') ? 'Guardar intención' : 'Guardar proceso' })).toBeDisabled(); expect(writes()).toHaveLength(0); expect(screen.queryByText(/continuar de todas formas/i)).not.toBeInTheDocument();
  });
  it.each(['/contact-intents/new', '/relationship-processes/new'])('restricción posterior 409 conserva propósito en %s', async path => {
    writeStatus = 409; form(path); await userEvent.type(screen.getByLabelText('Buscar objetivo por nombre'), 'QA'); await userEvent.click(await screen.findByRole('button', { name: 'Seleccionar organización: Fundación QA' }));
    await userEvent.type(screen.getByLabelText('Propósito'), 'Borrador'); await userEvent.click(screen.getByRole('button', { name: path.includes('contact-intents') ? 'Guardar intención' : 'Guardar proceso' }));
    expect(await screen.findByText(/No se puede iniciar este acercamiento/)).toBeVisible(); expect(screen.getByLabelText('Propósito')).toHaveValue('Borrador');
  });
  function Mutate({ kind }: { kind: string }) {
    const intentMutation = useIntentMutation(identity), processMutation = useProcessMutation(identity), restrictionMutation = useRestrictionMutation(identity), conversion = useIntentConversion(identity);
    return <button onClick={() => { row = empty();
      const operation = kind === 'conversion' ? conversion.mutateAsync({ id: itemId, expectedVersion: 1 }) : kind === 'intent' ? intentMutation.mutateAsync({ path: 'contact-intents', body: {} }) : kind === 'process' ? processMutation.mutateAsync({ path: 'relationship-processes', body: {} }) : restrictionMutation.mutateAsync({ path: 'contact-restrictions/' + itemId + '/lift', body: {} });
      void operation.catch(() => undefined);
    }}>Mutar</button>;
  }
  it.each(['intent', 'process', 'restriction', 'conversion'])('%s invalida contexto y elimina NO CONTACTAR obsoleto', async kind => {
    restrict(); render(wrap(<><RelationshipContextPanel identity={identity} target={row.target} /><Mutate kind={kind} /></>)); await screen.findByText('RESTRICCIÓN ACTIVA — NO CONTACTAR');
    await userEvent.click(screen.getByRole('button', { name: 'Mutar' })); await waitFor(() => expect(screen.queryByText('RESTRICCIÓN ACTIVA — NO CONTACTAR')).not.toBeInTheDocument()); expect(reads().length).toBeGreaterThan(1);
  });
  function Register({ direction }: { direction: 'SENT' | 'RECEIVED' }) {
    const sent = useSentCommunication(identity), received = useReceivedCommunication(identity);
    return <button onClick={() => {
      const shared = { to: ['original@example.test'], cc: [], bcc: [], subject: 'Registro', body: 'Original' };
      const operation = direction === 'SENT' ? sent.mutateAsync({ processId: itemId, requestKey: itemId, body: { ...shared, emailAccountId: itemId, sentAt: at } })
        : received.mutateAsync({ processId: itemId, requestKey: itemId, body: { ...shared, sender: 'externo@example.test', receivedAt: at } });
      void operation.catch(() => undefined);
    }}>Registrar comunicación</button>;
  }
  it.each(['SENT', 'RECEIVED'] as const)('registrar %s refresca antecedentes del panel existente', async direction => {
    render(wrap(<><RelationshipContextPanel identity={identity} target={row.target} /><Register direction={direction} /></>));
    await screen.findByText('No hay comunicaciones válidas registradas en CECASEM Conecta.'); await userEvent.click(screen.getByRole('button', { name: 'Registrar comunicación' }));
    expect(await screen.findByRole('link', { name: direction === 'SENT' ? 'Propuesta registrada' : 'Respuesta registrada' })).toBeVisible(); expect(reads().length).toBeGreaterThan(1);
  });
  it.each(['logout', 'role', 'permission'])('%s elimina caché de contexto', async change => {
    client.setQueryData([...contextIdentityKey(identity), 'ORGANIZATION', orgId], row);
    const current = change === 'logout' ? null : { ...identity, ...(change === 'role' ? { role: 'RESEARCH' as const } : { permissions: ['directory.read'] }) };
    await clearForbiddenContext(client, current); expect(client.getQueryCache().findAll({ queryKey: ['relationship-context'] })).toHaveLength(0);
  });
  it('respuesta tardía después de retirar identidad no repuebla caché', async () => {
    let finish!: (response: Response) => void; fetchMock.mockImplementation(() => new Promise(resolve => { finish = resolve; })); const view = panel();
    await waitFor(() => expect(reads()).toHaveLength(1)); view.unmount(); await clearForbiddenContext(client, null);
    await act(async () => finish(Response.json(row))); expect(client.getQueryCache().findAll({ queryKey: ['relationship-context'] })).toHaveLength(0);
  });
});
