import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRequest, ApiError } from '../../lib/api/client';
import { AUTH_QUERY_KEY, type AuthIdentity } from '../auth/session';
import { CommunicationTranslation } from './communication-translation';
vi.mock('../../lib/api/client',async original=>({...await original<typeof import('../../lib/api/client')>(),apiRequest:vi.fn()}));
const identity:AuthIdentity={id:'11111111-1111-4111-8111-111111111111',givenNames:'QA',familyNames:'Traducción',username:'qa',email:'qa@example.test',role:'RESEARCH',permissions:['translations.read','translations.request','communications.read','relationships.process.read']};
const id='22222222-2222-4222-8222-222222222222';
const translation={id:'33333333-3333-4333-8333-333333333333',communicationId:id,targetLanguage:'es',detectedSourceLanguage:'en',translatedText:'Cooperación institucional',createdAt:'2026-10-04T12:00:00Z'};
const api=vi.mocked(apiRequest);
describe('Traducción bajo demanda en detalle',()=>{
  beforeEach(()=>api.mockReset());
  function view(actor=identity,body='Institutional cooperation',invalidated=false){const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});client.setQueryData(AUTH_QUERY_KEY,actor);
    const content=(who:AuthIdentity)=><QueryClientProvider client={client}><p>{invalidated?'INVALIDADA':'Registro válido'}</p><h2>Cuerpo original</h2><pre>{body}</pre><CommunicationTranslation key={who.id} identity={who} id={id} body={body}/></QueryClientProvider>;
    return {...render(content(actor)),client,content};
  }
  it('solo consulta al abrir; solicita al pulsar, preserva original y distingue traducción',async()=>{
    api.mockImplementation(async(_path,options)=>options?.method==='POST'?translation:null);view();await userEvent.click(await screen.findByRole('button',{name:'Traducir al español'}));
    expect(await screen.findByText('Cooperación institucional')).toBeVisible();expect(screen.getByText('Institutional cooperation')).toBeVisible();expect(screen.getByRole('heading',{name:'Traducción al español'})).toBeVisible();expect(api.mock.calls.filter(call=>call[1]?.method==='POST')).toHaveLength(1);
  });
  it('loading conserva original y evita doble solicitud',async()=>{
    let resolve!:(value:unknown)=>void;api.mockImplementation(async(_path,options)=>options?.method==='POST'?new Promise(done=>resolve=done):null);view();await userEvent.click(await screen.findByRole('button',{name:'Traducir al español'}));expect(await screen.findByRole('button',{name:'Traduciendo…'})).toBeDisabled();expect(screen.getByText('Institutional cooperation')).toBeVisible();resolve(translation);expect(await screen.findByText('Cooperación institucional')).toBeVisible();
  });
  it('cached e invalidada siguen visibles sin POST',async()=>{api.mockResolvedValue(translation);view(identity,undefined,true);expect(await screen.findByText('Cooperación institucional')).toBeVisible();expect(screen.getByText('INVALIDADA')).toBeVisible();expect(screen.getByText('Institutional cooperation')).toBeVisible();expect(screen.queryByRole('button',{name:'Traducir al español'})).not.toBeInTheDocument();expect(api.mock.calls.every(call=>call[1]?.method!=='POST')).toBe(true);});
  it('fallo seguro conserva original y permite reintentar',async()=>{
    let fail=true;api.mockImplementation(async(_path,options)=>{if(options?.method!=='POST')return null;if(fail)throw new ApiError('El servicio de traducción no está disponible. El original continúa disponible.',503);return translation;});view();await userEvent.click(await screen.findByRole('button',{name:'Traducir al español'}));expect(await screen.findByRole('alert')).toHaveTextContent('El original continúa disponible');expect(screen.getByText('Institutional cooperation')).toBeVisible();fail=false;await userEvent.click(screen.getByRole('button',{name:'Reintentar traducción'}));expect(await screen.findByText('Cooperación institucional')).toBeVisible();
  });
  it('error de consulta permite retry sin POST automático',async()=>{api.mockRejectedValueOnce(new ApiError('No disponible',503)).mockResolvedValue(null);view();await userEvent.click(await screen.findByRole('button',{name:'Reintentar consulta'}));expect(await screen.findByRole('button',{name:'Traducir al español'})).toBeVisible();expect(api.mock.calls.every(call=>call[1]?.method!=='POST')).toBe(true);});
  it.each(['ADMINISTRATOR','BOARD','RESEARCH','PLANNING'] as const)('rol %s usa capabilities explícitas',async role=>{api.mockResolvedValue(null);view({...identity,role});expect(await screen.findByRole('button',{name:'Traducir al español'})).toBeVisible();});
  it('sin permiso no consulta ni muestra acción',()=>{view({...identity,permissions:[]});expect(api).not.toHaveBeenCalled();expect(screen.queryByRole('button')).not.toBeInTheDocument();});
  it('sin texto significativo no ofrece solicitud vacía',async()=>{api.mockResolvedValue(null);view(identity,' \n');expect(await screen.findByText('Este registro no tiene texto para traducir.')).toBeVisible();expect(screen.queryByRole('button')).not.toBeInTheDocument();});
  it('respuesta tardía no se aplica a otra identidad',async()=>{
    let resolve!:(value:unknown)=>void;api.mockImplementation(async(_path,options)=>options?.method==='POST'?new Promise(done=>resolve=done):null);
    const rendered=view();await userEvent.click(await screen.findByRole('button',{name:'Traducir al español'}));const other={...identity,id:'44444444-4444-4444-8444-444444444444'};rendered.client.setQueryData(AUTH_QUERY_KEY,other);rendered.rerender(rendered.content(other));resolve(translation);await waitFor(()=>expect(screen.getByRole('button',{name:'Traducir al español'})).toBeVisible());expect(screen.queryByText('Cooperación institucional')).not.toBeInTheDocument();
  });
});
