import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import userEvent from '@testing-library/user-event';
import { createQueryClient } from '../../lib/query/query-client';
import { AUTH_QUERY_KEY, type AuthIdentity } from '../auth/session';
import { VerificationSettingsPage } from './verification-settings-page';

const admin: AuthIdentity = {id:'admin',givenNames:'Ana',familyNames:'QA',username:'ana',email:'ana@example.test',role:'ADMINISTRATOR',permissions:['settings.verification.update']};
describe('UI 2.9 configuración de verificación', () => {
  let client=createQueryClient(), identity=admin, config={personalVerificationMonths:8,institutionalVerificationMonths:18,version:4};
  const fetchMock=vi.fn<(url:string,options?:RequestInit)=>Promise<Response>>();
  beforeEach(()=>{
    client=createQueryClient();identity=admin;config={personalVerificationMonths:8,institutionalVerificationMonths:18,version:4};fetchMock.mockReset();
    fetchMock.mockImplementation(async(url,options)=>{
      if(url.endsWith('/auth/me'))return Response.json(identity);
      if(options?.method==='PUT')config={...JSON.parse(String(options.body)) as typeof config,version:config.version+1};
      return Response.json(config);
    });vi.stubGlobal('fetch',fetchMock);
  });
  function view(){client.setQueryData(AUTH_QUERY_KEY,identity);render(<QueryClientProvider client={client}><MemoryRouter><VerificationSettingsPage/></MemoryRouter></QueryClientProvider>);}
  it('carga ambos valores vigentes con meses y una cabecera única',async()=>{
    view();expect(await screen.findByLabelText('Información personal (meses)')).toHaveValue(8);
    expect(screen.getByLabelText('Información institucional (meses)')).toHaveValue(18);
    expect(screen.getAllByRole('heading',{level:1})).toHaveLength(1);
    expect(screen.getByLabelText('Información institucional (meses)')).toHaveAccessibleDescription('Meses calendario, de 1 a 120.');
    expect(screen.getByText(/modificar información no equivale a verificarla/)).toBeVisible();
    expect(screen.getByText(/no modifica fechas ni evidencias históricas/)).toBeVisible();
  });
  it('guarda explícitamente los dos intervalos y versión esperada',async()=>{
    view();const input=await screen.findByLabelText('Información personal (meses)');fireEvent.change(input,{target:{value:'9'}});
    expect(fetchMock.mock.calls.some(([,options])=>options?.method==='PUT')).toBe(false);
    await userEvent.click(screen.getByRole('button',{name:'Guardar intervalos'}));await screen.findByRole('status');
    const call=fetchMock.mock.calls.find(([,options])=>options?.method==='PUT');
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({personalVerificationMonths:9,institutionalVerificationMonths:18,expectedVersion:4});
  });
  it.each(['Información personal (meses)','Información institucional (meses)'])('asocia mínimo, máximo y enteros a %s sin enviar',async label=>{
    view();const input=await screen.findByLabelText(label);
    for(const [value,message] of [[0,'El mínimo es 1 mes.'],[121,'El máximo es 120 meses.'],[1.5,'Use meses enteros.']] as const){
      fireEvent.change(input,{target:{value:String(value)}});fireEvent.submit(input.closest('form')!);
      await waitFor(()=>expect(input).toHaveAccessibleDescription('Meses calendario, de 1 a 120. '+message));
      expect(input).toHaveAttribute('aria-invalid','true');
    }
    expect(fetchMock.mock.calls.some(([,options])=>options?.method==='PUT')).toBe(false);
  });
  it.each(['BOARD','RESEARCH','PLANNING'] as const)('%s sin capability no consulta ni muestra formularios',async role=>{
    identity={...admin,role,permissions:[]};view();expect(await screen.findByRole('alert')).toHaveTextContent('No tiene permiso');
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(screen.getAllByRole('heading',{level:1})).toHaveLength(1);
    expect(fetchMock.mock.calls.some(([url])=>url.endsWith('/settings/verification'))).toBe(false);
  });
  it('la capability autoriza independientemente del nombre de rol',async()=>{
    identity={...admin,role:'BOARD'};view();expect(await screen.findByLabelText('Información personal (meses)')).toHaveValue(8);
  });
  it('muestra carga sin habilitar guardado',async()=>{
    fetchMock.mockImplementation(()=>new Promise(()=>{}));view();expect(await screen.findByRole('status')).toHaveTextContent('Cargando');
    expect(screen.queryByRole('button',{name:'Guardar intervalos'})).not.toBeInTheDocument();
  });
  it('recupera consulta mediante reintento',async()=>{
    const original=fetchMock.getMockImplementation()!;fetchMock.mockImplementation(url=>url.endsWith('/auth/me')?original(url):Promise.resolve(new Response(null,{status:500})));
    view();expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar');fetchMock.mockImplementation(original);
    await userEvent.click(screen.getByRole('button',{name:'Reintentar'}));expect(await screen.findByLabelText('Información personal (meses)')).toHaveValue(8);
  });
  it('conserva propuesta tras error al guardar',async()=>{
    view();const input=await screen.findByLabelText('Información personal (meses)');fireEvent.change(input,{target:{value:'9'}});
    const original=fetchMock.getMockImplementation()!;fetchMock.mockImplementation((url,options)=>options?.method==='PUT'?Promise.resolve(new Response(null,{status:500})):original(url,options));
    await userEvent.click(screen.getByRole('button',{name:'Guardar intervalos'}));expect(await screen.findByRole('alert')).toBeVisible();
    expect(input).toHaveValue(9);expect(config.version).toBe(4);
  });
  it('bloquea guardar durante la petición sin alterar sus valores',async()=>{
    view();const input=await screen.findByLabelText('Información personal (meses)');const original=fetchMock.getMockImplementation()!;
    let complete!:(r:Response)=>void;fetchMock.mockImplementation((url,options)=>options?.method==='PUT'?new Promise(resolve=>{complete=resolve;}):original(url,options));
    await userEvent.click(screen.getByRole('button',{name:'Guardar intervalos'}));expect(screen.getByRole('button',{name:'Guardar intervalos'})).toBeDisabled();
    expect(screen.getByRole('button',{name:'Guardar intervalos'})).toHaveAttribute('aria-busy','true');expect(input).toHaveValue(8);
    await act(async()=>complete(Response.json(config)));
  });
});
