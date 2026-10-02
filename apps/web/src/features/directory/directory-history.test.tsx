import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../../app/router/app-routes';
import { createQueryClient } from '../../lib/query/query-client';
import type { AuthIdentity } from '../auth/session';
import { DirectoryHistory } from './directory-history';
import { historyValueLabel } from './directory-history-format';
import type { HistoryChange, HistoryOperation, Organization } from './contracts';
import { clearForbiddenDirectory } from './queries';

const stamp = '2026-10-02T21:00:00.000Z';
const identity: AuthIdentity = { id: 'reader', givenNames: 'Lector', familyNames: 'QA', username: 'reader', email: 'reader@example.test', role: 'RESEARCH',
  permissions: ['directory.read', 'directory.history.read', 'directory.write'] };
const change = (field = 'country', before: string | null = null, after = 'Bolivia'): HistoryChange => ({ field, label: field === 'country' ? 'País' : 'Descripción',
  previousValue: before, newValue: after, previousReferences: [], newReferences: [], added: [], removed: [] });
const operation = (id = 'operation', changes = [change()]): HistoryOperation => ({ operationId: id, createdAt: stamp, objectType: 'ORGANIZATION',
  actor: { id: 'author', givenNames: 'Autora', familyNames: 'QA', isActive: true }, contextRecorded: true, relatedReferences: [], replacement: null, changes });
const organization: Organization = { id: 'organization', name: 'Organización QA', country: null, description: null, alias: null, officialWebsite: null,
  parentId: null, parent: null, categories: [], isActive: false, version: 1, createdAt: stamp, updatedAt: stamp, lastVerifiedAt: null };
describe('Historial agrupado de fichas', () => {
  let client = createQueryClient(), operations: HistoryOperation[] = [], mode = 'ok', loggedOut = false;
  const fetchMock = vi.fn<(url: string, options?: RequestInit) => Promise<Response>>();
  beforeEach(() => {
    client = createQueryClient(); operations = [operation()]; mode = 'ok'; loggedOut = false;
    fetchMock.mockReset(); fetchMock.mockImplementation((url, options) => {
      const path = url.replace('/api/v1/', '');
      if (path.endsWith('/verification')) return Promise.resolve(Response.json({objectType:'person',classification:'personal',intervalMonths:6,verificationStatus:'NEVER_VERIFIED',lastVerifiedAt:null,lastVerifiedBy:null,nextReviewAt:null,changedSinceVerification:false,timeReviewDue:false,version:1,contactValueVersion:null}));
      if (path === 'auth/me') return Promise.resolve(Response.json(loggedOut ? {} : identity, { status: loggedOut ? 401 : 200 }));
      if (path === 'auth/logout') { loggedOut = true; return Promise.resolve(new Response(null, { status: 204 })); }
      if (path.includes('/history?')) {
        if (mode === 'pending') return new Promise<Response>(() => undefined);
        if (mode === 'error') return Promise.resolve(new Response(null, { status: 500 }));
        const page = Number(new URL(url, 'http://local.test').searchParams.get('page') ?? 1);
        return Promise.resolve(Response.json({ items: operations.slice((page - 1) * 25, page * 25), total: operations.length, page, pageSize: 25 }));
      }
      if (path === 'organizations/organization' && options?.method === 'PUT') {
        operations = [operation('edited', [change('country', null, 'Perú'), change('description', null, 'Nueva descripción')])];
        return Promise.resolve(Response.json({ ...organization, country: 'Perú', description: 'Nueva descripción', version: 2 }));
      }
      if (path === 'organizations/organization') return Promise.resolve(Response.json(organization));
      if (path.startsWith('categories?') || path.startsWith('organizations?') || /\/(children|people|contacts)/.test(path))
        return Promise.resolve(Response.json({ items: [], total: 0, page: 1, pageSize: 25 }));
      return Promise.resolve(new Response(null, { status: 404 }));
    }); vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => { client.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
  function view(fullApp = false) {
    return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/organizations/organization']}>
      {fullApp ? <AppRoutes /> : <DirectoryHistory identity={identity} path="organizations/organization/history" />}
    </MemoryRouter></QueryClientProvider>);
  }
  it('muestra vacío sin inventar operaciones', async () => { operations = []; view(); expect(await screen.findByText('Aún no hay modificaciones.')).toBeVisible(); });
  it('muestra fecha, autora y antes/después con null comprensible', async () => {
    view(); expect(await screen.findByText('Después: Bolivia')).toBeVisible(); expect(screen.getByText('Antes: Sin dato')).toBeVisible();
    expect(screen.getByText(/Autora QA/)).toBeVisible(); expect(screen.getByRole('heading', { name: 'Modificación · Organización · 1 cambio' })).toBeVisible();
    expect(screen.queryByText('operation')).not.toBeInTheDocument();
  });
  it('agrupa varios campos bajo una sola fecha y autora', async () => {
    operations = [operation('multi', [change(), change('description', 'A', 'B')])]; view();
    const heading = await screen.findByRole('heading', { name: 'Modificación · Organización · 2 cambios' });
    const group = heading.closest('li')!; expect(within(group).getByText('País')).toBeVisible(); expect(within(group).getByText('Descripción')).toBeVisible();
    expect(within(group).getAllByText(/Autora QA/)).toHaveLength(1);
  });
  it('identifica autor desactivado sin perder su nombre', async () => {
    operations = [{ ...operation(), actor: { ...operation().actor, isActive: false } }]; view();
    expect(await screen.findByText(/Autora QA · Usuario actualmente desactivado/)).toBeVisible();
  });
  it('muestra categorías añadidas/retiradas con etiquetas capturadas', async () => {
    const old = { id: 'old', kind: 'category' as const, label: 'Derechos Humanos' }, next = { id: 'next', kind: 'category' as const, label: 'Educación' };
    operations = [operation('categories', [{ ...change(), field: 'categoryIds', label: 'Categorías', previousValue: [old.id], newValue: [next.id],
      previousReferences: [old], newReferences: [next], added: [next], removed: [old] }])]; view();
    expect(await screen.findByText('Categoría retirada: Derechos Humanos')).toBeVisible(); expect(screen.getByText('Categoría añadida: Educación')).toBeVisible();
    expect(screen.queryByText('old')).not.toBeInTheDocument();
  });
  it('registros anteriores sin snapshot nunca reciben nombres actuales como históricos', async () => {
    operations = [{ ...operation('legacy', [{ ...change(), field: 'parentId', label: 'Organización matriz', newValue: 'opaque-id',
      newReferences: [{ id: 'opaque-id', kind: 'organization', label: null }] }]), contextRecorded: false }]; view();
    expect(await screen.findByText('Después: Referencia conservada (etiqueta histórica no registrada)')).toBeVisible();
    expect(screen.getByText(/Registro anterior: no se guardaron etiquetas/)).toBeVisible(); expect(screen.queryByText('opaque-id')).not.toBeInTheDocument();
  });
  it('conserva nombres contextuales de vínculo y no sustituye el cargo histórico', async () => {
    operations = [{ ...operation('relation', [{ ...change('positionTitle', 'Coordinadora', 'Directora'), label: 'Cargo' }]), objectType: 'PERSON_ORGANIZATION_RELATION',
      relatedReferences: [{ id: 'person', kind: 'person', label: 'María histórica' }, { id: 'org', kind: 'organization', label: 'Organización histórica' }] }]; view();
    expect(await screen.findByText('Contexto al registrar: María histórica · Organización histórica')).toBeVisible(); expect(screen.getByText('Antes: Coordinadora')).toBeVisible();
  });
  it('distingue sustitución de una simple finalización y conserva ambos canales', async () => {
    operations = [{ ...operation(), replacement: { previous: { id: 'a', kind: 'contactMethod', label: 'antes@example.test' }, next: { id: 'b', kind: 'contactMethod', label: 'despues@example.test' } } }]; view();
    expect(await screen.findByRole('heading', { name: 'Sustitución de contacto · Organización · 1 cambio' })).toBeVisible();
    expect(screen.getByText('Canal anterior: antes@example.test · Canal nuevo: despues@example.test')).toBeVisible();
  });
  it('pagina operaciones en backend y no divide grupos en React', async () => {
    operations = Array.from({ length: 26 }, (_, index) => operation('op-' + index, [change('country', null, 'País ' + index), change('description', null, 'Descripción ' + index)])); view();
    await screen.findByText('Después: País 0'); await userEvent.setup().click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(await screen.findByText('Después: País 25')).toBeVisible(); expect(screen.getByText('Después: Descripción 25')).toBeVisible();
    expect(screen.queryByText('Después: País 0')).not.toBeInTheDocument(); expect(fetchMock.mock.calls.some(([url]) => url.includes('/history?page=2'))).toBe(true);
  });
  it.each(['pending', 'error'])('muestra estado %s', async state => { mode = state; view(); expect(await screen.findByText(state === 'pending' ? 'Cargando…' : 'No se pudo cargar la información.')).toBeVisible(); });
  it('permite retry sin perder la consulta de la ficha', async () => {
    mode = 'error'; view(); await screen.findByRole('alert'); mode = 'ok'; await userEvent.setup().click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Después: Bolivia')).toBeVisible();
  });
  it('editar ficha invalida y actualiza su historial agrupado', async () => {
    view(true); const user = userEvent.setup(); await screen.findByText('Después: Bolivia'); await user.click(screen.getByRole('button', { name: 'Editar ficha' }));
    await user.type(screen.getByLabelText('País (opcional)'), 'Perú'); await user.type(screen.getByLabelText('Descripción (opcional)'), 'Nueva descripción');
    await user.click(screen.getByRole('button', { name: 'Guardar organización' }));
    expect(await screen.findByText('Después: Nueva descripción')).toBeVisible(); expect(screen.getByText('Después: Perú')).toBeVisible();
  });
  it('logout elimina historial y cancela una identidad anterior', async () => {
    view(true); await screen.findByText('Después: Bolivia'); expect(client.getQueriesData({ queryKey: ['directory', 'reader', 'history'] })).toHaveLength(1);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Cerrar sesión' })); await screen.findByRole('heading', { name: 'Iniciar sesión' });
    expect(client.getQueriesData({ queryKey: ['directory'] })).toHaveLength(0);
    client.setQueryData(['directory', 'old-reader', 'history', 'old'], { items: operations, total: 1, page: 1, pageSize: 25 });
    await act(() => clearForbiddenDirectory(client, { ...identity, id: 'new-reader' })); expect(client.getQueriesData({ queryKey: ['directory', 'old-reader'] })).toHaveLength(0);
  });
  it('traduce estado, condición y eliminación de datos sin null ni campos internos', () => {
    expect(historyValueLabel({ ...change(), field: 'isCurrent', newValue: false }, 'new')).toBe('Finalizado');
    expect(historyValueLabel({ ...change(), field: 'condition', newValue: 'UNUSABLE' }, 'new')).toBe('No utilizable (reportado)');
    expect(historyValueLabel({ ...change('positionTitle', 'Directora'), newValue: null }, 'new')).toBe('Sin dato');
  });
  it('al perder history.read elimina consultas de historial', async () => {
    view(); await screen.findByText('Después: Bolivia'); await act(() => clearForbiddenDirectory(client, { ...identity, permissions: ['directory.read'] }));
    await waitFor(() => expect(client.getQueriesData({ queryKey: ['directory', 'reader', 'history'] })).toHaveLength(0));
  });
});
