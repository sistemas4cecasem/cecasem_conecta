import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../../app/router/app-routes';
import { createQueryClient } from '../../lib/query/query-client';
import { AUTH_QUERY_KEY } from './session';

describe('Contraseña inicial y cambio obligatorio en interfaz', () => {
  let client=createQueryClient(); let authenticated=true; let required=true; let sessionUnavailable=false;
  const identity={id:'fixture',givenNames:'Ana',familyNames:'Prueba',username:'ana.prueba',email:'fixture@example.test',role:'RESEARCH',permissions:['directory.read']};
  const password='Aa!'+crypto.randomUUID(); const fetchMock=vi.fn(); let changeResult:()=>Promise<Response>;let logoutResult:()=>Promise<Response>;
  beforeEach(()=>{
    client=createQueryClient();authenticated=true;required=true;sessionUnavailable=false;localStorage.clear();sessionStorage.clear();
    changeResult=async()=>{required=false;return new Response(null,{status:204});};
    logoutResult=async()=>{authenticated=false;return new Response(null,{status:204});};
    fetchMock.mockReset().mockImplementation((url:string, options?:RequestInit)=>{
      if(url.endsWith('/auth/me')&&!options?.method&&sessionUnavailable)return Promise.reject(new TypeError('network'));
      if(url.endsWith('/auth/me')&&!options?.method) return Promise.resolve(authenticated?Response.json({...identity,...(required?{mustChangePassword:true}:{})}):new Response(null,{status:401}));
      if(url?.endsWith('/auth/change-password')&&options?.method==='POST')return changeResult();
      if(url.endsWith('/auth/logout')&&options?.method==='POST')return logoutResult();
      if(url.endsWith('/dashboard')&&!options?.method)return Promise.resolve(Response.json({view:'research',asOf:'2026-10-13T00:00:00Z',activeProcesses:0,relevantProcesses:[],activeIntents:0,relevantIntents:[],unreadReminders:0,reminderItems:[]}));
      throw new Error('Solicitud inesperada: '+url);
    });vi.stubGlobal('fetch',fetchMock);
  });
  afterEach(()=>{client.clear();vi.unstubAllGlobals();});
  function app(path='/change-password'){render(<StrictMode><QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><AppRoutes/></MemoryRouter></QueryClientProvider></StrictMode>);}
  async function submit(value=password, confirmation=value){const user=userEvent.setup();await screen.findByLabelText(/Contraseña nueva/);await user.click(screen.getByLabelText(/Contraseña nueva/));await user.paste(value);await user.click(screen.getByLabelText(/Confirmar contraseña/));await user.paste(confirmation);await user.click(screen.getByRole('button',{name:'Cambiar contraseña'}));}
  const calls=()=>fetchMock.mock.calls.filter(([url]:string[])=>url?.endsWith('/auth/change-password'));
  it.each(['/','/organizations','/people','/users'])('bloquea %s sin solicitar datos protegidos',async path=>{
    app(path);expect(await screen.findByRole('heading',{name:'Cambia tu contraseña'})).toBeVisible();expect(fetchMock.mock.calls.every(([url]:string[])=>url?.endsWith('/auth/me'))).toBe(true);
  });
  it('controles accesibles, política actual y ausencia de consumo automático',async()=>{
    app();await screen.findByLabelText(/Contraseña nueva/);expect(screen.getAllByRole('heading',{level:1})).toHaveLength(1);
    for(const label of ['Contraseña nueva','Confirmar contraseña']) {expect(screen.getByLabelText(new RegExp(label))).toHaveAttribute('type','password');expect(screen.getByLabelText(new RegExp(label))).toHaveAttribute('autocomplete','new-password');}
    expect(calls()).toHaveLength(0);
  });
  it.each(['Aa!1234','aa!12345','AA!12345','Aa123456','Aa!'+ '😀'.repeat(126)])('política inválida no llega a API',async value=>{
    app();await submit(value);expect(calls()).toHaveLength(0);expect(screen.getByLabelText(/Contraseña nueva/)).toHaveAttribute('aria-invalid','true');
  });
  it('confirmación distinta no se envía y error está asociado al campo',async()=>{app();await submit(password,'Distinta!');expect(calls()).toHaveLength(0);expect(screen.getByLabelText(/Confirmar contraseña/)).toHaveAccessibleDescription('Las contraseñas no coinciden.');});
  it.each(['Aa!12345','Aa!'+ '😀'.repeat(125),'A!'+ 'é'.repeat(6)])('acepta límites y confirmación NFC sin enviar confirmación',async value=>{
    app();await submit(value,value.normalize('NFD'));await waitFor(()=>expect(calls()).toHaveLength(1));expect(JSON.parse(calls()[0]![1].body)).toEqual({password:value});expect(calls()[0]![1].credentials).toBe('include');
    await waitFor(()=>expect(client.getQueryData(AUTH_QUERY_KEY)).toEqual(identity));expect(screen.queryByLabelText(/Contraseña nueva/)).not.toBeInTheDocument();
    expect(localStorage.length).toBe(0);expect(sessionStorage.length).toBe(0);expect(JSON.stringify(client.getQueryCache().getAll().map(q=>q.state.data))).not.toContain(value);expect(client.getMutationCache().getAll()).toHaveLength(0);
  });
  it('limpia los campos al enviar y bloquea repetición mientras espera',async()=>{
    let finish!:(value:Response)=>void;changeResult=()=>new Promise(resolve=>{finish=resolve;});app();await submit();
    expect(screen.getByLabelText(/Contraseña nueva/)).toHaveValue('');expect(screen.getByLabelText(/Confirmar contraseña/)).toHaveValue('');expect(screen.getByRole('button',{name:'Cambiando contraseña…'})).toBeDisabled();
    await userEvent.click(screen.getByRole('button',{name:'Cambiando contraseña…'}));expect(calls()).toHaveLength(1);required=false;finish(new Response(null,{status:204}));await waitFor(()=>expect(screen.queryByLabelText(/Contraseña nueva/)).not.toBeInTheDocument());
  });
  it.each([400,403,409,500])('error HTTP %s conserva bloqueo y admite corrección explícita',async status=>{
    changeResult=async()=>Response.json({message:'Cambio rechazado por el servidor.'},{status});app();await submit();const messages:Record<number,string>={400:'La solicitud no es válida',403:'No tienes permiso',409:'La solicitud entra en conflicto',500:'No se pudo completar'};expect(await screen.findByRole('alert')).toHaveTextContent(messages[status]!);expect(screen.getByLabelText(/Contraseña nueva/)).toHaveValue('');
    changeResult=async()=>{required=false;return new Response(null,{status:204});};await submit();await waitFor(()=>expect(calls()).toHaveLength(2));
  });
  it('fallo de red no libera funcionalidades ni conserva contraseña',async()=>{changeResult=()=>Promise.reject(new TypeError('network'));app();await submit();expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo conectar');expect(screen.getByLabelText(/Contraseña nueva/)).toHaveValue('');expect(required).toBe(true);});
  it('sesión revocada vuelve al acceso al refrescar',async()=>{app();await screen.findByLabelText(/Contraseña nueva/);authenticated=false;await client.invalidateQueries({queryKey:AUTH_QUERY_KEY});expect(await screen.findByRole('heading',{name:'Iniciar sesión'})).toBeVisible();expect(calls()).toHaveLength(0);});
  it('éxito sin confirmación de me mantiene el bloqueo',async()=>{changeResult=async()=>new Response(null,{status:204});app();await submit();await waitFor(()=>expect(calls()).toHaveLength(1));expect(await screen.findByLabelText(/Contraseña nueva/)).toBeVisible();});
  it('logout borra caché privada y no intenta cambio',async()=>{app();await screen.findByLabelText(/Contraseña nueva/);client.setQueryData(['private'],{dato:true});await userEvent.click(screen.getByRole('button',{name:'Cerrar sesión'}));expect(await screen.findByRole('heading',{name:'Iniciar sesión'})).toBeVisible();expect(client.getQueryData(['private'])).toBeUndefined();expect(calls()).toHaveLength(0);});
  it('fallo de logout mantiene bloqueo y permite reintentar',async()=>{logoutResult=async()=>new Response(null,{status:500});app();await screen.findByLabelText(/Contraseña nueva/);await userEvent.click(screen.getByRole('button',{name:'Cerrar sesión'}));expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo completar');expect(screen.getByLabelText(/Contraseña nueva/)).toBeVisible();});
  it('fallo de comprobación no envía cambios y ofrece reintento',async()=>{sessionUnavailable=true;app();expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo comprobar');expect(calls()).toHaveLength(0);sessionUnavailable=false;await userEvent.click(screen.getByRole('button',{name:'Reintentar'}));expect(await screen.findByLabelText(/Contraseña nueva/)).toBeVisible();});
  it('anónimo no ve el formulario',async()=>{authenticated=false;app();expect(await screen.findByRole('heading',{name:'Iniciar sesión'})).toBeVisible();expect(screen.queryByLabelText(/Contraseña nueva/)).not.toBeInTheDocument();});
});
