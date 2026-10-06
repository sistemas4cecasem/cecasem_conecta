import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
