import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { createQueryClient } from '../../lib/query/query-client';
import { AUTH_QUERY_KEY, type AuthIdentity } from '../auth/session';
import type { Communication } from '../communications/contracts';
import { ReferralsPanel, ReferralContent } from './referrals-panel';
import { referralBody, referralFormSchema, type Referral } from './contracts';
import { timelineItemSchema } from '../relationships/timeline-contracts';
const id = '11111111-1111-4111-8111-111111111111', orgId = '22222222-2222-4222-8222-222222222222', personId = '33333333-3333-4333-8333-333333333333';
const identity: AuthIdentity = { id, givenNames: 'Ana', familyNames: 'QA', username: 'ana', email: 'ana@example.test', role: 'RESEARCH', permissions: ['communications.read', 'relationships.process.read', 'referrals.read', 'referrals.create', 'directory.read'] };
const communication: Communication = { id, processId: orgId, direction: 'RECEIVED', subject: 'Recomendación recibida', validity: 'VALID', invalidation: null, version: 1, sender: 'x@example.org', recipients: [], bodyOriginal: 'Hablen con Juan del área de proyectos', emailAccount: null, sentAt: null, receivedAt: '2000-01-01T00:00:00.000Z', occurredAt: '2000-01-01T00:00:00.000Z', createdAt: '2026-10-04T00:00:00.000Z', registeredBy: { id, displayName: 'Ana QA', isActive: true } };
const fixture: Referral = { id: personId, sourceCommunicationId: id, createdAt: '2026-10-04T10:00:00.000Z', createdBy: { id, displayName: 'Ana QA', isActive: true }, recommendedName: 'Juan del área de proyectos', recommendedRole: null, organizationNameSnapshot: null, mediumType: null, mediumValue: null, notes: null, person: null, organization: null, contactMethod: null, source: { id, subject: communication.subject, processId: orgId, validity: 'VALID' } };
describe('Contactos recomendados desde comunicación', () => {
  let client = createQueryClient(), rows: Referral[] = [], failList = false, failCreate = false;
  const fetchMock = vi.fn<(url: string, options?: RequestInit) => Promise<Response>>();
  beforeEach(() => {
    client = createQueryClient(); client.setQueryData(AUTH_QUERY_KEY, identity); rows = []; failList = failCreate = false; fetchMock.mockReset();
    fetchMock.mockImplementation(async (url, options) => {
      if (url.includes('/search?')) return Response.json({ query: 'María', organizations: { items: [], total: 0, page: 1, pageSize: 25 }, people: { items: [{ type: 'PERSON', id: personId, displayName: 'María vinculada', isActive: true, duplicateOf: null, currentRelations: [{ id, positionTitle: 'Legal', organization: { id: orgId, name: 'Fundación', isActive: true } }], currentRelationsTotal: 1 }], total: 1, page: 1, pageSize: 25 }, email: null });
      if (url.includes('/contacts?')) return Response.json({ items: [], total: 0, page: 1, pageSize: 25 });
      if (options?.method === 'POST') {
        if (failCreate) return Response.json({ code: 'REQUEST_CONFLICT', message: 'Este intento ya registró datos diferentes.' }, { status: 409 });
        const body: unknown = JSON.parse(String(options.body)); rows = [{ ...fixture, ...(body as object) }]; return Response.json(rows[0]);
      }
      if (failList) return Response.json({}, { status: 503 });
      const page = Number(new URL(url, 'http://localhost').searchParams.get('page') || 1);
      return Response.json({ items: rows.slice((page - 1) * 25, page * 25), total: rows.length, page, pageSize: 25 });
    }); vi.stubGlobal('fetch', fetchMock);
  });
  function view(row = communication, auth = identity) { return render(<QueryClientProvider client={client}><MemoryRouter><ReferralsPanel identity={auth} row={row} /></MemoryRouter></QueryClientProvider>); }
  async function open() { await userEvent.click(screen.getByRole('button', { name: 'Registrar contacto recomendado' })); }
  it('muestra vacío y permite registrar sin campos obligatorios inventados', async () => {
    view(); expect(await screen.findByText('Sin contactos recomendados registrados en esta comunicación.')).toBeVisible(); await open();
    expect(screen.getByText(/sin crear una persona/)).toBeVisible(); expect(screen.getByLabelText('Nombre recomendado')).not.toBeRequired();
  });
  it('guarda recomendación incompleta sin Person ni medio ficticio', async () => {
    view(); await open(); await userEvent.type(screen.getByLabelText('Nombre recomendado'), 'Juan del área de proyectos'); await userEvent.click(screen.getByRole('button', { name: 'Guardar contacto recomendado' }));
    expect(await screen.findByText('Nombre mencionado: Juan del área de proyectos')).toBeVisible();
    const call = fetchMock.mock.calls.find(([, options]) => options?.method === 'POST'); expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({ recommendedName: fixture.recommendedName, personId: null, mediumType: null, mediumValue: null });
  });
  it('rechaza vacío y pareja tipo/valor incompleta', async () => {
    view(); await open(); await userEvent.click(screen.getByRole('button', { name: 'Guardar contacto recomendado' })); expect(await screen.findByText('Incluye un nombre, una organización o un medio recomendado.')).toBeVisible();
    await userEvent.type(screen.getByLabelText('Nombre recomendado'), 'Juan'); await userEvent.selectOptions(screen.getByLabelText('Tipo de medio recomendado'), 'EMAIL'); await userEvent.click(screen.getByRole('button', { name: 'Guardar contacto recomendado' }));
    expect(await screen.findByText('Indica el tipo y el valor del medio, o deja ambos vacíos.')).toBeVisible(); expect(fetchMock.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false);
  });
  it('retry conserva key y borrador; cambiar payload genera nuevo intento', async () => {
    failCreate = true; view(); await open(); await userEvent.type(screen.getByLabelText('Nombre recomendado'), 'Juan');
    for (let i = 0; i < 2; i++) { await userEvent.click(screen.getByRole('button', { name: 'Guardar contacto recomendado' })); await screen.findByText(/Este intento ya registró datos diferentes/); }
    const calls = fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST'); expect(calls).toHaveLength(2);
    expect(new Headers(calls[0]![1]?.headers).get('Idempotency-Key')).toBe(new Headers(calls[1]![1]?.headers).get('Idempotency-Key'));
    await userEvent.type(screen.getByLabelText('Nombre recomendado'), ' Pérez'); await userEvent.click(screen.getByRole('button', { name: 'Guardar contacto recomendado' }));
    await waitFor(() => expect(fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(3));
    const third = fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST')[2]!; expect(new Headers(third[1]?.headers).get('Idempotency-Key')).not.toBe(new Headers(calls[0]![1]?.headers).get('Idempotency-Key'));
  });
  it('selector reutilizado admite persona con vínculo y no sobrescribe snapshot textual', async () => {
    view(); await open(); const selectors = screen.getAllByRole('region', { name: 'Seleccionar objetivo del Directorio' });
    await userEvent.type(within(selectors[0]!).getByLabelText('Buscar objetivo por nombre'), 'María');
    await userEvent.click(await screen.findByRole('button', { name: 'Seleccionar persona: María vinculada' }));
    expect(screen.getByLabelText('Nombre recomendado')).toHaveValue('');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar contacto recomendado' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(true));
    const call = fetchMock.mock.calls.find(([, options]) => options?.method === 'POST'); expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({ personId, recommendedName: null });
  });
  it('invalidación conserva listado y oculta creación', async () => {
    rows = [fixture]; view({ ...communication, validity: 'INVALIDATED' }); expect(await screen.findByText(/Nombre mencionado/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Registrar contacto recomendado' })).not.toBeInTheDocument(); expect(screen.getByText(/Se conservan sus recomendaciones anteriores/)).toBeVisible();
  });
  it('muestra error de carga y permite recuperar', async () => {
    failList = true; view(); expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar'); failList = false; await userEvent.click(screen.getByRole('button', { name: 'Reintentar' })); expect(await screen.findByText(/Sin contactos recomendados/)).toBeVisible();
  });
  it('links resuelven ficha consolidada y conservan datos históricos', () => {
    const row = { ...fixture, person: { id: personId, currentId: orgId, label: 'Nombre actual', isActive: false }, organization: { id: orgId, currentId: orgId, label: 'Fundación', isActive: true } };
    render(<MemoryRouter><ReferralContent row={row} /></MemoryRouter>); expect(screen.getByText('Nombre mencionado: Juan del área de proyectos')).toBeVisible(); expect(screen.getByRole('link', { name: /Ficha de persona/ })).toHaveAttribute('href', '/people/' + orgId);
  });
  it('timeline reconoce derivación diferenciada de correo y conserva origen', () => {
    expect(timelineItemSchema.parse({ id: personId, kind: 'REFERRAL_CREATED', occurredAt: fixture.createdAt, registeredAt: fixture.createdAt, actor: fixture.createdBy, summary: 'Contacto recomendado', payload: { referralId: personId, communicationId: id, referral: fixture } }).kind).toBe('REFERRAL_CREATED');
  });
  it('formato de medio y datos vacíos se validan sin completar información', () => {
    const partial = { recommendedName: '', recommendedRole: '', organizationNameSnapshot: 'Aliada en Perú', mediumType: '' as const, mediumValue: '', notes: '', personId: null, organizationId: null, contactMethodId: null };
    expect(referralBody(referralFormSchema.parse(partial))).toMatchObject({ recommendedName: null, organizationNameSnapshot: 'Aliada en Perú', personId: null });
    expect(referralFormSchema.safeParse({ ...partial, mediumType: 'EMAIL', mediumValue: 'inválido' }).success).toBe(false);
  });
  it('lista paginada consulta únicamente la página siguiente', async () => {
    rows = Array.from({ length: 26 }, (_, index) => ({ ...fixture, id: crypto.randomUUID(), recommendedName: 'Contacto ' + index })); view();
    expect(await screen.findByText('Nombre mencionado: Contacto 0')).toBeVisible(); await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(await screen.findByText('Nombre mencionado: Contacto 25')).toBeVisible(); expect(screen.queryByText('Nombre mencionado: Contacto 0')).not.toBeInTheDocument();
  });
  it('muestra carga mientras espera y submitting evita envío repetido', async () => {
    let finishList!: () => void, finishCreate!: () => void;
    const listReady = new Promise<void>(resolve => { finishList = resolve; }), createReady = new Promise<void>(resolve => { finishCreate = resolve; });
    const normal = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url, options) => { await (options?.method === 'POST' ? createReady : listReady); return normal(url, options); });
    view(); expect(screen.getByRole('status')).toHaveTextContent('Cargando'); finishList(); await screen.findByText(/Sin contactos recomendados/);
    await open(); await userEvent.type(screen.getByLabelText('Nombre recomendado'), 'Juan'); await userEvent.click(screen.getByRole('button', { name: 'Guardar contacto recomendado' }));
    expect(await screen.findByRole('button', { name: 'Registrando…' })).toBeDisabled(); finishCreate(); expect(await screen.findByText('Nombre mencionado: Juan')).toBeVisible();
  });
});
