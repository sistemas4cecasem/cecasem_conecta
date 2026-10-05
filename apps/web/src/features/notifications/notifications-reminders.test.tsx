import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { createQueryClient } from '../../lib/query/query-client';
import { AUTH_QUERY_KEY, type AuthIdentity } from '../auth/session';
import { NotificationIndicator, NotificationsPage } from './notifications-page';
import { notificationSchema, type Notification } from './contracts';

const identity:AuthIdentity={id:'22222222-2222-4222-8222-222222222222',givenNames:'Ana',familyNames:'QA',username:'ana',email:'ana@example.test',role:'RESEARCH',permissions:['notifications.read','notifications.mark_read']};
const id='33333333-3333-4333-8333-333333333333';
const base={id:'11111111-1111-4111-8111-111111111111',createdAt:'2026-10-04T12:00:00.000Z',readAt:null,opportunity:null,meeting:null};
const reminder={id,purpose:'Revisar cooperación',context:'Institución CECASEM',inactivityAnchorAt:'2026-09-27T12:00:00.000Z',dueAt:'2026-10-04T12:00:00.000Z',intervalDays:7};
function row(kind:'intent'|'process'):Notification{return kind==='intent'?{...base,type:'INTENT_INACTIVITY_REMINDER',reminder:{...reminder,intentId:id,processId:null}}:{...base,type:'PROCESS_INACTIVITY_REMINDER',reminder:{...reminder,intentId:null,processId:id}};}
function Destination(){const location=useLocation();return <p>Destino {location.pathname}{location.state?.notificationReadFailed?' · lectura pendiente':''}</p>;}
describe('Recordatorios en centro existente',()=>{
  let client=createQueryClient(),rows:Notification[]=[],failRead=false;
  const fetchMock=vi.fn<(url:string,options?:RequestInit)=>Promise<Response>>();
  beforeEach(()=>{client=createQueryClient();client.setQueryData(AUTH_QUERY_KEY,identity);rows=[row('intent')];failRead=false;fetchMock.mockReset();fetchMock.mockImplementation(async(url,options)=>{
    if(url.endsWith('/auth/me'))return Response.json(identity);
    if(url.endsWith('/unread-count'))return Response.json({count:rows.filter(row=>!row.readAt).length});
    if(options?.method==='PATCH'){if(failRead)return Response.json({},{status:503});rows[0]={...rows[0]!,readAt:base.createdAt};return Response.json(rows[0]);}
    return Response.json({items:rows,nextCursor:null});
  });vi.stubGlobal('fetch',fetchMock);});
  function view(){render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/notifications']}><NotificationIndicator identity={identity}/><Routes><Route path="notifications" element={<NotificationsPage/>}/><Route path="contact-intents/:id" element={<Destination/>}/><Route path="relationship-processes/:id" element={<Destination/>}/></Routes></MemoryRouter></QueryClientProvider>);}
  it.each([['intent','Intención sin actividad','Abrir intención','contact-intents'],['process','Proceso sin actividad','Abrir proceso','relationship-processes']] as const)('presenta %s y navega a ruta canónica con lectura',async(kind,label,button,path)=>{
    rows=[row(kind)];view();expect(await screen.findByText(label)).toBeVisible();expect(screen.getByText('Revisar cooperación')).toBeVisible();expect(screen.getByText('Institución CECASEM')).toBeVisible();expect(screen.getByText(/Sin actividad desde.*UTC.*7 días/)).toBeVisible();
    expect(screen.getByLabelText('1 notificaciones no leídas')).toBeVisible();await userEvent.click(screen.getByRole('button',{name:button}));expect(await screen.findByText('Destino /'+path+'/'+id)).toBeVisible();await waitFor(()=>expect(screen.queryByLabelText('1 notificaciones no leídas')).not.toBeInTheDocument());
  });
  it('fallo de lectura conserva navegación y contador',async()=>{failRead=true;view();await userEvent.click(await screen.findByRole('button',{name:'Abrir intención'}));expect(await screen.findByText('Destino /contact-intents/'+id+' · lectura pendiente')).toBeVisible();expect(screen.getByLabelText('1 notificaciones no leídas')).toBeVisible();});
  it('conviven ambos tipos con oportunidad en el centro',async()=>{rows=[row('intent'),{...row('process'),id}, {...base,id:'44444444-4444-4444-8444-444444444444',type:'OPPORTUNITY_CREATED',opportunity:{id,name:'Convocatoria',status:'PENDING_REVIEW'},meeting:null}];view();expect(await screen.findByText('Intención sin actividad')).toBeVisible();expect(screen.getByText('Proceso sin actividad')).toBeVisible();expect(screen.getByText('Nueva oportunidad')).toBeVisible();});
  it('rechaza tipo sin occurrence y contexto incoherente',()=>{expect(notificationSchema.safeParse({...row('intent'),reminder:null}).success).toBe(false);expect(notificationSchema.safeParse({...row('intent'),reminder:{...reminder,intentId:id,processId:id}}).success).toBe(false);});
});
