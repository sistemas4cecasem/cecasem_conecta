import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../../app/router/app-routes';
import { createQueryClient } from '../../lib/query/query-client';
import { AUTH_QUERY_KEY, type AuthIdentity } from '../auth/session';
import { clearForbiddenRestrictions, restrictionIdentityKey } from './restriction-queries';
import type { ContactRestriction } from './restriction-contracts';
import type { ContactIntent } from './contracts';
const id = '11111111-1111-4111-8111-111111111111', goal = '22222222-2222-4222-8222-222222222222', ownerId = '33333333-3333-4333-8333-333333333333';
const permissions = ['communications.read', 'directory.read', 'relationships.restriction.read', 'relationships.restriction.create', 'relationships.restriction.lift', 'relationships.intent.read', 'relationships.intent.create', 'relationships.intent.convert', 'relationships.process.read', 'relationships.process.create'];
const initialIdentity: AuthIdentity = { id: ownerId, givenNames: 'Ana', familyNames: 'QA', username: 'ana', email: 'qa@example.test', role: 'BOARD', permissions };
const timestamp = '2026-10-03T12:00:00.000Z';
function restriction(): ContactRestriction {
  return { id, reason: 'Solicitud expresa de no contacto', state: 'ACTIVE', version: 1, target: { kind: 'ORGANIZATION', id: goal, label: 'Fundación QA', isActive: true },
    registeredBy: { id: ownerId, displayName: 'Ana QA', isActive: true }, createdAt: timestamp, updatedAt: timestamp, liftedAt: null, liftedBy: null, liftReason: null, canLift: true };
}
function intention(): ContactIntent {
  return { id, purpose: 'Cooperación previa', state: 'ACTIVE', version: 1, target: restriction().target, author: restriction().registeredBy,
    createdAt: timestamp, updatedAt: timestamp, lastActivityAt: timestamp, cancelledAt: null, cancelledBy: null, processId: null, canCancel: false, canConvert: true };
}
describe('Restricciones de no contacto frontend', () => {
  let client = createQueryClient(), identity: AuthIdentity | null = initialIdentity, row = restriction(), mode = 'ok', total = 1, status = 201;
  const fetchMock = vi.fn<(url: string, options?: RequestInit) => Promise<Response>>();
  beforeEach(() => {
    client = createQueryClient(); identity = initialIdentity; row = restriction(); mode = 'ok'; total = 1; status = 201;
    client.setQueryDefaults(AUTH_QUERY_KEY, { staleTime: Infinity }); client.setQueryData(AUTH_QUERY_KEY, identity);
    fetchMock.mockReset(); fetchMock.mockImplementation((url, options) => {
      if (url.endsWith('auth/me')) return Promise.resolve(Response.json(identity ?? {}, { status: identity ? 200 : 401 }));
      if (url.endsWith('auth/logout')) { identity = null; return Promise.resolve(new Response(null, { status: 204 })); }
      if (url.includes('/relationship-context?')) return Promise.resolve(Response.json({ target: row.target,
        restriction: total && row.state === 'ACTIVE' ? { id: row.id, reason: row.reason, createdAt: row.createdAt } : null,
        contactAllowed: !total || row.state !== 'ACTIVE', hasRelationshipHistory: false, hasRegisteredCommunicationHistory: false, communicationSummary: { total: 0, lastOccurredAt: null, lastDirection: null }, recentCommunications: [],
        activeIntents: { items: [], total: 0 }, activeProcesses: { items: [], total: 0 }, recentClosedProcesses: { items: [], total: 0 }, relatedOrganizationContext: { items: [], total: 0 } }));
      if (url.includes('/search?')) return Promise.resolve(Response.json({ query: 'QA', email: null,
        organizations: { items: [{ type: 'ORGANIZATION', id: goal, name: 'Fundación QA', alias: null, country: null, parent: null, duplicateOf: null, isActive: true }], total: 1, page: 1, pageSize: 25 },
        people: { items: [{ type: 'PERSON', id: goal, displayName: 'Persona QA', isActive: true, duplicateOf: null, currentRelations: [], currentRelationsTotal: 0 }], total: 1, page: 1, pageSize: 25 } }));
      if (options?.method === 'POST') {
        if (status !== 201) return Promise.resolve(Response.json({ code: status === 403 ? 'FORBIDDEN' : url.includes('contact-restrictions') ? 'VERSION_CONFLICT' : 'CONTACT_RESTRICTED' }, { status }));
        if (url.endsWith('/lift')) row = { ...row, state: 'LIFTED', canLift: false, version: 2, liftedAt: timestamp, liftedBy: row.registeredBy, liftReason: 'Decisión institucional' };
        return Promise.resolve(Response.json(row, { status: 201 }));
      }
      if (url.includes('/contact-restrictions')) {
        if (mode === 'pending') return new Promise<Response>(() => undefined);
        if (mode === 'error') return Promise.resolve(new Response(null, { status: 500 }));
        return Promise.resolve(Response.json(url.includes('?') ? { items: total && (!url.includes('state=ACTIVE') || row.state === 'ACTIVE') ? [row] : [], total: total && (!url.includes('state=ACTIVE') || row.state === 'ACTIVE') ? total : 0, page: 1, pageSize: 25 } : row));
      }
      if (url.endsWith('/contact-intents/' + id)) return Promise.resolve(Response.json(intention()));
      return Promise.resolve(new Response(null, { status: 404 }));
    }); vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => { client.clear(); vi.unstubAllGlobals(); });
  function view(path = '/contact-restrictions') { return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter></QueryClientProvider>); }
  const writes = () => fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST');
  it('UI 2.6 jerarquiza objetivo y estado sin perder motivo, autor ni detalle', async () => {
    view(); const results = screen.getByRole('region', { name: 'Resultados de restricciones' });
    expect(await within(results).findByRole('link', { name: row.reason })).toHaveAttribute('href', '/contact-restrictions/' + id);
    expect(within(results).getByRole('link', { name: row.target.label })).toHaveAttribute('href', '/organizations/' + goal);
    expect(screen.getByRole('heading', { level: 1, name: 'Restricciones de no contacto' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Registrar restricción' })).toHaveAttribute('href', '/contact-restrictions/new');
    expect(results).toHaveTextContent('Activa — no contactar'); expect(within(results).getByText('Registrada por')).toBeVisible(); expect(results.querySelectorAll('time')).toHaveLength(1);
  });
  it('UI 2.6 oculta registro sin capability y conserva historial de objetivo', async () => {
    identity = { ...initialIdentity, permissions: permissions.filter(p => p !== 'relationships.restriction.create') }; client.setQueryData(AUTH_QUERY_KEY, identity); view();
    await screen.findByRole('link', { name: row.reason }); expect(screen.queryByRole('link', { name: 'Registrar restricción' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver historial de este objetivo' })).toBeVisible();
  });
  it('UI 2.6 mantiene levantamiento, motivo y autores inactivos como historia', async () => {
    row = { ...row, state: 'LIFTED', registeredBy: { ...row.registeredBy, isActive: false }, liftedBy: { ...row.registeredBy, isActive: false }, liftedAt: timestamp, liftReason: 'Solicitud revocada expresamente' };
    view(); const results = screen.getByRole('region', { name: 'Resultados de restricciones' }); await within(results).findByRole('link', { name: row.reason });
    expect(results).toHaveTextContent('Levantada'); expect(results).toHaveTextContent('Motivo de levantamiento: Solicitud revocada expresamente'); expect(results).toHaveTextContent('(cuenta inactiva)'); expect(results.querySelectorAll('time')).toHaveLength(2);
  });
  it('UI 2.6 registro mantiene encabezado, regreso y error accesible sin escribir', async () => {
    view('/contact-restrictions/new'); expect(screen.getByRole('heading', { level: 1, name: 'Registrar restricción de no contacto' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Volver al listado' })).toHaveAttribute('href', '/contact-restrictions');
    await userEvent.click(screen.getByRole('button', { name: 'Revisar restricción' }));
    expect(screen.getByLabelText('Motivo de restricción')).toHaveAttribute('aria-invalid', 'true'); expect(screen.getByLabelText('Motivo de restricción')).toHaveAttribute('aria-describedby'); expect(writes()).toHaveLength(0);
  });
  it('listado carga', () => { mode = 'pending'; view(); expect(screen.getByText('Cargando…')).toBeVisible(); });
  it('listado vacío', async () => { total = 0; view(); expect(await screen.findByText('No hay restricciones para estos filtros.')).toBeVisible(); });
  it('listado error permite reintentar', async () => { mode = 'error'; view(); await screen.findByText('No se pudo cargar la información.'); mode = 'ok'; await userEvent.click(screen.getByRole('button', { name: 'Reintentar' })); expect(await screen.findByRole('link', { name: row.reason })).toBeVisible(); });
  it('lista, pagina y filtra estado/objetivo sin IDs manuales', async () => {
    total = 26; view(); await screen.findByRole('link', { name: row.reason }); await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.includes('page=2'))).toBe(true));
    await userEvent.selectOptions(screen.getByLabelText('Estado de restricciones'), 'LIFTED');
    await userEvent.click(screen.getByRole('button', { name: 'Ver historial de este objetivo' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.includes('organizationId=' + goal))).toBe(true));
  });
  it('alta exige motivo y actor antes de confirmar', async () => {
    view('/contact-restrictions/new'); await userEvent.click(screen.getByRole('button', { name: 'Revisar restricción' }));
    expect(await screen.findByText('Describe el motivo.')).toBeVisible(); expect(screen.getByText('Selecciona un objetivo del Directorio.')).toBeVisible(); expect(writes()).toHaveLength(0);
  });
  async function prepare(kind: 'organización' | 'persona' = 'organización') {
    await userEvent.type(screen.getByLabelText('Buscar objetivo por nombre'), 'QA');
    await userEvent.click(await screen.findByRole('button', { name: kind === 'organización' ? 'Seleccionar organización: Fundación QA' : 'Seleccionar persona: Persona QA' }));
    await userEvent.type(screen.getByLabelText('Motivo de restricción'), 'Solicitud expresa'); await userEvent.click(screen.getByRole('button', { name: 'Revisar restricción' }));
  }
  it.each(['organización', 'persona'] as const)('registra %s con confirmación, invalida cachés y preserva campos del servidor', async kind => {
    const invalidate = vi.spyOn(client, 'invalidateQueries'); view('/contact-restrictions/new'); await prepare(kind);
    expect(writes()).toHaveLength(0); await userEvent.click(screen.getByRole('button', { name: 'Confirmar registro' }));
    expect(await screen.findByRole('heading', { name: 'Restricción de no contacto' })).toBeVisible();
    expect(JSON.parse(writes()[0]?.[1]?.body as string)).toEqual({ reason: 'Solicitud expresa', ...(kind === 'organización' ? { organizationId: goal } : { personId: goal }) });
    for (const prefix of ['contact-restrictions', 'relationships', 'relationship-processes']) expect(invalidate).toHaveBeenCalledWith({ queryKey: [prefix, ownerId] });
  });
  it('volver sin registrar conserva borrador y no escribe', async () => {
    view('/contact-restrictions/new'); await prepare(); await userEvent.click(screen.getByRole('button', { name: 'Volver sin registrar' }));
    expect(screen.getByLabelText('Motivo de restricción')).toHaveValue('Solicitud expresa'); expect(writes()).toHaveLength(0);
  });
  it.each([403, 409])('alta %s conserva objetivo y motivo', async failure => {
    status = failure; view('/contact-restrictions/new'); await prepare(); await userEvent.click(screen.getByRole('button', { name: 'Confirmar registro' }));
    expect(await screen.findByText(failure === 403 ? 'No tienes permiso para realizar esta acción.' : 'La restricción cambió. Recarga y revisa su estado antes de continuar.')).toBeVisible();
    expect(screen.getByLabelText('Motivo de restricción')).toHaveValue('Solicitud expresa'); expect(screen.getByRole('button', { name: 'Confirmar registro' })).toBeDisabled();
  });
  it.each(['RESEARCH', 'PLANNING', 'sin capability', 'levantada'])('oculta levantar para %s', async context => {
    if (context === 'levantada') row = { ...row, state: 'LIFTED', canLift: false, liftedAt: timestamp, liftedBy: row.registeredBy, liftReason: 'Decisión' };
    else { row.canLift = false; identity = { ...initialIdentity, permissions: permissions.filter(p => !p.endsWith('.lift')), ...(context === 'RESEARCH' || context === 'PLANNING' ? { role: context } : {}) }; client.setQueryData(AUTH_QUERY_KEY, identity); }
    view('/contact-restrictions/' + id); await screen.findByText(row.reason); expect(screen.queryByRole('button', { name: 'Levantar restricción' })).not.toBeInTheDocument();
  });
  it('levantamiento exige motivo, confirma y conserva historial', async () => {
    view('/contact-restrictions/' + id); await screen.findByText(row.reason); await userEvent.click(screen.getByRole('button', { name: 'Levantar restricción' }));
    expect(await screen.findByText('Describe el motivo.')).toBeVisible(); expect(writes()).toHaveLength(0);
    await userEvent.type(screen.getByLabelText(/Motivo de levantamiento/), 'Decisión institucional'); await userEvent.click(screen.getByRole('button', { name: 'Levantar restricción' }));
    expect(writes()).toHaveLength(0); await userEvent.click(screen.getByRole('button', { name: 'Confirmar levantamiento' }));
    expect(await screen.findByText('Estado: Levantada')).toBeVisible(); expect(screen.getByText(row.reason)).toBeVisible();
    expect(JSON.parse(writes()[0]?.[1]?.body as string)).toEqual({ reason: 'Decisión institucional', expectedVersion: 1 });
  });
  it.each([403, 409])('levantamiento %s conserva motivo y permite recargar', async failure => {
    status = failure; view('/contact-restrictions/' + id); await screen.findByText(row.reason);
    await userEvent.type(screen.getByLabelText('Motivo de levantamiento'), 'Decisión institucional'); await userEvent.click(screen.getByRole('button', { name: 'Levantar restricción' })); await userEvent.click(screen.getByRole('button', { name: 'Confirmar levantamiento' }));
    expect(await screen.findByText(failure === 403 ? 'No tienes permiso para realizar esta acción.' : 'La restricción cambió. Recarga y revisa su estado antes de continuar.')).toBeVisible();
    expect(screen.getByLabelText('Motivo de levantamiento')).toHaveValue('Decisión institucional');
    await userEvent.click(screen.getByRole('button', { name: 'Recargar restricción y revisar estado' })); await waitFor(() => expect(screen.queryByRole('button', { name: 'Confirmar levantamiento' })).not.toBeInTheDocument());
  });
  it.each(['/contact-intents/new', '/relationship-processes/new'])('restricción activa bloquea formulario %s con aviso crítico', async path => {
    view(path); await userEvent.type(screen.getByLabelText('Buscar objetivo por nombre'), 'QA'); await userEvent.click(await screen.findByRole('button', { name: 'Seleccionar organización: Fundación QA' }));
    expect(await screen.findByText('RESTRICCIÓN ACTIVA — NO CONTACTAR')).toBeVisible();
    expect(screen.getByRole('button', { name: path.includes('contact-intents') ? 'Guardar intención' : 'Guardar proceso' })).toBeDisabled(); expect(writes()).toHaveLength(0);
  });
  it.each(['/contact-intents/new', '/relationship-processes/new'])('alta tardía de restricción rechazada por servidor en %s conserva borrador', async path => {
    total = 0; status = 409; view(path); await userEvent.type(screen.getByLabelText('Buscar objetivo por nombre'), 'QA'); await userEvent.click(await screen.findByRole('button', { name: 'Seleccionar organización: Fundación QA' }));
    await userEvent.type(screen.getByLabelText('Propósito'), 'Borrador institucional'); await userEvent.click(screen.getByRole('button', { name: path.includes('contact-intents') ? 'Guardar intención' : 'Guardar proceso' }));
    expect(await screen.findByText(/No se puede iniciar este acercamiento/)).toBeVisible(); expect(screen.getByLabelText('Propósito')).toHaveValue('Borrador institucional');
  });
  it('intención previa sigue visible pero no puede convertirse con restricción', async () => {
    view('/contact-intents/' + id); expect(await screen.findByText('RESTRICCIÓN ACTIVA — NO CONTACTAR')).toBeVisible();
    expect(screen.getByText(intention().purpose)).toBeVisible(); expect(screen.queryByRole('button', { name: 'Convertir en proceso' })).not.toBeInTheDocument();
  });
  it('levantada no bloquea nuevas actuaciones', async () => {
    row.state = 'LIFTED'; view('/contact-intents/' + id);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Convertir en proceso' })).toBeEnabled()); expect(screen.queryByText('RESTRICCIÓN ACTIVA — NO CONTACTAR')).not.toBeInTheDocument();
  });
  it('ruta sin permiso no consulta restricciones', () => { client.setQueryData(AUTH_QUERY_KEY, { ...identity, permissions: ['directory.read'] }); view(); expect(screen.getByRole('alert')).toHaveTextContent('No tienes permiso'); expect(fetchMock.mock.calls.some(([url]) => url.includes('contact-restrictions'))).toBe(false); });
  it.each(['logout', 'rol', 'permiso'])('caché se limpia por %s', async change => {
    client.setQueryData([...restrictionIdentityKey(initialIdentity), 'detail', id], row);
    const next = change === 'logout' ? null : { ...initialIdentity, ...(change === 'rol' ? { role: 'RESEARCH' as const } : { permissions: ['directory.read'] }) };
    await clearForbiddenRestrictions(client, next); expect(client.getQueryCache().findAll({ queryKey: ['contact-restrictions'] })).toHaveLength(0);
  });
  it('respuesta tardía tras logout no repuebla caché ni navega', async () => {
    let finish!: (response: Response) => void; const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url, options) => options?.method === 'POST' && url.endsWith('/contact-restrictions') ? new Promise(resolve => { finish = resolve; }) : original(url, options));
    view('/contact-restrictions/new'); await prepare(); await userEvent.click(screen.getByRole('button', { name: 'Confirmar registro' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' })); await screen.findByRole('heading', { name: 'Iniciar sesión' });
    await act(async () => finish(Response.json(row, { status: 201 })));
    expect(client.getQueryCache().findAll({ queryKey: ['contact-restrictions'] })).toHaveLength(0); expect(screen.queryByRole('heading', { name: 'Restricción de no contacto' })).not.toBeInTheDocument();
  });
});
