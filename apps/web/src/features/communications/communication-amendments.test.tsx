import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '../../lib/query/query-client';
import { AUTH_QUERY_KEY, type AuthIdentity } from '../auth/session';
import { AppRoutes } from '../../app/router/app-routes';
import { CommunicationAmendments } from './communication-amendments';
import { RelationshipTimeline } from '../relationships/relationship-timeline';
import type { Communication } from './contracts';
import type { Amendment } from './amendment-contracts';
const id = '11111111-1111-4111-8111-111111111111', actorId = '22222222-2222-4222-8222-222222222222', otherId = '33333333-3333-4333-8333-333333333333', at = '2000-10-01T12:00:00.000Z';
const identity: AuthIdentity = { id: actorId, givenNames: 'Ana', familyNames: 'QA', username: 'ana', email: 'ana@example.test', role: 'PLANNING', permissions: ['communications.read', 'relationships.process.read', 'communications.amend', 'communications.invalidate'] };
const author = { id: actorId, displayName: 'Ana QA', isActive: true };
function original(): Communication { return { id, processId: id, direction: 'RECEIVED', validity: 'VALID', invalidation: null, version: 1, subject: 'Asunto original', bodyOriginal: 'Texto original <script>literal</script>', sender: 'original@example.test',
  sentAt: null, receivedAt: at, occurredAt: at, createdAt: at, emailAccount: null, registeredBy: author, recipients: [{ type: 'TO', addressOriginal: 'historico@example.test', normalizedAddress: 'historico@example.test', position: 0 }] }; }
function amendment(type: Amendment['type'] = 'CORRECTION', content = 'Contenido posterior'): Amendment { return { id: crypto.randomUUID(), communicationId: id, type, content, createdAt: '2000-10-05T12:00:00.000Z', author }; }
describe('Correcciones, observaciones e invalidaciones en interfaz', () => {
  let client = createQueryClient(), row = original(), items: Amendment[] = [], errorStatus = 0;
  const fetchMock = vi.fn<(url: string, options?: RequestInit) => Promise<Response>>();
  beforeEach(() => {
    client = createQueryClient(); row = original(); items = []; errorStatus = 0;
    client.setQueryDefaults(AUTH_QUERY_KEY, { staleTime: Infinity }); client.setQueryData(AUTH_QUERY_KEY, identity);
    fetchMock.mockReset(); fetchMock.mockImplementation((url, options) => {
      if (url.endsWith('/auth/me')) return Promise.resolve(Response.json(identity));
      if (options?.method === 'POST') {
        if (errorStatus) return Promise.resolve(Response.json({ message: errorStatus === 403 ? 'Acción denegada' : 'Conflicto de registro' }, { status: errorStatus }));
        const body = JSON.parse(String(options.body)) as { type?: Amendment['type']; content?: string; reason?: string };
        const created = amendment(body.type ?? 'INVALIDATION', body.content ?? body.reason!); items.push(created);
        if (created.type === 'INVALIDATION') row = { ...row, validity: 'INVALIDATED', version: 2, invalidation: created };
        return Promise.resolve(Response.json(created, { status: 201 }));
      }
      if (url.includes('/amendments?')) return Promise.resolve(Response.json({ items, total: items.length, page: 1, pageSize: 25 }));
      if (url.includes('/timeline?')) return Promise.resolve(Response.json({ items: [{ id, kind: 'RECEIVED_COMMUNICATION', occurredAt: at, registeredAt: at, actor: author, summary: row.subject,
        payload: { communicationId: id, subject: row.subject, sender: row.sender, recipients: [], recipientTotal: 0, validity: row.validity, invalidation: row.invalidation } },
        ...items.map(item => ({ id: item.id, kind: item.type === 'CORRECTION' ? 'COMMUNICATION_CORRECTED' : item.type === 'ANNOTATION' ? 'COMMUNICATION_ANNOTATED' : 'COMMUNICATION_INVALIDATED', occurredAt: item.createdAt, registeredAt: item.createdAt, actor: item.author, summary: item.type, payload: { amendmentId: item.id, communicationId: id, content: item.content } }))], nextCursor: null }));
      if (url.endsWith('/communications/' + id)) return Promise.resolve(Response.json(row));
      return Promise.resolve(new Response(null, { status: 404 }));
    }); vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => { client.clear(); vi.unstubAllGlobals(); });
  const wrap = (content: React.ReactNode, route = '/') => <QueryClientProvider client={client}><MemoryRouter initialEntries={[route]}>{content}</MemoryRouter></QueryClientProvider>;
  const panel = (actor = identity, mail = row) => { client.setQueryData(AUTH_QUERY_KEY, actor); return render(wrap(<CommunicationAmendments identity={actor} row={mail} />)); };
  const posts = () => fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST');
  it('detalle muestra original literal y amendments sin reemplazarlo', async () => {
    items = [amendment('CORRECTION', 'Destinatario correcto'), amendment('ANNOTATION', 'Contexto específico')];
    render(wrap(<AppRoutes />, '/communications/' + id));
    expect(await screen.findByText('Contenido original registrado')).toBeVisible(); expect(screen.getByText(row.bodyOriginal)).toBeVisible(); expect(document.querySelector('script')).toBeNull();
    expect(await screen.findByText('Destinatario correcto')).toBeVisible(); expect(screen.getByText('Contexto específico')).toBeVisible(); expect(screen.queryByRole('button', { name: /Editar|Eliminar/ })).not.toBeInTheDocument();
  });
  it.each(['ADMINISTRATOR', 'BOARD', 'RESEARCH', 'PLANNING'] as const)('%s agrega corrección/observación sin autoría', async role => {
    panel({ ...identity, role }, { ...row, registeredBy: { ...author, id: otherId } }); await screen.findByText('Sin correcciones ni observaciones posteriores.');
    expect(screen.getByRole('button', { name: 'Agregar corrección' })).toBeVisible(); expect(screen.getByRole('button', { name: 'Agregar observación' })).toBeVisible();
    expect(!!screen.queryByRole('button', { name: 'Invalidar comunicación' })).toBe(['ADMINISTRATOR', 'BOARD'].includes(role));
  });
  it.each(['corrección', 'observación'])('registrar %s conserva original y refleja la lista', async action => {
    panel(); await screen.findByText('Sin correcciones ni observaciones posteriores.'); await userEvent.click(screen.getByRole('button', { name: 'Agregar ' + action }));
    if (action === 'corrección') expect(screen.getByText('La corrección no reemplazará el contenido original.')).toBeVisible();
    await userEvent.type(screen.getByLabelText('Contenido'), 'Texto adicional'); await userEvent.click(screen.getByRole('button', { name: 'Registrar ' + action }));
    expect(await screen.findByText('Texto adicional')).toBeVisible(); expect(row.bodyOriginal).toBe(original().bodyOriginal);
    expect(JSON.parse(String(posts()[0]![1]?.body))).toEqual({ type: action === 'corrección' ? 'CORRECTION' : 'ANNOTATION', content: 'Texto adicional' });
  });
  it('invalida propia mediante motivo y confirmación explícita; badge conserva el original', async () => {
    render(wrap(<AppRoutes />, '/communications/' + id)); await screen.findByText('Contenido original registrado');
    await userEvent.click(screen.getByRole('button', { name: 'Invalidar comunicación' })); expect(screen.getByText(/permanecerá visible en el historial/)).toBeVisible();
    await userEvent.type(screen.getByLabelText('Motivo obligatorio'), 'Duplicada'); await userEvent.click(screen.getByRole('button', { name: 'Confirmar invalidación' })); expect(posts()).toHaveLength(0);
    await userEvent.click(screen.getByRole('checkbox')); await userEvent.click(screen.getByRole('button', { name: 'Confirmar invalidación' }));
    expect(await screen.findByText('Recibida · INVALIDADA')).toBeVisible(); expect(screen.getByText('Motivo: Duplicada')).toBeVisible(); expect(screen.getByText(row.bodyOriginal)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Agregar corrección' })).not.toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'Invalidar comunicación' })).not.toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Agregar observación' })).toBeVisible();
  });
  it('contenido vacío no envía', async () => {
    panel(); await screen.findByText('Sin correcciones ni observaciones posteriores.'); await userEvent.click(screen.getByRole('button', { name: 'Agregar corrección' }));
    await userEvent.type(screen.getByLabelText('Contenido'), '   '); await userEvent.click(screen.getByRole('button', { name: 'Registrar corrección' })); expect(await screen.findByText('Incluye contenido significativo.')).toBeVisible(); expect(posts()).toHaveLength(0);
  });
  it.each([403, 409])('error %s conserva borrador y request key al reintentar', async status => {
    errorStatus = status; panel(); await screen.findByText('Sin correcciones ni observaciones posteriores.'); await userEvent.click(screen.getByRole('button', { name: 'Agregar observación' }));
    await userEvent.type(screen.getByLabelText('Contenido'), 'Borrador'); await userEvent.click(screen.getByRole('button', { name: 'Registrar observación' })); await screen.findByRole('alert');
    expect(screen.getByLabelText('Contenido')).toHaveValue('Borrador'); const key = (posts()[0]![1]?.headers as Record<string, string>)['Idempotency-Key'];
    errorStatus = 0; await userEvent.click(screen.getByRole('button', { name: 'Registrar observación' })); await screen.findByText('Borrador');
    expect((posts()[1]![1]?.headers as Record<string, string>)['Idempotency-Key']).toBe(key);
  });
  function ContextProbe() { const query = useQuery({ queryKey: ['relationship-context', identity.id, 'fixture'], queryFn: () => Promise.resolve(row.validity === 'VALID' ? 1 : 0) }); return <p>Comunicaciones válidas: {query.data}</p>; }
  it('nueva invalidación refresca timeline y contexto; preserva original y fecha real', async () => {
    render(wrap(<><CommunicationAmendments identity={identity} row={row} /><RelationshipTimeline identity={identity} processId={id} /><ContextProbe /></>));
    await screen.findByText('Comunicaciones válidas: 1'); await screen.findByText('Asunto original'); await userEvent.click(screen.getByRole('button', { name: 'Invalidar comunicación' }));
    await userEvent.type(screen.getByLabelText('Motivo obligatorio'), 'Registro erróneo'); await userEvent.click(screen.getByRole('checkbox')); await userEvent.click(screen.getByRole('button', { name: 'Confirmar invalidación' }));
    await screen.findByText('Comunicaciones válidas: 0'); const timeline = screen.getByRole('region', { name: 'Conversación / Historial' });
    expect(await within(timeline).findByText('INVALIDADA')).toBeVisible(); expect(within(timeline).getByText('Asunto original')).toBeVisible(); expect(within(timeline).getByText('Comunicación invalidada')).toBeVisible();
    await waitFor(() => expect(within(timeline).getAllByRole('listitem')).toHaveLength(2));
  });
  it('sin capabilities conserva consulta y no ofrece mutaciones', async () => {
    panel({ ...identity, permissions: ['communications.read', 'relationships.process.read'] }); await screen.findByText('Sin correcciones ni observaciones posteriores.'); expect(screen.queryByRole('button', { name: /Agregar|Invalidar/ })).not.toBeInTheDocument();
  });
});
