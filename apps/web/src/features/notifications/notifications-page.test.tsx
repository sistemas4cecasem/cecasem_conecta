import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { createQueryClient } from '../../lib/query/query-client';
import { AUTH_QUERY_KEY, type AuthIdentity } from '../auth/session';
import { NotificationIndicator, NotificationsPage } from './notifications-page';
import { clearForbiddenNotifications, notificationIdentityKey } from './queries';

const identity: AuthIdentity = { id: '22222222-2222-4222-8222-222222222222', givenNames: 'Ana', familyNames: 'QA',
  username: 'ana', email: 'ana@example.test', role: 'PLANNING', permissions: ['notifications.read', 'notifications.mark_read'] };
const fixture = { id: '11111111-1111-4111-8111-111111111111', type: 'OPPORTUNITY_CREATED', createdAt: '2026-10-04T10:00:00.000Z', readAt: null as string | null,
  opportunity: { id: '33333333-3333-4333-8333-333333333333', name: 'Beca institucional', status: 'PENDING_REVIEW' } };
function Destination() { const location = useLocation(); const state: unknown = location.state;
  return <p>Detalle de oportunidad{state && typeof state === 'object' && 'notificationReadFailed' in state && state.notificationReadFailed ? ' · Lectura pendiente' : ''}</p>; }

describe('Notificaciones propias', () => {
  let client = createQueryClient(), rows = [structuredClone(fixture)], failList = false, failRead = false;
  const fetchMock = vi.fn<(url: string, options?: RequestInit) => Promise<Response>>();
  beforeEach(() => {
    client = createQueryClient(); client.setQueryData(AUTH_QUERY_KEY, identity);
    rows = [structuredClone(fixture)]; failList = failRead = false; fetchMock.mockReset();
    fetchMock.mockImplementation(async (url, options) => {
      if (url.endsWith('/auth/me')) return Response.json(identity);
      if (url.endsWith('/unread-count')) return Response.json({ count: rows.filter(row => !row.readAt).length });
      if (options?.method === 'PATCH') {
        if (failRead) return Response.json({}, { status: 503 });
        rows[0]!.readAt ??= '2026-10-04T10:01:00.000Z'; return Response.json(rows[0]);
      }
      if (failList) return Response.json({}, { status: 503 });
      return Response.json({ items: rows, nextCursor: null });
    });
    vi.stubGlobal('fetch', fetchMock);
  });
  function view() {
    return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/notifications']}>
      <NotificationIndicator identity={identity} />
      <Routes><Route path="notifications" element={<NotificationsPage />} />
        <Route path="opportunities/:id" element={<Destination />} /></Routes>
    </MemoryRouter></QueryClientProvider>);
  }
  it.each(['ADMINISTRATOR','BOARD','RESEARCH','PLANNING'] as const)('UI 2.11 %s conserva bandeja propia e indicador coherente',async role=>{
    const current={...identity,role};client.setQueryData(AUTH_QUERY_KEY,current);
    const original=fetchMock.getMockImplementation()!;fetchMock.mockImplementation((url,o)=>url.endsWith('/auth/me')?Promise.resolve(Response.json(current)):original(url,o));
    render(<QueryClientProvider client={client}><MemoryRouter><NotificationIndicator identity={current}/><NotificationsPage/></MemoryRouter></QueryClientProvider>);
    expect(await screen.findByText('Beca institucional')).toBeVisible();
    expect(await screen.findByLabelText('1 notificaciones no leídas')).toBeVisible();
    expect(screen.getByText('No leídas: 1')).toBeVisible();expect(screen.getByRole('button',{name:'Abrir oportunidad'})).toBeEnabled();
    expect(fetchMock.mock.calls.some(([,o])=>o?.method==='PATCH')).toBe(false);
  });
  it('UI 2.11 cursor pendiente conserva filas y bloquea doble carga',async()=>{
    let complete!:(r:Response)=>void;
    fetchMock.mockImplementation(async url=>url.endsWith('/auth/me')?Response.json(identity):url.endsWith('/unread-count')?Response.json({count:1}):url.includes('after=cursor')?new Promise(resolve=>{complete=resolve;}):Response.json({items:[fixture],nextCursor:'cursor'}));
    view();await userEvent.click(await screen.findByRole('button',{name:'Cargar más notificaciones'}));
    expect(screen.getByRole('button',{name:'Cargando…'})).toBeDisabled();expect(screen.getByRole('button',{name:'Cargando…'})).toHaveAttribute('aria-busy','true');
    expect(screen.getByText('Beca institucional')).toBeVisible();
    await act(async()=>complete(Response.json({items:[],nextCursor:null})));
    await waitFor(()=>expect(screen.queryByRole('button',{name:'Cargando…'})).not.toBeInTheDocument());
    expect(fetchMock.mock.calls.filter(([url])=>url.includes('after=cursor'))).toHaveLength(1);
  });
  it('UI 2.11 presenta cabecera, filas mixtas y fechas sin marcar lectura al cargar',async()=>{
    rows=[structuredClone(fixture),{...structuredClone(fixture),id:'44444444-4444-4444-8444-444444444444',readAt:'2026-10-04T10:01:00.000Z'}];
    view(); await screen.findByRole('region',{name:'Listado de notificaciones'});
    expect(screen.getAllByRole('heading',{level:1})).toHaveLength(1);
    expect(screen.getAllByRole('heading',{name:'Nueva oportunidad',level:2})).toHaveLength(2);
    expect(screen.getByText('No leída')).toBeVisible();expect(screen.getByText('Leída')).toBeVisible();
    expect(screen.getAllByText('Generada')).toHaveLength(2);
    expect(screen.getByLabelText('Mostrar')).toHaveValue('all');
    expect(fetchMock.mock.calls.some(([,o])=>o?.method==='PATCH')).toBe(false);
  });
  it('UI 2.11 carga inicial es accesible y no ofrece acciones antes de recibir datos',async()=>{
    let complete!:(r:Response)=>void;
    fetchMock.mockImplementation(async url=>url.endsWith('/auth/me')?Response.json(identity):url.endsWith('/unread-count')?Response.json({count:0}):new Promise(resolve=>{complete=resolve;}));
    view();expect(screen.getByRole('status')).toHaveTextContent('Cargando notificaciones…');
    expect(screen.queryByRole('button',{name:'Abrir oportunidad'})).not.toBeInTheDocument();
    await act(async()=>complete(Response.json({items:[],nextCursor:null})));
    expect(await screen.findByText('No tienes notificaciones en este listado.')).toBeVisible();
  });
  it('UI 2.11 sin capability de lectura oculta indicador y no consulta avisos',async()=>{
    const denied={...identity,permissions:[]}; client.setQueryData(AUTH_QUERY_KEY,denied);
    fetchMock.mockImplementation(async()=>Response.json(denied));
    render(<QueryClientProvider client={client}><MemoryRouter><NotificationIndicator identity={denied}/><NotificationsPage/></MemoryRouter></QueryClientProvider>);
    expect(screen.getByRole('alert')).toHaveTextContent('No tienes acceso');
    expect(screen.queryByRole('link',{name:/Notificaciones/})).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url])=>url.includes('/notifications'))).toBe(false);
  });
  it('UI 2.11 abrir sin capability de marcado conserva navegación sin PATCH',async()=>{
    const readonly={...identity,permissions:['notifications.read']};client.setQueryData(AUTH_QUERY_KEY,readonly);
    const original=fetchMock.getMockImplementation()!;fetchMock.mockImplementation((url,o)=>url.endsWith('/auth/me')?Promise.resolve(Response.json(readonly)):original(url,o));
    view();await userEvent.click(await screen.findByRole('button',{name:'Abrir oportunidad'}));
    expect(await screen.findByText('Detalle de oportunidad · Lectura pendiente')).toBeVisible();
    expect(fetchMock.mock.calls.some(([,o])=>o?.method==='PATCH')).toBe(false);
  });
  it('UI 2.11 lectura pendiente bloquea una segunda apertura sin cambiar contador anticipadamente',async()=>{
    let complete!:(r:Response)=>void;const original=fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url,o)=>o?.method==='PATCH'?new Promise(resolve=>{complete=resolve;}):original(url,o));
    view();await userEvent.click(await screen.findByRole('button',{name:'Abrir oportunidad'}));
    expect(screen.getByRole('button',{name:'Abriendo…'})).toBeDisabled();expect(screen.getByRole('button',{name:'Abriendo…'})).toHaveAttribute('aria-busy','true');
    expect(screen.getByLabelText('1 notificaciones no leídas')).toBeVisible();
    await act(async()=>{rows[0]!.readAt='2026-10-04T10:01:00.000Z';complete(Response.json(rows[0]));});
    expect(await screen.findByText('Detalle de oportunidad')).toBeVisible();
  });
  it('muestra badge accesible, oportunidad, fecha y no leído', async () => {
    view(); expect(await screen.findByLabelText('1 notificaciones no leídas')).toHaveTextContent('1');
    expect(await screen.findByText('Beca institucional')).toBeVisible(); expect(screen.getByText('No leída')).toBeVisible();
  });
  it('oculta badge cero y muestra listado vacío', async () => { rows = []; view();
    expect(await screen.findByText('No tienes notificaciones en este listado.')).toBeVisible();
    expect(screen.queryByLabelText(/notificaciones no leídas/)).not.toBeInTheDocument();
  });
  it('muestra error y permite reintentar', async () => { failList = true; view();
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron cargar'); failList = false;
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' })); expect(await screen.findByText('Beca institucional')).toBeVisible();
  });
  it('abre, confirma lectura y actualiza contador', async () => { view();
    await userEvent.click(await screen.findByRole('button', { name: 'Abrir oportunidad' }));
    expect(await screen.findByText('Detalle de oportunidad')).toBeVisible();
    await waitFor(() => expect(screen.queryByLabelText(/notificaciones no leídas/)).not.toBeInTheDocument());
    expect(fetchMock.mock.calls.some(([url, options]) => url.endsWith('/read') && options?.method === 'PATCH')).toBe(true);
  });
  it('un fallo de lectura conserva navegación y señala sincronización pendiente', async () => { failRead = true; view();
    await userEvent.click(await screen.findByRole('button', { name: 'Abrir oportunidad' }));
    expect(await screen.findByText('Detalle de oportunidad · Lectura pendiente')).toBeVisible();
    expect(screen.getByLabelText('1 notificaciones no leídas')).toBeVisible();
  });
  it('abrir una notificación ya leída no vuelve a enviar PATCH', async () => { rows[0]!.readAt = '2026-10-04T10:01:00.000Z'; view();
    await userEvent.click(await screen.findByRole('button', { name: 'Abrir oportunidad' }));
    expect(await screen.findByText('Detalle de oportunidad')).toBeVisible();
    expect(fetchMock.mock.calls.some(([, options]) => options?.method === 'PATCH')).toBe(false);
  });
  it('filtra con consulta al servidor', async () => { view(); await screen.findByText('Beca institucional');
    await userEvent.selectOptions(screen.getByRole('combobox'), 'unread');
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.includes('status=unread'))).toBe(true));
  });
  it('pagina por cursor sin duplicar filas', async () => {
    fetchMock.mockImplementation(async url => {
      if (url.endsWith('/auth/me')) return Response.json(identity);
      if (url.endsWith('/unread-count')) return Response.json({ count: 2 });
      return Response.json(url.includes('after=cursor') ? { items: [{ ...fixture, id: '44444444-4444-4444-8444-444444444444', opportunity: { ...fixture.opportunity, name: 'Segunda convocatoria' } }], nextCursor: null }
        : { items: [fixture], nextCursor: 'cursor' });
    }); view(); await userEvent.click(await screen.findByRole('button', { name: 'Cargar más notificaciones' }));
    expect(await screen.findByText('Segunda convocatoria')).toBeVisible(); expect(screen.getAllByText('Beca institucional')).toHaveLength(1);
  });
  it('cancela y elimina avisos de la identidad anterior', async () => {
    const previous = ['notifications', ...notificationIdentityKey(identity), 'list']; client.setQueryData(previous, { private: true });
    client.setQueryData(['opportunities', 'otra'], { retained: true });
    await clearForbiddenNotifications(client, { ...identity, id: 'otro' });
    expect(client.getQueryData(previous)).toBeUndefined(); expect(client.getQueryData(['opportunities', 'otra'])).toEqual({ retained: true });
  });
  it('descarta respuesta tardía de consulta tras cambio de usuario', async () => {
    let release!: (response: Response) => void;
    fetchMock.mockImplementation(async url => url.endsWith('/auth/me') ? Response.json(identity)
      : url.endsWith('/unread-count') ? Response.json({ count: 0 }) : new Promise<Response>(resolve => { release = resolve; }));
    view(); await waitFor(() => expect(release).toBeDefined());
    act(() => client.setQueryData(AUTH_QUERY_KEY, { ...identity, id: 'otro' }));
    await act(async () => { release(Response.json({ items: [fixture], nextCursor: null })); await clearForbiddenNotifications(client, null); });
    expect(screen.queryByText('Beca institucional')).not.toBeInTheDocument();
  });
});
