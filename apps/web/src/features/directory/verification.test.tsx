import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../../app/router/app-routes';
import { createQueryClient } from '../../lib/query/query-client';
import { AUTH_QUERY_KEY, type AuthIdentity } from '../auth/session';
import { VerificationSettingsPage } from '../settings/verification-settings-page';
import { clearForbiddenDirectory } from './queries';
import { VerificationPanel } from './verification-panel';
import type { VerificationCondition } from './verification.contracts';

const actor = { id: 'author', givenNames: 'Ana', familyNames: 'QA', isActive: true };
const stamp = '2026-01-31T12:00:00.000Z';
const reader: AuthIdentity = { id: 'reader', givenNames: 'Lector', familyNames: 'QA', username: 'reader', email: 'reader@example.test', role: 'RESEARCH',
  permissions: ['directory.read', 'directory.history.read', 'directory.verify', 'directory.write'] };
const initial: VerificationCondition = { objectType: 'person', classification: 'personal', intervalMonths: 6, verificationStatus: 'NEVER_VERIFIED',
  lastVerifiedAt: null, lastVerifiedBy: null, nextReviewAt: null, changedSinceVerification: false, timeReviewDue: false, version: 1, contactValueVersion: null };
const event = (id = 'event') => ({ id, objectType: 'person', verifiedAt: stamp, actor, sourceDescription: 'Consulta directa', sourceUrl: 'https://example.test/fuente' });
describe('Corroboración y configuración de intervalos', () => {
  let client = createQueryClient(), identity = reader, condition = initial, history = [event()], mode = 'ok', loggedOut = false;
  let configuration = { personalVerificationMonths: 6, institutionalVerificationMonths: 12, version: 1 };
  const fetchMock = vi.fn<(url: string, options?: RequestInit) => Promise<Response>>();
  beforeEach(() => {
    client = createQueryClient(); identity = { ...reader }; condition = { ...initial }; history = [event()]; mode = 'ok'; loggedOut = false;
    configuration = { personalVerificationMonths: 6, institutionalVerificationMonths: 12, version: 1 };
    fetchMock.mockReset(); fetchMock.mockImplementation((url, options) => {
      const path = url.replace('/api/v1/', '');
      if (path === 'auth/me') return Promise.resolve(Response.json(loggedOut ? {} : identity, { status: loggedOut ? 401 : 200 }));
      if (path === 'auth/logout') { loggedOut = true; return Promise.resolve(new Response(null, { status: 204 })); }
      if (path === 'settings/verification') {
        if (options?.method === 'PUT') {
          if (mode === 'settingsForbidden') return Promise.resolve(new Response(null, { status: 403 }));
          if (mode === 'settingsConflict') return Promise.resolve(Response.json({ message: 'Conflicto' }, { status: 409 }));
          const body = JSON.parse(options.body as string) as { personalVerificationMonths: number; institutionalVerificationMonths: number };
          configuration = { ...body, version: configuration.version + 1 };
          condition = { ...condition, intervalMonths: body.personalVerificationMonths, verificationStatus: body.personalVerificationMonths < 6 ? 'REVIEW_DUE' : 'CURRENT',
            timeReviewDue: body.personalVerificationMonths < 6, nextReviewAt: body.personalVerificationMonths < 6 ? '2026-05-31T12:00:00.000Z' : '2026-07-31T12:00:00.000Z' };
        }
        return Promise.resolve(Response.json(configuration));
      }
      if (path.endsWith('/verification')) {
        if (mode === 'pending') return new Promise<Response>(() => undefined);
        if (mode === 'error') return Promise.resolve(new Response(null, { status: 500 }));
        const contextual = path.startsWith('organization-contacts');
        return Promise.resolve(Response.json(contextual ? { ...initial, objectType: 'organizationContact', classification: 'institutional', intervalMonths: 12, contactValueVersion: 1 } : condition));
      }
      if (path.includes('/verifications?')) {
        if (mode === 'historyError') return Promise.resolve(new Response(null, { status: 500 }));
        const page = Number(new URL(url, 'https://local.test').searchParams.get('page'));
        return Promise.resolve(Response.json({ items: history.slice((page - 1) * 25, page * 25), page, pageSize: 25, total: history.length }));
      }
      if (path.endsWith('/verify')) {
        if (mode === 'forbidden') return Promise.resolve(new Response(null, { status: 403 }));
        if (mode === 'conflict') return Promise.resolve(Response.json({ code: 'VERSION_CONFLICT' }, { status: 409 }));
        condition = { ...condition, verificationStatus: 'CURRENT', lastVerifiedAt: stamp, lastVerifiedBy: actor, nextReviewAt: '2026-07-31T12:00:00.000Z', changedSinceVerification: false, timeReviewDue: false };
        history = [event('new'), ...history]; return Promise.resolve(Response.json({ event: event('new'), condition }, { status: 201 }));
      }
      if (path === 'people/person') return Promise.resolve(Response.json({ id: 'person', displayName: 'Persona QA', givenNames: null, familyNames: null,
        isActive: true, version: condition.version, createdAt: stamp, updatedAt: stamp, lastVerifiedAt: condition.lastVerifiedAt, currentRelationsCount: 0 }));
      if (path.includes('/history?') || /\/(relations|contacts)\?/.test(path)) return Promise.resolve(Response.json({ items: [], total: 0, page: 1, pageSize: 25 }));
      return Promise.resolve(new Response(null, { status: 404 }));
    }); vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => { client.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
  function current() { condition = { ...condition, verificationStatus: 'CURRENT', lastVerifiedAt: stamp, lastVerifiedBy: actor, nextReviewAt: '2026-07-31T12:00:00.000Z' }; }
  function view(settings = false, shared = false, fullApp = false) {
    return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/people/person']}>
      {fullApp ? <AppRoutes /> : <><VerificationPanel identity={identity} path="people/person" label="persona QA" contact={shared} />
        {shared && <VerificationPanel identity={identity} path="organization-contacts/contact" label="contacto institucional QA" contact />}
        {settings && <VerificationSettingsPage />}</>}
    </MemoryRouter></QueryClientProvider>);
  }
  async function openForm() { await userEvent.setup().click(await screen.findByRole('button', { name: 'Marcar verificado: persona QA' })); }
  async function confirm() { const user = userEvent.setup(); await user.click(screen.getByRole('checkbox')); await user.click(screen.getByRole('button', { name: 'Confirmar verificación' })); }
  function administrator() { identity = { ...reader, role: 'ADMINISTRATOR', permissions: [...reader.permissions, 'settings.verification.update'] }; }
  it('nunca verificado no inventa autor, fecha ni vencimiento', async () => { view(); expect(await screen.findByText('Nunca verificado')).toBeVisible(); expect(screen.getByText(/Sin fecha hasta la primera verificación/)).toBeVisible(); expect(screen.queryByText(/Verificó:/)).not.toBeInTheDocument(); });
  it('vigente muestra autor, próxima revisión y meses efectivos del servidor', async () => { current(); view(); expect(await screen.findByText('Verificado')).toBeVisible(); expect(screen.getByText('Verificó: Ana QA')).toBeVisible(); expect(screen.getByText(/Intervalo: 6 meses calendario/)).toBeVisible(); });
  it.each(['changed', 'time', 'both'])('revisión pendiente explica causa %s sin calcular con el reloj del navegador', async cause => {
    current(); condition = { ...condition, verificationStatus: 'REVIEW_DUE', changedSinceVerification: cause !== 'time', timeReviewDue: cause !== 'changed' }; view();
    expect(await screen.findByText('Revisión pendiente')).toBeVisible(); expect(!!screen.queryByText(/Hubo cambios posteriores/)).toBe(cause !== 'time'); expect(!!screen.queryByText(/Venció el intervalo/)).toBe(cause !== 'changed');
  });
  it('confirmación es obligatoria y el objeto está identificado', async () => {
    view(); await openForm(); await userEvent.setup().click(screen.getByRole('button', { name: 'Confirmar verificación' }));
    expect(await screen.findByText('Confirme que corroboró la información de este objeto.')).toBeVisible(); expect(screen.getByRole('form', { name: 'Corroborar persona QA' })).toHaveTextContent('Está corroborando únicamente: persona QA');
    expect(fetchMock.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false);
  });
  it('verifica explícitamente, conserva evidencia y refresca estado/historial/ficha', async () => {
    view(); await userEvent.setup().click(await screen.findByRole('button', { name: /Ver historial de verificaciones/ })); await screen.findByText('Fuente: Consulta directa');
    client.setQueryData(['directory', identity.id, 'person', 'person'], { old: true });
    await openForm(); await userEvent.setup().type(screen.getByLabelText('Fuente de corroboración (opcional)'), ' Consulta telefónica '); await confirm();
    expect(await screen.findByText('Verificado')).toBeVisible(); await waitFor(() => expect(screen.getByText('Página 1 de 1 · 2 registros')).toBeVisible());
    const call = fetchMock.mock.calls.find(([url]) => url.endsWith('/verify'))!;
    expect(JSON.parse(call[1]?.body as string)).toEqual({ expectedVersion: 1, sourceDescription: 'Consulta telefónica', sourceUrl: null });
    expect(client.getQueryState(['directory', identity.id, 'person', 'person'])?.isInvalidated).toBe(true);
    expect(screen.queryByRole('form', { name: 'Corroborar persona QA' })).not.toBeInTheDocument();
  });
  it('cancelar no crea ningún evento', async () => { view(); await openForm(); await userEvent.setup().click(screen.getByRole('button', { name: 'Cancelar verificación' })); expect(fetchMock.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false); });
  it('rechaza URL de evidencia inválida antes de enviar', async () => { view(); await openForm(); await userEvent.setup().type(screen.getByLabelText('URL de corroboración (opcional)'), 'javascript:alert(1)'); await confirm(); expect(await screen.findByRole('alert')).toBeVisible(); expect(fetchMock.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false); });
  it('sin capability no presenta acción aunque pueda leer condición e historial', async () => { identity = { ...reader, permissions: ['directory.read', 'directory.history.read'] }; view(); await screen.findByText('Nunca verificado'); expect(screen.queryByRole('button', { name: /Marcar verificado/ })).not.toBeInTheDocument(); });
  it('403 en corroboración conserva evidencia y permite cancelar', async () => { mode = 'forbidden'; view(); await openForm(); await userEvent.setup().type(screen.getByLabelText('Fuente de corroboración (opcional)'), 'Mi evidencia'); await confirm(); expect(await screen.findByText('No tienes permiso para realizar esta acción.')).toBeVisible(); expect(screen.getByLabelText('Fuente de corroboración (opcional)')).toHaveValue('Mi evidencia'); });
  it('409 no reenvía con una versión nueva sin revisar y confirmar otra vez', async () => {
    mode = 'conflict'; view(); await openForm(); await confirm(); await screen.findByText(/La ficha cambió desde que la abriste/);
    mode = 'ok'; condition = { ...condition, version: 2 }; await userEvent.setup().click(screen.getByRole('button', { name: 'Recargar ficha y descartar cambios' }));
    await waitFor(() => expect(screen.queryByText(/La ficha cambió desde que la abriste/)).not.toBeInTheDocument()); expect(screen.getByRole('checkbox')).not.toBeChecked();
    await confirm(); await screen.findByText('Verificado'); const calls = fetchMock.mock.calls.filter(([url]) => url.endsWith('/verify'));
    expect(calls).toHaveLength(2); expect(JSON.parse(calls[1]![1]?.body as string)).toMatchObject({ expectedVersion: 2 });
  });
  it('historial vacío es explícito', async () => { history = []; view(); await userEvent.setup().click(await screen.findByRole('button', { name: /Ver historial de verificaciones/ })); expect(await screen.findByText('Aún no hay corroboraciones registradas.')).toBeVisible(); });
  it('historial pagina eventos y mantiene autores desactivados y fuentes', async () => {
    history = Array.from({ length: 26 }, (_, index) => ({ ...event('event' + index), actor: { ...actor, isActive: false }, sourceDescription: 'Fuente ' + index })); view();
    await userEvent.setup().click(await screen.findByRole('button', { name: /Ver historial de verificaciones/ })); await screen.findByText('Fuente: Fuente 0'); expect(screen.getAllByText(/Usuario actualmente desactivado/)).toHaveLength(25);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Siguiente' })); expect(await screen.findByText('Fuente: Fuente 25')).toBeVisible(); expect(screen.queryByText('Fuente: Fuente 0')).not.toBeInTheDocument(); expect(screen.getByRole('link', { name: 'https://example.test/fuente' })).toHaveAttribute('rel', 'noreferrer');
  });
  it.each(['error', 'historyError'])('error %s tiene reintento funcional', async state => { mode = state; view(); if (state === 'historyError') await userEvent.setup().click(await screen.findByRole('button', { name: /Ver historial de verificaciones/ })); await screen.findByText('No se pudo cargar la información.'); mode = 'ok'; await userEvent.setup().click(screen.getByRole('button', { name: 'Reintentar' })); expect(await screen.findByText(state === 'error' ? 'Nunca verificado' : 'Fuente: Consulta directa')).toBeVisible(); });
  it('condición en carga no habilita corroboración', async () => { mode = 'pending'; view(); expect(await screen.findByText('Cargando…')).toBeVisible(); expect(screen.queryByRole('button', { name: /Marcar verificado/ })).not.toBeInTheDocument(); });
  it('un medio compartido se corrobora por asociación y conserva la institucional sin verificar', async () => {
    condition = { ...condition, objectType: 'personContact', contactValueVersion: 3 }; view(false, true); await openForm(); await confirm();
    expect(await screen.findByText('Verificado')).toBeVisible(); const institutional = screen.getByRole('region', { name: 'Verificación de contacto institucional QA' });
    expect(within(institutional).getByText('Nunca verificado')).toBeVisible(); expect(within(institutional).getByText(/No verifica otras asociaciones/)).toBeVisible();
    expect(JSON.parse(fetchMock.mock.calls.find(([url]) => url.endsWith('/verify'))![1]?.body as string)).toMatchObject({ expectedContactValueVersion: 3 });
  });
  it('Administración reduce/restaura intervalo y refresca condición sin reescribir historial', async () => {
    administrator(); current(); view(true); await screen.findByLabelText('Información personal (meses)'); await userEvent.setup().click(screen.getByRole('button', { name: /Ver historial de verificaciones/ })); await screen.findByText('Fuente: Consulta directa');
    const before = structuredClone(history), user = userEvent.setup(), field = screen.getByLabelText('Información personal (meses)');
    await user.clear(field); await user.type(field, '4'); await user.click(screen.getByRole('button', { name: 'Guardar intervalos' }));
    expect(await screen.findByText('Revisión pendiente')).toBeVisible(); expect(await screen.findByText(/Intervalos guardados/)).toBeVisible(); expect(history).toEqual(before);
    await user.clear(screen.getByLabelText('Información personal (meses)')); await user.type(screen.getByLabelText('Información personal (meses)'), '6'); await user.click(screen.getByRole('button', { name: 'Guardar intervalos' }));
    expect(await screen.findByText('Verificado')).toBeVisible(); expect(history).toEqual(before);
    const calls = fetchMock.mock.calls.filter(([, options]) => options?.method === 'PUT'); expect(calls).toHaveLength(2); expect(JSON.parse(calls[1]![1]?.body as string)).toMatchObject({ expectedVersion: 2 });
  });
  it('no administrador no obtiene formulario de configuración', async () => { view(true); expect(await screen.findByText('No tiene permiso para modificar los intervalos de verificación.')).toBeVisible(); expect(screen.queryByLabelText('Información personal (meses)')).not.toBeInTheDocument(); expect(fetchMock.mock.calls.some(([url]) => url.endsWith('settings/verification'))).toBe(false); });
  it('403 al guardar settings conserva propuesta', async () => { administrator(); mode = 'settingsForbidden'; view(true); const field = await screen.findByLabelText('Información personal (meses)'); await userEvent.setup().clear(field); await userEvent.setup().type(field, '4'); await userEvent.setup().click(screen.getByRole('button', { name: 'Guardar intervalos' })); expect(await screen.findByText('No tienes permiso para realizar esta acción.')).toBeVisible(); expect(field).toHaveValue(4); });
  it('conflicto de settings permite recargar explícitamente y usar nueva versión', async () => {
    administrator(); mode = 'settingsConflict'; view(true); await screen.findByLabelText('Información personal (meses)'); await userEvent.setup().click(screen.getByRole('button', { name: 'Guardar intervalos' }));
    await screen.findByText('Los intervalos cambiaron. Recarga y revisa tu propuesta.'); configuration = { ...configuration, personalVerificationMonths: 5, version: 2 }; mode = 'ok';
    await userEvent.setup().click(screen.getByRole('button', { name: 'Recargar ficha y descartar cambios' })); await waitFor(() => expect(screen.getByLabelText('Información personal (meses)')).toHaveValue(5));
    await userEvent.setup().click(screen.getByRole('button', { name: 'Guardar intervalos' })); await screen.findByText(/Intervalos guardados/); const calls = fetchMock.mock.calls.filter(([, options]) => options?.method === 'PUT'); expect(calls).toHaveLength(2); expect(JSON.parse(calls[1]![1]?.body as string)).toMatchObject({ expectedVersion: 2 });
  });
  it('logout elimina condiciones, historial y settings de la identidad anterior', async () => {
    view(false, false, true); await screen.findByText('Nunca verificado'); client.setQueryData(['directory', reader.id, 'verifications', 'people/person', 1], history); client.setQueryData(['directory', reader.id, 'settings-verification'], configuration);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Cerrar sesión' })); await screen.findByRole('heading', { name: /Iniciar sesión/ });
    expect(client.getQueryCache().findAll({ queryKey: ['directory'] })).toHaveLength(0); expect(client.getQueryData(AUTH_QUERY_KEY)).toBeNull();
  });
  it('pérdida de lectura de historial/cambio de identidad limpia queries de verificaciones', async () => {
    client.setQueryData(['directory', reader.id, 'verifications', 'people/person', 1], history); client.setQueryData(['directory', reader.id, 'verification', 'people/person'], initial);
    await clearForbiddenDirectory(client, { ...reader, permissions: ['directory.read'] }); expect(client.getQueryData(['directory', reader.id, 'verifications', 'people/person', 1])).toBeUndefined();
    expect(client.getQueryData(['directory', reader.id, 'verification', 'people/person'])).toEqual(initial); await clearForbiddenDirectory(client, { ...reader, id: 'other' }); expect(client.getQueryCache().findAll({ queryKey: ['directory'] })).toHaveLength(0);
  });
});
