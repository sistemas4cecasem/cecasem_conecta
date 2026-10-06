import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '../../lib/query/query-client';
import { AUTH_QUERY_KEY, type AuthIdentity } from '../auth/session';
import { ImportsPage } from './imports-page';

const batchId = '11111111-1111-4111-8111-111111111111';
const admin: AuthIdentity = { id: 'admin', email: 'admin@example.test', givenNames: 'A', familyNames: 'Admin', username: 'admin', role: 'ADMINISTRATOR', permissions: ['data_exchange.import.execute'] };
const preview = { id: batchId, originalFilename: 'historial.xlsx', worksheetName: 'Historial', recordKind: 'ORGANIZATION', status: 'ANALYZED', analyzedRows: 1, readyRows: 1, reviewRows: 0, invalidRows: 0, importedRows: 0, page: 1, pageSize: 50,
  rows: [{ rowNumber: 2, status: 'READY', sourceValues: { Nombre: 'Fundación Esperanza' }, normalizedValues: { name: 'Fundación Esperanza' }, errors: [], warnings: [], matches: [] }] };

describe('Importación Excel en el navegador', () => {
  let client = createQueryClient(); let identity: AuthIdentity | null = admin; let confirmed = false;
  const fetchMock = vi.fn<(url: string, options?: RequestInit) => Promise<Response>>();
  beforeEach(() => {
    client = createQueryClient(); client.setQueryDefaults(AUTH_QUERY_KEY, { staleTime: Infinity }); client.setQueryData(AUTH_QUERY_KEY, admin); identity = admin; confirmed = false;
    fetchMock.mockReset().mockImplementation((url) => {
      if (url.endsWith('/auth/me')) return Promise.resolve(Response.json(identity));
      if (url.includes('/data-exchange/imports?page=')) return Promise.resolve(Response.json({ items: [], total: 0, page: 1, pageSize: 25 }));
      if (url.endsWith('/data-exchange/imports/inspect')) return Promise.resolve(Response.json({ sheets: [{ name: 'Historial', rowCount: 2, columnCount: 2, sample: [{ rowNumber: 1, cells: [{ column: 1, value: 'Nombre', cellType: 'TEXT' }, { column: 2, value: 'País', cellType: 'TEXT' }] }] }] }));
      if (url.endsWith('/data-exchange/imports/preview')) return Promise.resolve(Response.json(preview));
      if (url.endsWith(`/data-exchange/imports/${batchId}/confirm`)) { confirmed = true; return Promise.resolve(Response.json({ status: 'IMPORTED' })); }
      if (url.endsWith(`/data-exchange/imports/${batchId}?page=1&pageSize=50`)) return Promise.resolve(Response.json({ ...preview, status: confirmed ? 'IMPORTED' : 'ANALYZED', importedRows: confirmed ? 1 : 0,
        rows: confirmed ? [{ ...preview.rows[0], status: 'IMPORTED' }] : preview.rows }));
      return Promise.resolve(new Response(null, { status: 404 }));
    }); vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => { client.clear(); vi.unstubAllGlobals(); });
  function view(current = admin) {
    identity = current; client.setQueryData(AUTH_QUERY_KEY, current);
    return render(<QueryClientProvider client={client}><MemoryRouter><ImportsPage /></MemoryRouter></QueryClientProvider>);
  }

  it('bloquea la operación a roles sin capability explícita', () => {
    view({ ...admin, id: 'research', role: 'RESEARCH', permissions: [] });
    expect(screen.getByRole('alert')).toHaveTextContent('No tienes permiso');
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/data-exchange/imports?page='), expect.anything());
  });

  it('separa inspección, preview y confirmación explícita del lote', async () => {
    const user = userEvent.setup(); view();
    const file = new File(['xlsx fixture'], 'historial.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    await user.upload(screen.getByLabelText('Archivo XLSX'), file);
    await user.click(screen.getByRole('button', { name: 'Inspeccionar archivo' }));
    await screen.findByLabelText('Nombre de organización (obligatorio)');
    expect(screen.getByText(/Deja las demás en «Sin asignar» para ignorarlas/u)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Nombre de organización (obligatorio)'), '1');
    await user.click(screen.getByRole('button', { name: 'Analizar y crear preview' }));
    await screen.findByRole('heading', { name: 'Revisión previa a importar' });
    expect(screen.getByText('Fundación Esperanza')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url, options]) => String(url).endsWith('/confirm') && options?.method === 'POST')).toBe(false);
    vi.stubGlobal('confirm', vi.fn(() => true));
    await user.click(screen.getByRole('button', { name: 'Confirmar y escribir datos' }));
    await screen.findByText(/1 filas aplicadas/);
    expect(confirmed).toBe(true);
    expect(fetchMock.mock.calls.find(([url]) => String(url).endsWith('/preview'))?.[1]?.body).toBeInstanceOf(FormData);
  });
});
