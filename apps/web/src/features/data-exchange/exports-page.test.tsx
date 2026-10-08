import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
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
      if (url.endsWith('/auth/me')) return Promise.resolve(Response.json(client.getQueryData(AUTH_QUERY_KEY)));
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

  it('UI 2.10 cabecera y selección no calculan ni descargan automáticamente',()=>{
    view();expect(screen.getAllByRole('heading',{level:1})).toHaveLength(1);expect(screen.getByRole('heading',{name:'Exportar Excel'})).toBeVisible();
    expect(screen.getByRole('button',{name:'Calcular resumen'})).toBeDisabled();expect(screen.queryByRole('button',{name:'Descargar XLSX'})).not.toBeInTheDocument();expect(fetchMock.mock.calls.some(([url])=>url.includes('/data-exchange/') || url.includes('/categories?'))).toBe(false);
  });
  it.each([
    ['directory.read',['Organizaciones','Contactos']],['relationships.process.read',['Procesos']],['opportunities.read',['Oportunidades']],
  ] as const)('UI 2.10 %s ofrece solo sus conjuntos autorizados', (permission,labels)=>{
    view({...identity('RESEARCH'),permissions:[permission]});expect(screen.getAllByRole('option').map(option=>option.textContent)).toEqual(['Selecciona un tipo',...labels]);
  });
  it('UI 2.10 sin dominios disponibles no muestra acciones ni consulta datos',()=>{
    view({...identity('ADMINISTRATOR'),permissions:[]});expect(screen.getByRole('status')).toHaveTextContent('Tu perfil no tiene dominios disponibles');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();expect(fetchMock.mock.calls.some(([url])=>url.includes('/data-exchange/') || url.includes('/categories?'))).toBe(false);
  });
  it('UI 2.10 filtros conservan defaults por conjunto y no guardan al escribir',async()=>{
    view();const type=screen.getByLabelText('Tipo de información');await userEvent.selectOptions(type,'organizations');await screen.findByLabelText('Categoría');
    expect(screen.getByLabelText('Estado')).toHaveValue('active');await userEvent.type(screen.getByLabelText('País'),'Bolivia');
    await userEvent.selectOptions(type,'contacts');expect(screen.getByLabelText('Estado de persona')).toHaveValue('active');expect(screen.getByLabelText('Vínculos institucionales')).toHaveValue('all');
    await userEvent.selectOptions(type,'processes');expect(screen.getByLabelText('Estado del proceso')).toHaveValue('all');
    await userEvent.selectOptions(type,'opportunities');expect(screen.getByLabelText('Estado de oportunidad')).toHaveValue('all');
    await userEvent.selectOptions(type,'organizations');expect(screen.getByLabelText('País')).toHaveValue('Bolivia');
    expect(fetchMock.mock.calls.some(([,o])=>o?.method==='POST')).toBe(false);
  });
  it('UI 2.10 cambiar filtros invalida resumen y descarga disponible',async()=>{
    view();await userEvent.selectOptions(screen.getByLabelText('Tipo de información'),'organizations');await userEvent.click(screen.getByRole('button',{name:'Calcular resumen'}));
    await screen.findByRole('button',{name:'Descargar XLSX'});await userEvent.type(screen.getByLabelText('País'),'Bolivia');
    expect(screen.queryByRole('region',{name:'Resumen'})).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:'Descargar XLSX'})).not.toBeInTheDocument();
  });
  it('UI 2.10 resumen pendiente bloquea acción con feedback accesible',async()=>{
    view();await userEvent.selectOptions(screen.getByLabelText('Tipo de información'),'processes');let complete!:(r:Response)=>void;
    fetchMock.mockImplementation(()=>new Promise(resolve=>{complete=resolve;}));await userEvent.click(screen.getByRole('button',{name:'Calcular resumen'}));
    expect(screen.getByRole('button',{name:'Consultando…'})).toBeDisabled();expect(screen.getByRole('button',{name:'Consultando…'})).toHaveAttribute('aria-busy','true');
    await act(async()=>complete(Response.json({type:'processes',count:1,unit:'registros'})));
  });
  it('UI 2.10 descarga pendiente conserva resumen y bloquea doble solicitud',async()=>{
    const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});view();await userEvent.selectOptions(screen.getByLabelText('Tipo de información'),'organizations');
    await userEvent.click(screen.getByRole('button',{name:'Calcular resumen'}));await screen.findByRole('button',{name:'Descargar XLSX'});let complete!:(r:Response)=>void;
    const original=fetchMock.getMockImplementation()!;fetchMock.mockImplementation(url=>url.endsWith('/organizations')?new Promise(resolve=>{complete=resolve;}):original(url));
    await userEvent.click(screen.getByRole('button',{name:'Descargar XLSX'}));expect(screen.getByRole('button',{name:'Preparando XLSX…'})).toBeDisabled();
    expect(screen.getByRole('region',{name:'Resumen'})).toBeVisible();await act(async()=>complete(new Response(workbook,{headers:{'Content-Type':workbook.type}})));expect(click).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:export');
  });
  it('UI 2.10 MIME inesperado muestra error sin generar URL temporal',async()=>{
    view();await userEvent.selectOptions(screen.getByLabelText('Tipo de información'),'organizations');await userEvent.click(screen.getByRole('button',{name:'Calcular resumen'}));await screen.findByRole('button',{name:'Descargar XLSX'});
    fetchMock.mockImplementation(()=>Promise.resolve(new Response('no es xlsx',{headers:{'Content-Type':'text/plain'}})));await userEvent.click(screen.getByRole('button',{name:'Descargar XLSX'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('El servidor devolvió un archivo no reconocido.');expect(URL.createObjectURL).not.toHaveBeenCalled();expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });
  it('UI 2.10 error al descargar conserva parámetros para reintentar',async()=>{
    view();await userEvent.selectOptions(screen.getByLabelText('Tipo de información'),'organizations');await userEvent.type(screen.getByLabelText('País'),'Bolivia');
    await userEvent.click(screen.getByRole('button',{name:'Calcular resumen'}));await screen.findByRole('button',{name:'Descargar XLSX'});
    fetchMock.mockImplementation(()=>Promise.resolve(new Response(null,{status:500})));await userEvent.click(screen.getByRole('button',{name:'Descargar XLSX'}));
    expect(await screen.findByRole('alert')).toBeVisible();expect(screen.getByLabelText('País')).toHaveValue('Bolivia');expect(screen.getByRole('button',{name:'Descargar XLSX'})).toBeEnabled();
  });
  it.each(['ADMINISTRATOR', 'BOARD', 'RESEARCH', 'PLANNING'] as const)('muestra los dominios legibles a %s', role => {
    view(identity(role));
    expect(screen.getByRole('heading', { name: 'Exportar Excel' })).toBeInTheDocument();
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
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:export');
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
