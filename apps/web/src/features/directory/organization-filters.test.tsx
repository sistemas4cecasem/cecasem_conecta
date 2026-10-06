import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigate } from 'react-router';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../../app/router/app-routes';
import { createQueryClient } from '../../lib/query/query-client';
import { AUTH_QUERY_KEY, type AuthIdentity } from '../auth/session';
import { clearForbiddenDirectory } from './queries';

const identity: AuthIdentity = { id: 'qa52', givenNames: 'QA', familyNames: 'Filtros', username: 'qa52', email: 'qa52@example.test', role: 'PLANNING', permissions: ['directory.read', 'relationships.process.read', 'communications.read'] };
const categoryId = '11111111-1111-4111-8111-111111111111', stamp = '2026-10-05T00:00:00Z';
const category = { id: categoryId, name: 'Educación', version: 1, isActive: true, createdAt: stamp, updatedAt: stamp };
const row = { id: 'org52', name: 'Organización Bolivia', country: 'Bolivia', alias: null, description: null, officialWebsite: null, parentId: null, parent: null, isActive: true, version: 1, categories: [category], createdAt: stamp, updatedAt: stamp, lastVerifiedAt: null };
function Location() {
  const location = useLocation(), navigate = useNavigate();
  return <><output aria-label="URL actual">{location.pathname + location.search}</output><button onClick={() => navigate(-1)}>Volver filtro</button><button onClick={() => navigate(1)}>Avanzar filtro</button></>;
}
describe('5.2 controles, URL y caché de filtros', () => {
  let client = createQueryClient(), mode = 'ok', total = 1, current = identity;
  const fetchMock = vi.fn<(url: string) => Promise<Response>>();
  beforeEach(() => {
    client = createQueryClient(); mode = 'ok'; total = 1; current = identity;
    client.setQueryData(AUTH_QUERY_KEY, current); client.setQueryDefaults(AUTH_QUERY_KEY, { staleTime: Infinity });
    fetchMock.mockReset(); fetchMock.mockImplementation(url => {
      if (url.endsWith('auth/me')) return Promise.resolve(Response.json(current));
      if (url.includes('/categories?')) return Promise.resolve(Response.json({ items: [category], total: 1, page: 1, pageSize: 25 }));
      if (url.includes('/organizations?')) {
        if (mode === 'pending') return new Promise(() => undefined);
        if (mode === 'error') return Promise.resolve(new Response(null, { status: 500 }));
        const params = new URL(url, 'http://localhost').searchParams;
        const items = params.get('country') === 'Perú' || mode === 'empty' ? [] : [{ ...row, name: params.get('page') === '2' ? 'Segunda página' : row.name }];
        return Promise.resolve(Response.json({ items, total: items.length ? total : 0, page: Number(params.get('page')), pageSize: 25 }));
      }
      if (url.includes('/search?')) return Promise.resolve(Response.json({ query: 'qa52', organizations: { items: [], total: 0, page: 1, pageSize: 25 }, people: { items: [], total: 0, page: 1, pageSize: 25 }, email: null, processes: null, emailHistory: null }));
      return Promise.resolve(new Response(null, { status: 404 }));
    }); vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => { client.clear(); vi.unstubAllGlobals(); });
  function view(route = '/organizations') { return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[route]}><Location /><AppRoutes /></MemoryRouter></QueryClientProvider>); }
  const calls = () => fetchMock.mock.calls.filter(([url]) => url.includes('/organizations?'));
  const last = () => new URL(calls().at(-1)![0], 'http://localhost').searchParams;
  const results = () => within(screen.getByRole('region', { name: 'Resultados de organizaciones' }));
  it('restaura cinco filtros y página al abrir URL compartida', async () => {
    view('/organizations?country=Bolivia&categoryId=' + categoryId + '&status=all&verificationStatus=REVIEW_DUE&withCommunications=false&page=2');
    await screen.findByRole('link', { name: 'Segunda página' });
    expect(screen.getByLabelText('País')).toHaveValue('Bolivia'); expect(screen.getByLabelText('Categoría')).toHaveValue(categoryId);
    expect(screen.getByLabelText('Estado')).toHaveValue('all'); expect(screen.getByLabelText('Condición de verificación')).toHaveValue('REVIEW_DUE'); expect(screen.getByLabelText('Comunicaciones externas')).toHaveValue('false');
    expect(last().get('page')).toBe('2'); expect(last().get('withCommunications')).toBe('false');
  });
  it('combina filtros en petición y URL y limpia sin conservar parámetros eliminados', async () => {
    view(); await screen.findByRole('link', { name: row.name });
    fireEvent.change(screen.getByLabelText('País'), { target: { value: 'Bolivia' } });
    await userEvent.selectOptions(screen.getByLabelText('Categoría'), categoryId); await userEvent.selectOptions(screen.getByLabelText('Condición de verificación'), 'REVIEW_DUE');
    await userEvent.selectOptions(screen.getByLabelText('Comunicaciones externas'), 'true');
    await waitFor(() => expect(last().get('withCommunications')).toBe('true')); expect(last().get('country')).toBe('Bolivia'); expect(last().get('categoryId')).toBe(categoryId); expect(last().get('verificationStatus')).toBe('REVIEW_DUE');
    expect(screen.getByLabelText('URL actual').textContent).toContain('withCommunications=true');
    await userEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    await waitFor(() => expect(last().has('country')).toBe(false)); expect(last().has('categoryId')).toBe(false); expect(last().has('withCommunications')).toBe(false); expect(screen.getByLabelText('Condición de verificación')).toHaveValue('');
  });
  it('al retirar un filtro desaparece de URL y back/forward restaura condiciones', async () => {
    view('/organizations?country=Bolivia'); await screen.findByRole('link', { name: row.name });
    fireEvent.change(screen.getByLabelText('País'), { target: { value: 'Perú' } }); await screen.findByText('No hay organizaciones para estos filtros.');
    await userEvent.click(screen.getByRole('button', { name: 'Volver filtro' })); expect(await screen.findByRole('link', { name: row.name })).toBeVisible(); expect(screen.getByLabelText('País')).toHaveValue('Bolivia');
    await userEvent.click(screen.getByRole('button', { name: 'Avanzar filtro' })); await screen.findByText('No hay organizaciones para estos filtros.');
    fireEvent.change(screen.getByLabelText('País'), { target: { value: '' } }); await waitFor(() => expect(screen.getByLabelText('URL actual').textContent).not.toContain('country='));
  });
  it('cambiar filtro reinicia página, paginar conserva criterios', async () => {
    total = 26; view('/organizations?country=Bolivia&withCommunications=true'); await screen.findByRole('link', { name: row.name });
    await userEvent.click(results().getByRole('button', { name: 'Siguiente' })); await screen.findByRole('link', { name: 'Segunda página' }); expect(last().get('withCommunications')).toBe('true');
    await userEvent.selectOptions(screen.getByLabelText('Condición de verificación'), 'CURRENT'); await waitFor(() => expect(last().get('page')).toBe('1')); expect(last().get('country')).toBe('Bolivia');
  });
  it('carga nueva no muestra resultados anteriores y error permite reintentar conservando filtros', async () => {
    view(); await screen.findByRole('link', { name: row.name }); mode = 'pending'; fireEvent.change(screen.getByLabelText('País'), { target: { value: 'Bolivia' } });
    expect(await results().findByText('Cargando…')).toBeVisible(); expect(screen.queryByRole('link', { name: row.name })).not.toBeInTheDocument();
    mode = 'error'; await userEvent.selectOptions(screen.getByLabelText('Condición de verificación'), 'CURRENT'); await waitFor(() => expect(results().getByRole('alert')).toBeVisible());
    mode = 'ok'; await userEvent.click(results().getByRole('button', { name: 'Reintentar' })); expect(await screen.findByRole('link', { name: row.name })).toBeVisible(); expect(screen.getByLabelText('País')).toHaveValue('Bolivia');
  });
  it('países tienen cachés independientes y vacío difiere de error', async () => {
    view('/organizations?country=Bolivia'); await screen.findByRole('link', { name: row.name }); fireEvent.change(screen.getByLabelText('País'), { target: { value: 'Perú' } });
    await screen.findByText('No hay organizaciones para estos filtros.'); expect(results().queryByRole('alert')).not.toBeInTheDocument();
    const keys = client.getQueryCache().findAll({ queryKey: ['directory', identity.id, 'organizations'] }).map(query => String(query.queryKey[3]));
    expect(keys.some(key => key.includes('country=Bolivia'))).toBe(true); expect(keys.some(key => key.includes('country=Per%C3%BA'))).toBe(true);
  });
  it('pérdida de capabilities elimina proyección filtrada de caché', async () => {
    view('/organizations?withCommunications=true'); await screen.findByRole('link', { name: row.name });
    const restricted = { ...identity, permissions: ['directory.read'] };
    await act(async () => { await clearForbiddenDirectory(client, restricted); });
    expect(client.getQueriesData({ queryKey: ['directory', identity.id, 'organizations'] })).toHaveLength(0);
  });
  it('sin lectura de comunicaciones no ofrece filtro de presencia/ausencia', async () => {
    current = { ...identity, permissions: ['directory.read'] }; client.setQueryData(AUTH_QUERY_KEY, current); view(); await screen.findByRole('link', { name: row.name }); expect(screen.queryByLabelText('Comunicaciones externas')).not.toBeInTheDocument();
  });
  it('URL inválida conserva criterio para validación estricta de API, sin ampliar la consulta', async () => {
    mode = 'error'; view('/organizations?withCommunications=invalid&country='); await waitFor(() => expect(results().getByRole('alert')).toBeVisible()); expect(last().get('withCommunications')).toBe('invalid'); expect(last().has('country')).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' })); await waitFor(() => expect(last().has('withCommunications')).toBe(false));
  });
  it('búsqueda global delimita filtros institucionales en contrato y conserva q', async () => {
    view('/directory/search?q=qa52&organizationCountry=Bolivia&organizationVerificationStatus=CURRENT'); await screen.findByText('No se encontraron resultados.');
    expect(screen.getByText(/Estos filtros reducen únicamente organizaciones/)).toBeVisible(); expect(screen.getByLabelText('País')).toHaveValue('Bolivia');
    await userEvent.selectOptions(screen.getByLabelText('Comunicaciones externas'), 'true');
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url.includes('/search?')).at(-1)?.[0]).toContain('organizationWithCommunications=true'));
    await userEvent.click(screen.getByRole('button', { name: 'Limpiar filtros de organizaciones' })); expect(screen.getByLabelText('Nombre o correo')).toHaveValue('qa52');
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url.includes('/search?')).at(-1)?.[0]).not.toContain('organizationCountry'));
  });
});
