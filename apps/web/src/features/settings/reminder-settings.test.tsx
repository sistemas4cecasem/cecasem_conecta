import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { createQueryClient } from '../../lib/query/query-client';
import { AUTH_QUERY_KEY, type AuthIdentity } from '../auth/session';
import { ReminderSettingsPage } from './reminder-settings-page';

const admin:AuthIdentity={id:'admin',givenNames:'Ana',familyNames:'QA',username:'ana',email:'ana@example.test',role:'ADMINISTRATOR',permissions:['settings.reminders.update']};
describe('Configuración administrativa de recordatorios',()=>{
  let client=createQueryClient(),identity=admin,config={intervalDays:7,version:1},mode='ok';
  const fetchMock=vi.fn<(url:string,options?:RequestInit)=>Promise<Response>>();
  beforeEach(()=>{client=createQueryClient();identity=admin;config={intervalDays:7,version:1};mode='ok';fetchMock.mockReset();fetchMock.mockImplementation(async(url,options)=>{
    if(url.endsWith('/auth/me'))return Response.json(identity);
    if(mode==='pending')return new Promise<Response>(()=>undefined);
    if(mode==='error')return Response.json({},{status:500});
    if(options?.method==='PATCH'){
      if(mode==='conflict')return Response.json({},{status:409});if(mode==='forbidden')return Response.json({},{status:403});
      const input=JSON.parse(options.body as string) as {intervalDays:number;expectedVersion:number};expect(input.expectedVersion).toBe(config.version);config={intervalDays:input.intervalDays,version:config.version+1};
    }
    return Response.json(config);
  });vi.stubGlobal('fetch',fetchMock);});
  function view(){client.setQueryData(AUTH_QUERY_KEY,identity);render(<QueryClientProvider client={client}><MemoryRouter><ReminderSettingsPage/></MemoryRouter></QueryClientProvider>);}
  it('muestra siete días y guarda propuesta con confirmación',async()=>{view();const input=await screen.findByLabelText('Intervalo de inactividad (días)');expect(input).toHaveValue(7);await userEvent.clear(input);await userEvent.type(input,'5');await userEvent.click(screen.getByRole('button',{name:'Guardar intervalo'}));expect(await screen.findByText(/Intervalo guardado/)).toBeVisible();expect(config).toEqual({intervalDays:5,version:2});});
  it.each(['RESEARCH','BOARD','PLANNING'] as const)('oculta formulario y no consulta settings a %s',async role=>{identity={...admin,role,permissions:[]};view();expect(await screen.findByRole('alert')).toHaveTextContent('No tiene permiso');expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();expect(fetchMock.mock.calls.some(([url])=>url.endsWith('settings/reminders'))).toBe(false);});
  it('valida mínimo sin enviar',async()=>{view();const input=await screen.findByRole('spinbutton');await userEvent.clear(input);await userEvent.type(input,'0');await userEvent.click(screen.getByRole('button',{name:'Guardar intervalo'}));expect(config.intervalDays).toBe(7);expect(fetchMock.mock.calls.some(([,options])=>options?.method==='PATCH')).toBe(false);});
  it('conflicto conserva propuesta y permite recargar versión',async()=>{view();const input=await screen.findByRole('spinbutton');await userEvent.clear(input);await userEvent.type(input,'5');mode='conflict';await userEvent.click(screen.getByRole('button',{name:'Guardar intervalo'}));expect(await screen.findByText(/Los intervalos cambiaron/)).toBeVisible();expect(input).toHaveValue(5);mode='ok';config={intervalDays:14,version:2};await userEvent.click(screen.getByRole('button',{name:'Recargar ficha y descartar cambios'}));await waitFor(()=>expect(screen.getByRole('spinbutton')).toHaveValue(14));});
  it('muestra loading',async()=>{mode='pending';view();expect(await screen.findByRole('status')).toHaveTextContent('Cargando');});
  it('muestra error y recupera consulta',async()=>{mode='error';view();expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar');mode='ok';await userEvent.click(screen.getByRole('button',{name:'Reintentar'}));expect(await screen.findByRole('spinbutton')).toHaveValue(7);});
  it('muestra rechazo backend al guardar',async()=>{view();await screen.findByRole('spinbutton');mode='forbidden';await userEvent.click(screen.getByRole('button',{name:'Guardar intervalo'}));expect(await screen.findByRole('alert')).toBeVisible();expect(config.version).toBe(1);});
});
