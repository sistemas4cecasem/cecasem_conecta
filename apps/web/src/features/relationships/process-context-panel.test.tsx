import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '../../lib/query/query-client';
import { AUTH_QUERY_KEY, type AuthIdentity } from '../auth/session';
import { ProcessContextPanel } from './process-context-panel';
import type { ProcessDetail } from './process-contracts';

const id = '11111111-1111-4111-8111-111111111111', at = '2026-10-01T12:00:00.000Z';
const author = { id, displayName: 'Ana', isActive: true };
const identity: AuthIdentity = { id, givenNames: 'Ana', familyNames: 'QA', username: 'ana', email: 'qa@example.test', role: 'PLANNING',
  permissions: ['relationships.process.read', 'communications.read', 'files.read', 'opportunities.read', 'opportunities.create', 'meetings.read'] };
const process: ProcessDetail = { id, purpose: 'Cooperación', target: { id, kind: 'ORGANIZATION', label: 'Institución', isActive: true }, createdBy: author,
  createdAt: at, updatedAt: at, lastActivityAt: at, state: 'CLOSED', currentResult: 'REJECTED', closureObservation: null, closedAt: at, closedBy: author,
  sourceIntentId: null, version: 2, canClose: false, canReopen: false, allowedStates: [], exceptionalAdministration: false, events: [], eventsTotal: 0,
  participants: [{ user: author, origin: 'PROCESS_CREATOR', joinedAt: at }] };
const opportunity = { id, name: 'Programa vinculado', description: null, url: null, deadline: null, requirements: null, status: 'PENDING_REVIEW',
  discardReason: null, finalResult: null, version: 1, createdAt: at, updatedAt: at, createdBy: author, organizations: [], process: { id, purpose: process.purpose },
  communication: null, allowedStatuses: [], canEdit: false };

describe('Contexto secundario del proceso', () => {
  let client = createQueryClient();
  const fetchMock = vi.fn<(url: string) => Promise<Response>>();
  beforeEach(() => {
    client = createQueryClient(); client.setQueryData(AUTH_QUERY_KEY, identity);
    fetchMock.mockReset(); fetchMock.mockImplementation(url => Promise.resolve(Response.json(url.endsWith('/files/config')
      ? { maxBytes: 20971520, maxFiles: 10 }
      : { items: url.includes('/opportunities?') ? [opportunity] : [], total: url.includes('/opportunities?') ? 30 : 0, page: url.includes('page=2') ? 2 : 1, pageSize: 25 })));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => { client.clear(); vi.unstubAllGlobals(); });
  function view(actor = identity, hash = '') {
    client.setQueryData(AUTH_QUERY_KEY, actor);
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/relationship-processes/' + id + hash]}><ProcessContextPanel identity={actor} process={process} /></MemoryRouter></QueryClientProvider>);
  }
  it('carga índices solo al desplegarlos y conserva participantes visibles', async () => {
    view(); expect(screen.getByRole('region', { name: 'Participantes' })).toHaveTextContent('Ana'); expect(fetchMock).not.toHaveBeenCalled();
    await userEvent.click(screen.getByText('Oportunidades vinculadas', { selector: 'summary' }));
    expect(await screen.findByRole('link', { name: 'Programa vinculado' })).toHaveAttribute('href', '/opportunities/' + id);
    expect(fetchMock.mock.calls[0]?.[0]).toContain('processId=' + id);
    expect(fetchMock.mock.calls.some(([url]) => url.includes('/communications?') || url.includes('/attachments?'))).toBe(false);
    const section = screen.getByRole('region', { name: 'Oportunidades vinculadas' });
    await userEvent.click(within(section).getByRole('button', { name: 'Siguiente' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.includes('page=2'))).toBe(true));
    await userEvent.click(screen.getByText('Oportunidades vinculadas', { selector: 'summary' }));
    await userEvent.click(screen.getByText('Oportunidades vinculadas', { selector: 'summary' }));
    expect(within(section).getByRole('button', { name: 'Anterior' })).toBeEnabled();
  });
  it('enlace al ancla abre adjuntos y mantiene el bloqueo de cargas en cerrado', async () => {
    view(identity, '#adjuntos'); expect(await screen.findByText('No hay adjuntos registrados.')).toBeVisible();
    expect(screen.getByText(/El proceso está cerrado/)).toBeVisible();
    expect(screen.queryByLabelText('Seleccionar archivos')).not.toBeInTheDocument();
  });
  it('respeta lectura de recursos y conserva creación independiente de lectura de oportunidades', async () => {
    view({ ...identity, permissions: ['relationships.process.read', 'opportunities.create'] });
    expect(screen.queryByText('Índice de comunicaciones')).not.toBeInTheDocument(); expect(screen.queryByText('Adjuntos privados')).not.toBeInTheDocument();
    await userEvent.click(screen.getByText('Oportunidades vinculadas', { selector: 'summary' }));
    expect(screen.getByRole('link', { name: 'Crear oportunidad desde este proceso' })).toHaveAttribute('href', '/opportunities/new?processId=' + id);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
