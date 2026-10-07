import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '../../lib/query/query-client';
import { AUTH_QUERY_KEY, type AuthIdentity } from '../auth/session';
import { HomePage } from './home-page';
import { clearForbiddenDashboard, dashboardIdentityKey, invalidateDashboard } from './dashboard-queries';

const actor = (role: AuthIdentity['role']): AuthIdentity => ({ id: 'dashboard-user', givenNames: 'QA', familyNames: 'Panel', username: 'qa', email: 'qa@example.test', role,
  permissions: ['relationships.process.read', 'relationships.intent.read', 'opportunities.read', 'meetings.read', 'directory.read', 'notifications.read'] });
const meeting = { id: '11111111-1111-4111-8111-111111111111', purpose: 'Reunión de coordinación', scheduledAt: '2026-10-06T14:00:00.000Z', timezone: 'America/La_Paz', processId: null, opportunityId: null, relatedTitle: null };
const deadline = { id: '22222222-2222-4222-8222-222222222222', name: 'Fondo de cooperación', deadline: '2026-10-20', status: 'PENDING_REVIEW' };
const stamp = '2026-10-05T12:00:00.000Z';
const globalPanel = { view: 'institutional', asOf: stamp, activeProcesses: 4, waitingResponseProcesses: 1,
  opportunities: { pendingReview: 2, preparing: 1, submitted: 3, discarded: 0, finished: 2 }, upcomingMeetingCount: 1, upcomingMeetings: [meeting],
  pendingApplications: 3, organizationsReviewDue: 2, organizationsNeverVerified: 1 };
const researchPanel = { view: 'research', asOf: stamp, activeProcesses: 1, relevantProcesses: [{ id: meeting.id, purpose: 'Continuar diálogo', state: 'IN_PROGRESS', lastActivityAt: stamp, target: 'Red local' }],
  activeIntents: 1, relevantIntents: [{ id: meeting.id, purpose: 'Contactar organización', state: 'ACTIVE', lastActivityAt: stamp, target: 'Red local' }], unreadReminders: 1,
  reminderItems: [{ id: meeting.id, type: 'PROCESS_INACTIVITY_REMINDER', createdAt: stamp, subject: 'Continuar diálogo', processId: meeting.id, intentId: null }] };
const planningPanel = { view: 'planning', asOf: stamp, opportunities: { pendingReview: 2, preparing: 1, submitted: 3, discarded: 0, finished: 2 },
  deadlinesInNext30Days: 1, upcomingDeadlines: [deadline], upcomingMeetingCount: 1, upcomingMeetings: [meeting] };

describe('Home dashboard', () => {
  let client = createQueryClient(), current = actor('BOARD'), payload: unknown = globalPanel, mode: 'ok' | 'error' | 'pending' = 'ok';
  const fetchMock = vi.fn<(url: string, options?: RequestInit) => Promise<Response>>();
  beforeEach(() => {
    client = createQueryClient(); current = actor('BOARD'); payload = globalPanel; mode = 'ok';
    client.setQueryData(AUTH_QUERY_KEY, current); client.setQueryDefaults(AUTH_QUERY_KEY, { staleTime: Infinity });
    fetchMock.mockReset().mockImplementation(url => {
      if (url.endsWith('/auth/me')) return Promise.resolve(Response.json(current));
      if (url.endsWith('/dashboard')) {
        if (mode === 'pending') return new Promise<Response>(() => undefined);
        return Promise.resolve(mode === 'error' ? new Response(null, { status: 500 }) : Response.json(payload));
      }
      return Promise.resolve(new Response(null, { status: 404 }));
    }); vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => { client.clear(); vi.unstubAllGlobals(); });
  function view() { return render(<QueryClientProvider client={client}><MemoryRouter><HomePage /></MemoryRouter></QueryClientProvider>); }

  it.each([['BOARD', globalPanel, 'Panel institucional'], ['ADMINISTRATOR', globalPanel, 'Procesos activos'], ['RESEARCH', researchPanel, 'Procesos activos relevantes'], ['PLANNING', planningPanel, 'Fechas límite en los próximos 30 días']] as const)('presenta la vista autorizada %s con datos reales del contrato', async (role, data, text) => {
      current = actor(role); client.setQueryData(AUTH_QUERY_KEY, current); payload = data;
      view();
      if (role === 'RESEARCH') { await screen.findByText(text); expect(screen.getByText('Recordatorios sin leer (1)')).toBeVisible(); expect(screen.queryByText('Contactos por verificar')).not.toBeInTheDocument(); }
      else if (role === 'PLANNING') { expect(await screen.findByRole('link', { name: 'Fondo de cooperación' })).toHaveAttribute('href', `/opportunities/${deadline.id}`); expect(screen.queryByText('Nunca verificadas')).not.toBeInTheDocument(); }
      else { expect(await screen.findByRole('link', { name: /Esperando respuesta/ })).toHaveAttribute('href', '/relationship-processes?state=WAITING_RESPONSE'); expect(screen.getByText('Postulaciones pendientes')).toBeVisible(); expect(screen.getByRole('link', { name: meeting.purpose })).toHaveAttribute('href', `/meetings/${meeting.id}`); }
    });

  it('muestra estado de carga', async () => { mode = 'pending'; view(); expect(await screen.findByRole('status')).toHaveTextContent('Cargando indicadores'); });

  it('conserva las siete métricas institucionales y sus filtros exactos', async () => {
    view(); await screen.findByText('Procesos activos');
    const expected = [
      ['Procesos activos', '4', '/relationship-processes'],
      ['Esperando respuesta', '1', '/relationship-processes?state=WAITING_RESPONSE'],
      ['Pendientes de revisión', '2', '/opportunities?status=PENDING_REVIEW'],
      ['En preparación', '1', '/opportunities?status=PREPARING'],
      ['Postulaciones pendientes', '3', '/opportunities?status=SUBMITTED'],
      ['Requieren revisión', '2', '/organizations?status=active&verificationStatus=REVIEW_DUE'],
      ['Nunca verificadas', '1', '/organizations?status=active&verificationStatus=NEVER_VERIFIED'],
    ];
    for (const [label, value, href] of expected) {
      const metric = screen.getByRole('link', { name: new RegExp(label!) });
      expect(metric).toHaveAttribute('href', href); expect(within(metric).getByText(value!)).toBeVisible();
    }
    expect(fetchMock.mock.calls.every(([url]) => url.endsWith('/dashboard') || url.endsWith('/auth/me'))).toBe(true);
  });

  it('elige la experiencia por view del contrato y no por el nombre del rol', async () => {
    current = actor('RESEARCH'); client.setQueryData(AUTH_QUERY_KEY, current); payload = globalPanel;
    view(); await screen.findByText('Procesos activos');
    expect(screen.getByRole('heading', { name: 'Directorio' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Procesos activos relevantes' })).not.toBeInTheDocument();
  });

  it('preserva el control de acceso y no consulta el dashboard sin capability', () => {
    current = { ...current, permissions: [] }; client.setQueryData(AUTH_QUERY_KEY, current); view();
    expect(screen.getByRole('alert')).toHaveTextContent('No tienes permiso para consultar el panel.');
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/dashboard'))).toHaveLength(0);
  });

  it('muestra los vacíos de Búsqueda sin bloques institucionales', async () => {
    payload = { ...researchPanel, activeProcesses: 0, relevantProcesses: [], activeIntents: 0, relevantIntents: [], unreadReminders: 0, reminderItems: [] };
    view(); expect(await screen.findByText('No tienes procesos activos relevantes.')).toBeVisible();
    expect(screen.getByText('No tienes intenciones activas.')).toBeVisible();
    expect(screen.getByText('No tienes recordatorios activos sin leer.')).toBeVisible();
    expect(screen.queryByText('Nunca verificadas')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver intenciones' })).toHaveAttribute('href', '/contact-intents');
    expect(screen.getByRole('link', { name: 'Ver notificaciones' })).toHaveAttribute('href', '/notifications');
  });

  it('preserva fechas civiles, vacíos y enlaces de Planificación', async () => {
    payload = { ...planningPanel, upcomingMeetingCount: 0, upcomingMeetings: [] };
    view(); await screen.findByText('Fondo de cooperación');
    const dateText = new Intl.DateTimeFormat('es-BO', { timeZone: 'UTC', dateStyle: 'medium' }).format(new Date('2026-10-20T00:00:00.000Z'));
    expect(screen.getByText(dateText)).toHaveAttribute('datetime', '2026-10-20');
    expect(screen.getByText('No hay reuniones próximas.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Ver reuniones' })).toHaveAttribute('href', '/meetings');
    expect(screen.queryByText('Tus procesos activos')).not.toBeInTheDocument();
  });

  it('presenta fechas límite vacías sin inventar oportunidades', async () => {
    payload = { ...planningPanel, deadlinesInNext30Days: 0, upcomingDeadlines: [] }; view();
    expect(await screen.findByText('No hay fechas límite dentro de los próximos 30 días.')).toBeVisible();
    expect(screen.queryByRole('link', { name: deadline.name })).not.toBeInTheDocument();
  });

  it('mantiene reuniones semánticas con fecha, zona, contexto y actualización', async () => {
    payload = { ...globalPanel, upcomingMeetings: [{ ...meeting, relatedTitle: 'Proceso de cooperación' }] }; view();
    const region = await screen.findByRole('region', { name: 'Reuniones próximas (1)' });
    expect(within(region).getAllByRole('listitem')).toHaveLength(1);
    expect(within(region).getByText('America/La_Paz')).toBeVisible();
    expect(within(region).getByText('Proceso de cooperación')).toBeVisible();
    const dateText = new Date(meeting.scheduledAt).toLocaleString('es-BO', { timeZone: meeting.timezone, dateStyle: 'medium', timeStyle: 'short' });
    expect(within(region).getByText(dateText)).toHaveAttribute('datetime', meeting.scheduledAt);
    expect(screen.getByText(new Date(stamp).toLocaleString('es-BO', { dateStyle: 'medium', timeStyle: 'short' }))).toHaveAttribute('datetime', stamp);
  });

  it.each(['process', 'intent', 'notifications'])('conserva destino del recordatorio %s y el actor sin identificar', async destination => {
    payload = { ...researchPanel, relevantProcesses: [{ ...researchPanel.relevantProcesses[0]!, target: undefined }], reminderItems: [{ ...researchPanel.reminderItems[0]!, subject: 'Aviso pendiente', processId: destination === 'process' ? meeting.id : null, intentId: destination === 'intent' ? meeting.id : null }] };
    view(); const notice = await screen.findByRole('link', { name: 'Aviso pendiente' });
    expect(notice).toHaveAttribute('href', destination === 'process' ? `/relationship-processes/${meeting.id}` : destination === 'intent' ? `/contact-intents/${meeting.id}` : '/notifications');
    expect(screen.getByText('Sin organización o persona indicada')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Continuar diálogo' })).toHaveAttribute('href', `/relationship-processes/${meeting.id}`);
  });

  it('muestra error reintentable y estados vacíos sin fabricar resultados', async () => {
    mode = 'error'; view(); await waitFor(() => expect(screen.getByRole('alert')).toBeVisible());
    payload = { ...globalPanel, activeProcesses: 0, waitingResponseProcesses: 0, upcomingMeetingCount: 0, upcomingMeetings: [], pendingApplications: 0,
      organizationsReviewDue: 0, organizationsNeverVerified: 0, opportunities: { pendingReview: 0, preparing: 0, submitted: 0, discarded: 0, finished: 0 } };
    mode = 'ok';
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('No hay reuniones próximas.')).toBeVisible(); expect(screen.getAllByText('0').length).toBeGreaterThan(0);
  });

  it('refresca métricas al invalidar la caché de esa identidad', async () => {
    view(); await screen.findByText('Procesos activos');
    payload = { ...globalPanel, activeProcesses: 9 };
    await invalidateDashboard(client, current);
    expect(await screen.findByText('9')).toBeVisible(); expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/dashboard'))).toHaveLength(2);
  });

  it.each(['logout', 'identity', 'role', 'permission'])('retira caché al cambiar %s', async change => {
    const key = dashboardIdentityKey(current); client.setQueryData(key, globalPanel);
    const next = change === 'logout' ? null : { ...current, ...(change === 'identity' ? { id: 'other' } : change === 'role' ? { role: 'RESEARCH' as const } : { permissions: [] }) };
    await clearForbiddenDashboard(client, next);
    expect(client.getQueryData(key)).toBeUndefined();
  });
});
