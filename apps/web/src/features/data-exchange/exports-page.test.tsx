import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '../../lib/query/query-client';
import { AUTH_QUERY_KEY, type AuthIdentity } from '../auth/session';
import { ExportsPage } from './exports-page';

const identity = (role: AuthIdentity['role']): AuthIdentity => ({ id: role, email: `${role.toLowerCase()}@example.test`, givenNames: 'QA', familyNames: role,
  username: role.toLowerCase(), role, permissions: ['directory.read', 'relationships.process.read', 'opportunities.read'] });
const workbook = new Blob(['xlsx bytes'], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

describe('Exportación Excel', () => {
  let client = createQueryClient();
  const fetchMock = vi.fn<(url: string, options?: RequestInit) => Promise<Response>>();
  beforeEach(() => {
    client = createQueryClient(); client.setQueryDefaults(AUTH_QUERY_KEY, { staleTime: Infinity });
    client.setQueryData(AUTH_QUERY_KEY, identity('ADMINISTRATOR'));
    fetchMock.mockReset().mockImplementation(url => {
      if (url.endsWith('/categories?page=1&pageSize=100&status=active')) return Promise.resolve(Response.json({ items: [], total: 0 }));
      if (url.endsWith('/preview')) return Promise.resolve(Response.json({ type: 'organizations', count: 2, unit: 'registros' }));
      if (url.endsWith('/data-exchange/exports/organizations')) return Promise.resolve(new Response(workbook, { status: 200, headers: { 'Content-Type': workbook.type } }));
      return Promise.resolve(new Response(null, { status: 404 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:export'), revokeObjectURL: vi.fn() });
  });
  afterEach(() => { client.clear(); vi.unstubAllGlobals(); });
  function view(current = identity('ADMINISTRATOR')) {
    client.setQueryData(AUTH_QUERY_KEY, current);
    return render(<QueryClientProvider client={client}><MemoryRouter><ExportsPage /></MemoryRouter></QueryClientProvider>);
  }

  it.each(['ADMINISTRATOR', 'BOARD', 'RESEARCH', 'PLANNING'] as const)('muestra los dominios legibles a %s', role => {
    view(identity(role));
    expect(screen.getByRole('heading', { name: 'Exportación Excel' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Organizaciones' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Contactos' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Procesos' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Oportunidades' })).toBeInTheDocument();
  });

  it('calcula el resumen filtrado y procesa la respuesta binaria para descargar con nombre seguro', async () => {
    const user = userEvent.setup(); const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toMatch(/^cecasem-organizations-\d{4}-\d{2}-\d{2}\.xlsx$/);
    }); view();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Tipo de información' }), 'organizations');
    await user.type(screen.getByLabelText('País'), 'Bolivia');
    await user.click(screen.getByRole('button', { name: 'Calcular resumen' }));
    expect(await screen.findByText('registros: 2')).toBeInTheDocument();
    const previewCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/organizations/preview'));
    expect(JSON.parse(String(previewCall?.[1]?.body))).toEqual({ filters: expect.objectContaining({ country: 'Bolivia', organizationStatus: 'active' }) });
    await user.click(screen.getByRole('button', { name: 'Descargar XLSX' }));
    await waitFor(() => expect(click).toHaveBeenCalledOnce());
    const exportCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/data-exchange/exports/organizations'));
    expect(exportCall?.[1]?.credentials).toBe('include');
    expect(exportCall?.[1]?.body).toContain('Bolivia');
    expect(URL.createObjectURL).toHaveBeenCalledWith(workbook);
  });

  it('muestra error de API y no permite descargar cuando el preview no tiene filas', async () => {
    fetchMock.mockImplementation(url => String(url).endsWith('/preview') ? Promise.resolve(Response.json({ type: 'organizations', count: 0, unit: 'registros' })) : Promise.resolve(new Response(null, { status: 404 })));
    const user = userEvent.setup(); view();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Tipo de información' }), 'organizations');
    await user.click(screen.getByRole('button', { name: 'Calcular resumen' }));
    expect(await screen.findByText(/No hay resultados/u)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Descargar XLSX' })).not.toBeInTheDocument();
  });

  it('muestra un error legible cuando el servidor rechaza el preview', async () => {
    fetchMock.mockImplementation(url => String(url).endsWith('/preview') ? Promise.resolve(new Response(null, { status: 403 })) : Promise.resolve(new Response(null, { status: 404 })));
    const user = userEvent.setup(); view();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Tipo de información' }), 'organizations');
    await user.click(screen.getByRole('button', { name: 'Calcular resumen' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No tienes permiso');
  });
});
