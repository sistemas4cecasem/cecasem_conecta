import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { createQueryClient } from '../../lib/query/query-client';
import { AUTH_QUERY_KEY, type AuthIdentity } from '../auth/session';
import { NotificationIndicator, NotificationsPage } from './notifications-page';
import { notificationSchema, type Notification } from './contracts';

const identity: AuthIdentity = {id:'22222222-2222-4222-8222-222222222222',givenNames:'Ana',familyNames:'QA',username:'ana',email:'ana@example.test',role:'PLANNING',permissions:['notifications.read','notifications.mark_read']};
const base={id:'11111111-1111-4111-8111-111111111111',createdAt:'2026-10-04T10:00:00.000Z',readAt:null};
const meeting={id:'33333333-3333-4333-8333-333333333333',scheduledAt:'2026-10-05T14:00:00.000Z',timezone:'America/La_Paz',purpose:'Continuidad institucional',processId:null,opportunityId:null};
function row(type:Exclude<Notification['type'],'INTENT_INACTIVITY_REMINDER'|'PROCESS_INACTIVITY_REMINDER'>):Notification {
  if(type==='PROCESS_ACHIEVED')return {...base,type,opportunity:null,meeting:null,process:{id:meeting.id,purpose:'Proceso institucional concretado',context:'Institución QA',occurredAt:'2026-10-03T10:00:00.000Z'}};
  if(type==='OPPORTUNITY_CREATED'||type==='OPPORTUNITY_DISCARDED'||type==='OPPORTUNITY_FINISHED')return {...base,type,opportunity:{id:meeting.id,name:'Convocatoria institucional',status:'PENDING_REVIEW'},meeting:null};
  return {...base,type,meeting,opportunity:null};
}
function Destination(){const location=useLocation();return <p>Destino {location.pathname}{location.state?.notificationReadFailed?' · lectura pendiente':''}</p>;}
describe('Centro P1 mixto',()=>{
  let client=createQueryClient(),rows:Notification[],failRead=false;
  const fetchMock=vi.fn<(url:string,options?:RequestInit)=>Promise<Response>>();
  beforeEach(()=>{
    client=createQueryClient();client.setQueryData(AUTH_QUERY_KEY,identity);rows=[row('MEETING_CREATED')];failRead=false;fetchMock.mockReset();
    fetchMock.mockImplementation(async(url,options)=>{
      if(url.endsWith('/auth/me'))return Response.json(identity);
      if(url.endsWith('/unread-count'))return Response.json({count:rows.filter(r=>!r.readAt).length});
      if(options?.method==='PATCH'){if(failRead)return Response.json({},{status:503});rows[0]={...rows[0]!,readAt:'2026-10-04T10:01:00.000Z'};return Response.json(rows[0]);}
      return Response.json({items:rows,nextCursor:null});
    });vi.stubGlobal('fetch',fetchMock);
  });
  function view(){return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/notifications']}><NotificationIndicator identity={identity}/><Routes><Route path="notifications" element={<NotificationsPage/>}/><Route path="meetings/:id" element={<Destination/>}/><Route path="opportunities/:id" element={<Destination/>}/><Route path="relationship-processes/:id" element={<Destination/>}/></Routes></MemoryRouter></QueryClientProvider>);}
  it.each([
    ['PROCESS_ACHIEVED','Proceso concretado'],
    ['OPPORTUNITY_CREATED','Nueva oportunidad'],['OPPORTUNITY_DISCARDED','Oportunidad descartada'],['OPPORTUNITY_FINISHED','Oportunidad finalizada'],
    ['MEETING_CREATED','Nueva reunión'],['MEETING_CANCELLED','Reunión cancelada'],['MEETING_COMPLETED','Reunión realizada'],
    ['MEETING_PARTICIPANT_ADDED','Fuiste incorporado a una reunión'],['MEETING_RESCHEDULED','Cambio de planificación de reunión'],
  ] as const)('presenta %s con etiqueta comprensible',async(type,label)=>{rows=[row(type)];view();expect(await screen.findByText(label)).toBeVisible();expect(screen.queryByText(type)).not.toBeInTheDocument();});
  it('muestra propósito, hora con zona explícita y badge de reunión',async()=>{view();expect(await screen.findByText('Continuidad institucional')).toBeVisible();expect(screen.getByText(/America\/La_Paz/)).toBeVisible();expect(screen.getByLabelText('1 notificaciones no leídas')).toBeVisible();});
  it('abre reunión, registra lectura y disminuye contador',async()=>{view();await userEvent.click(await screen.findByRole('button',{name:'Abrir reunión'}));expect(await screen.findByText('Destino /meetings/'+meeting.id)).toBeVisible();await waitFor(()=>expect(screen.queryByLabelText(/notificaciones no leídas/)).not.toBeInTheDocument());});
  it('navega a reunión aunque falle marcado y conserva contador',async()=>{failRead=true;view();await userEvent.click(await screen.findByRole('button',{name:'Abrir reunión'}));expect(await screen.findByText('Destino /meetings/'+meeting.id+' · lectura pendiente')).toBeVisible();expect(screen.getByLabelText('1 notificaciones no leídas')).toBeVisible();});
  it('nuevo tipo de oportunidad mantiene navegación',async()=>{rows=[row('OPPORTUNITY_DISCARDED')];view();await userEvent.click(await screen.findByRole('button',{name:'Abrir oportunidad'}));expect(await screen.findByText('Destino /opportunities/'+meeting.id)).toBeVisible();});
  it.each([false,true])('proceso navega y conserva contador coherente ante fallo de lectura %s',async failure=>{
    rows=[row('PROCESS_ACHIEVED')];failRead=failure;view();expect(await screen.findByText('Institución QA')).toBeVisible();
    expect(screen.getByText(/Concretado el/)).toBeVisible();await userEvent.click(screen.getByRole('button',{name:'Abrir proceso'}));
    expect(await screen.findByText('Destino /relationship-processes/'+meeting.id+(failure?' · lectura pendiente':''))).toBeVisible();
    if(failure)expect(screen.getByLabelText('1 notificaciones no leídas')).toBeVisible();
    else await waitFor(()=>expect(screen.queryByLabelText(/notificaciones no leídas/)).not.toBeInTheDocument());
  });
  it('proceso exige contexto exclusivo y fecha del hecho válida',()=>{
    expect(notificationSchema.safeParse({...row('PROCESS_ACHIEVED'),process:null}).success).toBe(false);
    expect(notificationSchema.safeParse({...row('PROCESS_ACHIEVED'),meeting}).success).toBe(false);
  });
  it('rechaza contratos con tipo/contexto incoherentes',()=>{expect(notificationSchema.safeParse({...row('MEETING_CREATED'),meeting:null}).success).toBe(false);expect(notificationSchema.safeParse({...row('OPPORTUNITY_CREATED'),meeting}).success).toBe(false);});
});
