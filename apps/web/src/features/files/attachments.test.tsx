import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { Attachments } from './attachments';
import { AUTH_QUERY_KEY, type AuthIdentity } from '../auth/session';
import { createQueryClient } from '../../lib/query/query-client';
import { apiRequest } from '../../lib/api/client';
import { selectionError } from './contracts';
import { clearForbiddenFiles, fileIdentityKey } from './queries';
const id = '11111111-1111-4111-8111-111111111111', actorId = '22222222-2222-4222-8222-222222222222';
const identity: AuthIdentity = { id: actorId, givenNames: 'Ana', familyNames: 'QA', username: 'ana', email: 'ana@example.test', role: 'PLANNING', permissions: ['files.read', 'files.upload', 'relationships.process.read', 'communications.read'] };
const metadata = { id, originalName: 'acuerdo.txt', mimeType: 'text/plain', declaredMimeType: 'text/plain', sizeBytes: 7, sha256: 'a'.repeat(64), createdAt: '2000-01-01T00:00:00.000Z', processId: null, communicationId: id, incorporation: 'LATER_COMMUNICATION_ATTACHMENT', uploadedBy: { id: actorId, displayName: 'Ana QA', isActive: true } };
describe('Adjuntos privados en interfaz y cliente binario', () => {
  let client = createQueryClient(), items: typeof metadata[] = [], status = 0;
  const fetchMock = vi.fn<(url: string, options?: RequestInit) => Promise<Response>>();
  beforeEach(() => {
    client = createQueryClient(); client.setQueryData(AUTH_QUERY_KEY, identity); items = []; status = 0;
    fetchMock.mockReset(); fetchMock.mockImplementation((url, options) => {
      if (url.endsWith('/files/config')) return Promise.resolve(Response.json({ maxBytes: 20971520, maxFiles: 10 }));
      if (options?.method === 'POST') {
        if (status) return Promise.resolve(Response.json({ code: status === 409 ? 'REQUEST_CONFLICT' : 'UNSUPPORTED_FILE' }, { status }));
        items = [metadata]; return Promise.resolve(Response.json(items, { status: 201 }));
      }
      if (url.includes('/attachments?')) return Promise.resolve(Response.json({ items, total: items.length, page: 1, pageSize: 25 }));
      if (url.endsWith('/download')) return Promise.resolve(new Response('archivo', { headers: { 'Content-Type': 'text/plain' } }));
      return Promise.resolve(new Response(null, { status: 404 }));
    }); vi.stubGlobal('fetch', fetchMock);
  });
  function view(blocked = false, resource: 'communications' | 'relationship-processes' = 'communications', current = identity) {
    return render(<QueryClientProvider client={client}><Attachments identity={current} resource={resource} resourceId={id} processId={id} blocked={blocked} /></QueryClientProvider>);
  }
  it('estado vacío y contexto de incorporación posterior', async () => { view(); await screen.findByText('No hay adjuntos registrados.'); expect(screen.getByText(/no forman parte del mensaje original/)).toBeInTheDocument(); });
  it('selección múltiple envía FormData, limpia selección e incorpora lista', async () => {
    view(); await screen.findByText(/Hasta 10 archivos/); await userEvent.upload(screen.getByLabelText('Seleccionar archivos'), [new File(['acuerdo'], 'acuerdo.txt', { type: 'text/plain' }), new File(['otro'], 'otro.csv', { type: 'text/csv' })]);
    await userEvent.click(screen.getByRole('button', { name: 'Incorporar adjuntos' })); await screen.findByText('Adjuntos incorporados.');
    const post = fetchMock.mock.calls.find(([, options]) => options?.method === 'POST'); expect(post?.[1]?.body).toBeInstanceOf(FormData); expect((post?.[1]?.body as FormData).getAll('files')).toHaveLength(2);
    expect(new Headers(post?.[1]?.headers).has('Content-Type')).toBe(false); expect(new Headers(post?.[1]?.headers).get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/); await screen.findByRole('button', { name: 'Descargar acuerdo.txt' });
  });
  it('error conserva selección y clave de reintento', async () => {
    status = 409; view(); await screen.findByText(/Hasta 10 archivos/); await userEvent.upload(screen.getByLabelText('Seleccionar archivos'), new File(['acuerdo'], 'acuerdo.txt', { type: 'text/plain' }));
    await userEvent.click(screen.getByRole('button', { name: 'Incorporar adjuntos' })); await screen.findByText(/Esta solicitud ya registró otra carga/);
    await userEvent.click(screen.getByRole('button', { name: 'Incorporar adjuntos' })); await waitFor(() => expect(fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(2));
    const posts = fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST'); expect(new Headers(posts[0]?.[1]?.headers).get('Idempotency-Key')).toBe(new Headers(posts[1]?.[1]?.headers).get('Idempotency-Key')); expect(screen.getByText(/acuerdo.txt · 7 bytes/)).toBeInTheDocument();
  });
  it.each(['communications', 'relationship-processes'] as const)('%s bloqueado conserva consulta sin input de carga', async resource => {
    items = [metadata]; view(true, resource); await screen.findByRole('button', { name: 'Descargar acuerdo.txt' }); expect(screen.queryByLabelText('Seleccionar archivos')).not.toBeInTheDocument(); expect(screen.getByText(/se conservan los adjuntos anteriores/)).toBeInTheDocument();
  });
  it('no consulta ni muestra adjuntos sin capability', () => { view(false, 'communications', { ...identity, permissions: ['relationships.process.read'] }); expect(screen.queryByRole('region', { name: 'Adjuntos privados' })).not.toBeInTheDocument(); expect(fetchMock).not.toHaveBeenCalled(); });
  it('valida cero, tamaño, tipo y cantidad antes de envío', () => {
    const limits = { maxBytes: 20971520, maxFiles: 10 };
    expect(selectionError([new File([], 'empty.txt')], limits)).toContain('empty.txt');
    expect(selectionError([new File(['a'], 'script.js')], limits)).toContain('tipo');
    expect(selectionError(Array.from({ length: 11 }, () => new File(['a'], 'a.txt')), limits)).toContain('10');
    const file = new File(['a'], 'big.txt'); Object.defineProperty(file, 'size', { value: 20971521, configurable: true }); expect(selectionError([file], limits)).toContain('big.txt');
    Object.defineProperty(file, 'size', { value: 20971520, configurable: true }); expect(selectionError([file], limits)).toBeNull();
  });
  it('descarga como blob con cookies y mantiene errores de sesión', async () => {
    const blob = await apiRequest<Blob>('files/' + id + '/download', {}, 'blob'); expect(await blob?.text()).toBe('archivo'); expect(fetchMock.mock.calls[0]?.[1]?.credentials).toBe('include');
    const unauthorized = vi.fn(); window.addEventListener('cecasem:unauthorized', unauthorized); fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));
    await expect(apiRequest('files/' + id + '/download', {}, 'blob')).rejects.toMatchObject({ status: 401 }); expect(unauthorized).toHaveBeenCalled(); window.removeEventListener('cecasem:unauthorized', unauthorized);
  });
  it.each([true, false])('descarga desde UI solo entrega bytes a la identidad vigente, current=%s', async current => {
    items = [metadata]; let complete!: (response: Response) => void;
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url, options) => url.endsWith('/download') ? new Promise(resolve => { complete = resolve; }) : original(url, options));
    const originalURL = URL, create = vi.fn(() => 'blob:qa-files'), revoke = vi.fn();
    vi.stubGlobal('URL', class extends originalURL { static createObjectURL = create; static revokeObjectURL = revoke; });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    try {
      view(); const button = await screen.findByRole('button', { name: 'Descargar acuerdo.txt' }); await userEvent.click(button);
      if (!current) { client.setQueryData(AUTH_QUERY_KEY, null); await clearForbiddenFiles(client, null); }
      await act(async () => { complete(new Response('archivo')); });
      if (current) await waitFor(() => expect(button).toBeEnabled());
      else await waitFor(() => expect(screen.queryByRole('button', { name: 'Descargar acuerdo.txt' })).not.toBeInTheDocument());
      expect(click).toHaveBeenCalledTimes(current ? 1 : 0); expect(create).toHaveBeenCalledTimes(current ? 1 : 0);
      if (current) { const anchor = click.mock.instances[0]; if (!(anchor instanceof HTMLAnchorElement)) throw new Error('La descarga debe utilizar un enlace HTML.'); expect(anchor.download).toBe('acuerdo.txt'); expect(anchor.href).toBe('blob:qa-files'); await waitFor(() => expect(revoke).toHaveBeenCalledWith('blob:qa-files'), { timeout: 1500 }); }
    } finally { click.mockRestore(); vi.stubGlobal('URL', originalURL); }
  });
  it('limpia caché al perder identidad', async () => { client.setQueryData([...fileIdentityKey(identity), 'fixture'], metadata); await clearForbiddenFiles(client, null); expect(client.getQueryData([...fileIdentityKey(identity), 'fixture'])).toBeUndefined(); });
  it('respuesta tardía de upload no repuebla caché de otra identidad', async () => {
    let complete!: (response: Response) => void;
    const original = fetchMock.getMockImplementation()!; fetchMock.mockImplementation((url, options) => options?.method === 'POST' ? new Promise(resolve => { complete = resolve; }) : original(url, options));
    view(); await screen.findByText(/Hasta 10 archivos/); await userEvent.upload(screen.getByLabelText('Seleccionar archivos'), new File(['abc'], 'a.txt', { type: 'text/plain' })); await userEvent.click(screen.getByRole('button', { name: 'Incorporar adjuntos' }));
    client.setQueryData(AUTH_QUERY_KEY, null); await clearForbiddenFiles(client, null); complete(Response.json([metadata])); await waitFor(() => expect(screen.queryByText('Incorporando adjuntos…')).not.toBeInTheDocument());
    expect(client.getQueriesData({ queryKey: fileIdentityKey(identity) }).every(([, value]) => value === undefined)).toBe(true);
  });
});
