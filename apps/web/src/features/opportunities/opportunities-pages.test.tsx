import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import { createQueryClient } from '../../lib/query/query-client';
import { AUTH_QUERY_KEY, type AuthIdentity } from '../auth/session';
import { OpportunitiesPage, OpportunityCreatePage, OpportunityDetailPage } from './opportunities-pages';
import { deadlineLabel, descriptionFormSchema, stateFormSchema, type Opportunity } from './contracts';
import { clearForbiddenOpportunities, opportunityIdentityKey } from './queries';
const id = '11111111-1111-4111-8111-111111111111', orgId = '33333333-3333-4333-8333-333333333333';
const identity: AuthIdentity = { id: '22222222-2222-4222-8222-222222222222', givenNames: 'Ana', familyNames: 'QA', username: 'ana', email: 'ana@example.test', role: 'PLANNING', permissions: ['opportunities.read', 'opportunities.create', 'opportunities.update', 'opportunities.state.change', 'opportunities.discard', 'opportunities.finish', 'directory.read', 'relationships.process.read', 'communications.read', 'files.read', 'files.upload'] };
const fixture: Opportunity = { id, name: 'Beca regional', description: 'Descripción institucional', requirements: 'Requisitos iniciales', url: 'https://example.test/beca', deadline: '2026-12-31', status: 'PENDING_REVIEW', discardReason: null, finalResult: null, version: 1, createdAt: '2026-10-04T00:00:00.000Z', updatedAt: '2026-10-04T00:00:00.000Z', createdBy: { id: identity.id, displayName: 'Ana QA', isActive: true }, organizations: [{ id: orgId, name: 'Organización regional', isActive: true }], process: null, communication: null, allowedStatuses: ['PREPARING', 'DISCARDED'], canEdit: true };
describe('Oportunidades: flujos, conflictos y privacidad de identidad', () => {
  let client = createQueryClient(), row: Opportunity, status = 0;
  const fetchMock = vi.fn<(url: string, options?: RequestInit) => Promise<Response>>();
  beforeEach(() => {
    client = createQueryClient();
    client.setQueryData(AUTH_QUERY_KEY, identity);
    row = structuredClone(fixture);
    status = 0;
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url, options) => {
      if (url.endsWith('/auth/me'))
        return Response.json(identity);
      if (options?.method === 'PATCH') {
        if (status)
          return Response.json({ code: 'VERSION_CONFLICT' }, { status });
        row = { ...row, ...JSON.parse(options.body as string) as Partial<Opportunity>, version: row.version + 1 };
        return Response.json(row);
      }
      if (options?.method === 'POST') {
        if (status)
          return Response.json({ code: 'VERSION_CONFLICT' }, { status });
        const body = JSON.parse(options.body as string) as Record<string, unknown>;
        row = { ...row, ...(url.endsWith('/discard') ? { status: 'DISCARDED', discardReason: String(body.reason), allowedStatuses: [] } : url.endsWith('/state') ? { status: body.status, allowedStatuses: body.status === 'PREPARING' ? ['SUBMITTED', 'DISCARDED'] : body.status === 'SUBMITTED' ? ['FINISHED'] : [] } : body), version: row.version + 1 } as Opportunity;
        return Response.json(row, { status: 201 });
      }
      if (url.includes('/attachments?'))
        return Response.json({ items: [], total: 0, page: 1, pageSize: 25 });
      if (url.endsWith('/files/config'))
        return Response.json({ maxBytes: 20971520, maxFiles: 10 });
      if (url.includes('/history?'))
        return Response.json({ items: [], nextCursor: null });
      if (url.includes('/search?'))
        return Response.json({ query: 'regional', email: null, organizations: { items: [{ type: 'ORGANIZATION', alias: null, country: null, parent: null, id: orgId, name: 'Organización regional', isActive: true, duplicateOf: null }], total: 1, page: 1, pageSize: 25 }, people: { items: [], total: 0, page: 1, pageSize: 25 }, contactMethods: { items: [], total: 0, page: 1, pageSize: 25 } });
      if (url.includes('/opportunities?'))
        return Response.json({ items: [row], total: 1, page: 1, pageSize: 25 });
      if (url.endsWith('/opportunities/' + id))
        return Response.json(row);
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
  });
  function view(path = '/opportunities/' + id) { return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Routes><Route path="opportunities" element={<OpportunitiesPage />}/><Route path="opportunities/new" element={<OpportunityCreatePage />}/><Route path="opportunities/:id" element={<OpportunityDetailPage />}/></Routes></MemoryRouter></QueryClientProvider>); }
  it.each([[0, '0 oportunidades encontradas'], [1, '1 oportunidad encontrada'], [3, '3 oportunidades encontradas']] as const)('contador concuerda con %i oportunidades', async (total, expected) => {
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url, options) => url.includes('/opportunities?') ? Promise.resolve(Response.json({ items: total ? [row] : [], total, page: 1, pageSize: 25 })) : original(url, options));
    view('/opportunities');
    expect(await screen.findByText(expected)).toBeVisible();
  });
  it('UI 2.8 listado conserva cabecera única, contexto, fecha civil y navegación', async () => {
    view('/opportunities'); const link = await screen.findByRole('link', { name: fixture.name });
    expect(link).toHaveAttribute('href', '/opportunities/'+id); expect(screen.getAllByRole('heading',{level:1})).toHaveLength(1);
    expect(screen.getByRole('heading',{level:1})).toHaveTextContent('Oportunidades'); expect(screen.getByText('Planificación y seguimiento')).toBeVisible();
    expect(link.closest('li')?.querySelector('time')).toHaveAttribute('datetime','2026-12-31'); expect(screen.getByText('Organización regional')).toBeVisible();
    expect(screen.getByRole('region',{name:'Filtros de oportunidades'})).toHaveTextContent('1 oportunidad encontrada');
  });
  it.each(['ADMINISTRATOR','RESEARCH','BOARD','PLANNING'] as const)('UI 2.8 %s respeta capabilities de creación y modificación', async role => {
    const reader = {...identity,role,permissions:['opportunities.read']}; client.setQueryData(AUTH_QUERY_KEY,reader);
    const original=fetchMock.getMockImplementation()!; fetchMock.mockImplementation((url,options)=>url.endsWith('/auth/me')?Promise.resolve(Response.json(reader)):original(url,options));
    row={...row,canEdit:false,allowedStatuses:[]}; view(); await screen.findByRole('heading',{level:1,name:fixture.name});
    expect(screen.queryByRole('button',{name:'Editar descripción y organizaciones'})).not.toBeInTheDocument(); expect(screen.queryByLabelText('Nuevo estado')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('link',{name:'Volver a oportunidades'})); await screen.findByRole('heading',{level:1,name:'Oportunidades'});
    expect(screen.queryByRole('link',{name:'Crear oportunidad'})).not.toBeInTheDocument();
  });
  it('UI 2.8 detalle separa fecha civil, registro y antecedentes sin consultas nuevas', async () => {
    row={...row,deadline:'2026-01-01',process:{id:orgId,purpose:'Antecedente institucional'},communication:{id:orgId,subject:'Respuesta original',processId:orgId,validity:'INVALIDATED'}};
    view(); await screen.findByRole('heading',{level:1,name:fixture.name}); const region=screen.getByRole('region',{name:'Identificación y seguimiento'});
    expect(region.querySelector('time')).toHaveAttribute('datetime','2026-01-01'); expect(within(region).getByText('Fecha vencida')).toBeVisible();
    expect(within(region).getByText('Fecha de registro').parentElement?.querySelector('time')).toHaveAttribute('datetime',fixture.createdAt);
    expect(screen.getByRole('link',{name:'Proceso: Antecedente institucional'})).toHaveAttribute('href','/relationship-processes/'+orgId);
    expect(screen.getByRole('link',{name:'Comunicación: Respuesta original'})).toHaveAttribute('href','/communications/'+orgId);
    expect(fetchMock.mock.calls.some(([url])=>url.includes('/relationship-processes/')||url.includes('/communications/'))).toBe(false);
  });
  it('UI 2.8 sin fecha no fabrica vencimiento y muestra vacío paginado', async () => {
    row={...row,deadline:null}; const original=fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url,options)=>url.includes('/opportunities?')?Promise.resolve(Response.json({items:[],total:0,page:1,pageSize:25})):original(url,options));
    view('/opportunities'); await screen.findByText('No hay oportunidades para estos filtros.'); expect(screen.getByRole('button',{name:'Siguiente'})).toBeDisabled();
    expect(screen.queryByText('Fecha vencida')).not.toBeInTheDocument();
  });
  it('UI 2.8 filtro conserva origen URL y reinicia página tras paginar', async () => {
    const original=fetchMock.getMockImplementation()!; fetchMock.mockImplementation((url,options)=>url.includes('/opportunities?')?Promise.resolve(Response.json({items:[row],total:26,page:1,pageSize:25})):original(url,options));
    view('/opportunities?organizationId='+orgId+'&status=PREPARING'); await screen.findByRole('link',{name:fixture.name}); await userEvent.click(screen.getByRole('button',{name:'Siguiente'}));
    await waitFor(()=>expect(fetchMock.mock.calls.some(([url])=>url.includes('page=2'))).toBe(true)); await userEvent.selectOptions(screen.getByLabelText('Filtrar por estado'),'SUBMITTED');
    await waitFor(()=>expect(fetchMock.mock.calls.some(([url])=>url.includes('page=1&status=SUBMITTED')&&url.includes('organizationId='+orgId))).toBe(true));
  });
  it('UI 2.8 formulario asocia error al control y conserva fecha al enviar', async () => {
    view(); await userEvent.click(await screen.findByRole('button',{name:'Editar descripción y organizaciones'})); await userEvent.clear(screen.getByLabelText('Nombre')); await userEvent.click(screen.getByRole('button',{name:'Guardar cambios'}));
    expect(screen.getByLabelText('Nombre')).toHaveAttribute('aria-invalid','true'); expect(screen.getByLabelText('Nombre')).toHaveAttribute('aria-describedby');
    await userEvent.type(screen.getByLabelText('Nombre'),'Nombre válido'); await userEvent.click(screen.getByRole('button',{name:'Guardar cambios'}));
    await screen.findByRole('heading',{level:1,name:'Nombre válido'}); expect(JSON.parse(fetchMock.mock.calls.find(([,o])=>o?.method==='PATCH')?.[1]?.body as string)).toMatchObject({deadline:'2026-12-31',expectedVersion:1});
  });
  it('lista con estado, fecha civil, organizaciones y filtro', async () => { view('/opportunities'); await screen.findByRole('link', { name: 'Beca regional' }); expect(screen.getByText(/31\/12\/2026/)).toBeInTheDocument(); await userEvent.selectOptions(screen.getByLabelText('Filtrar por estado'), 'SUBMITTED'); await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.includes('status=SUBMITTED'))).toBe(true)); });
  it('edita con versión y conserva el borrador frente a 409', async () => { status = 409; view(); await screen.findByRole('button', { name: 'Editar descripción y organizaciones' }); await userEvent.click(screen.getByRole('button', { name: 'Editar descripción y organizaciones' })); await userEvent.clear(screen.getByLabelText('Nombre')); await userEvent.type(screen.getByLabelText('Nombre'), 'Borrador conservado'); await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' })); await screen.findByText(/La oportunidad cambió/); expect(screen.getByLabelText('Nombre')).toHaveValue('Borrador conservado'); const patch = fetchMock.mock.calls.find(([, options]) => options?.method === 'PATCH'); expect(JSON.parse(patch?.[1]?.body as string)).toMatchObject({ expectedVersion: 1, name: 'Borrador conservado', organizationIds: [orgId] }); });
  it('crea con organización real y clave idempotente, sin inventar origen', async () => { view('/opportunities/new'); await screen.findByLabelText('Nombre'); await userEvent.type(screen.getByLabelText('Nombre'), 'Nueva beca'); await userEvent.type(screen.getByLabelText('Buscar objetivo por nombre'), 'regional'); await userEvent.click(await screen.findByRole('button', { name: 'Seleccionar organización: Organización regional' })); await userEvent.click(screen.getByRole('button', { name: 'Crear oportunidad' })); await screen.findByRole('heading', { name: 'Nueva beca' }); const post = fetchMock.mock.calls.find(([, options]) => options?.method === 'POST'); expect(JSON.parse(post?.[1]?.body as string)).toMatchObject({ name: 'Nueva beca', organizationIds: [orgId], processId: null, communicationId: null }); expect(new Headers(post?.[1]?.headers).get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/); });
  it('edición exitosa actualiza la ficha', async () => { view(); await screen.findByRole('button', { name: 'Editar descripción y organizaciones' }); await userEvent.click(screen.getByRole('button', { name: 'Editar descripción y organizaciones' })); await userEvent.clear(screen.getByLabelText('Nombre')); await userEvent.type(screen.getByLabelText('Nombre'), 'Beca corregida'); await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' })); await screen.findByRole('heading', { name: 'Beca corregida' }); });
  it('motivo vacío no envía descarte; motivo significativo queda visible y bloquea carga', async () => { view(); await screen.findByLabelText('Nuevo estado'); await userEvent.selectOptions(screen.getByLabelText('Nuevo estado'), 'DISCARDED'); await userEvent.click(screen.getByRole('button', { name: 'Confirmar cambio de estado' })); await screen.findByText('Explica el motivo del descarte.'); expect(fetchMock.mock.calls.filter(([, o]) => o?.method === 'POST')).toHaveLength(0); await userEvent.type(screen.getByLabelText('Motivo del descarte'), 'No cumple requisitos'); await userEvent.click(screen.getByRole('button', { name: 'Confirmar cambio de estado' })); await screen.findByText('Motivo del descarte: No cumple requisitos'); expect(screen.queryByLabelText('Seleccionar archivos')).not.toBeInTheDocument(); expect(screen.getByText(/Esta oportunidad no admite/)).toBeInTheDocument(); });
  it('avanza por estados y permite resultado final sin reiniciar el formulario con versión vieja', async () => { view(); await screen.findByLabelText('Nuevo estado'); await userEvent.click(screen.getByRole('button', { name: 'Confirmar cambio de estado' })); await waitFor(() => expect(screen.getByLabelText('Nuevo estado')).toHaveValue('SUBMITTED')); await userEvent.click(screen.getByRole('button', { name: 'Confirmar cambio de estado' })); await screen.findByLabelText('Resultado final (opcional)'); await userEvent.type(screen.getByLabelText('Resultado final (opcional)'), 'Proyecto aprobado'); await userEvent.click(screen.getByRole('button', { name: 'Confirmar cambio de estado' })); await screen.findByText(/Esta oportunidad no admite/); const posts = fetchMock.mock.calls.filter(([, o]) => o?.method === 'POST').map(([, o]) => JSON.parse(o?.body as string) as {
    expectedVersion: number;
  }); expect(posts.map(body => body.expectedVersion)).toEqual([1, 2, 3]); });
  it('creación exige organización y muestra origen independiente sin inventar proceso', async () => { view('/opportunities/new'); await screen.findByRole('heading', { name: 'Crear oportunidad' }); await userEvent.type(screen.getByLabelText('Nombre'), 'Nueva beca'); await userEvent.click(screen.getByRole('button', { name: 'Crear oportunidad' })); await screen.findByText('Agrega al menos una organización.'); expect(screen.getByText('Investigación o referencia independiente.')).toBeInTheDocument(); expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/communications/'))).toBe(false); });
  it('origen inválido se detiene antes de consultar recursos', async () => { view('/opportunities/new?processId=invalid'); await screen.findByText('El enlace de origen no es válido.'); expect(fetchMock.mock.calls.some(([url]) => url.includes('/relationship-processes/'))).toBe(false); });
  it('sin permiso no consulta ni muestra detalles', async () => { client.setQueryData(AUTH_QUERY_KEY, { ...identity, permissions: [] }); fetchMock.mockImplementation(async () => Response.json({ ...identity, permissions: [] })); view(); await screen.findByText('No tienes permiso para consultar oportunidades.'); expect(fetchMock.mock.calls.some(([url]) => url.includes('/opportunities/'))).toBe(false); });
  it('cambio de identidad retira caché de ficha e historial', async () => { client.setQueryData(['opportunities', ...opportunityIdentityKey(identity), id], fixture); client.setQueryData(['opportunity-history', ...opportunityIdentityKey(identity), id], { pages: [] }); await act(() => clearForbiddenOpportunities(client, { ...identity, id: orgId })); expect(client.getQueriesData({ queryKey: ['opportunities'] })).toEqual([]); expect(client.getQueriesData({ queryKey: ['opportunity-history'] })).toEqual([]); });
  it('formularios rechazan enlaces activos, motivo vacío y fecha ambigua', () => { expect(descriptionFormSchema.safeParse({ name: 'Beca', description: '', requirements: '', url: 'javascript:alert(1)', deadline: '2026-02-30', organizationIds: [orgId] }).success).toBe(false); expect(stateFormSchema.safeParse({ status: 'DISCARDED', reason: '   ', finalResult: '' }).success).toBe(false); expect(deadlineLabel('2026-12-31')).toBe('31/12/2026'); });

  it('recargar y revisar un 409 permite aplicar el borrador con la versión actual', async () => {
    status=409;view();await screen.findByRole('button',{name:'Editar descripción y organizaciones'});await userEvent.click(screen.getByRole('button',{name:'Editar descripción y organizaciones'}));await userEvent.clear(screen.getByLabelText('Nombre'));await userEvent.type(screen.getByLabelText('Nombre'),'Borrador revisado');await userEvent.click(screen.getByRole('button',{name:'Guardar cambios'}));await screen.findByText(/La oportunidad cambió/);row={...row,version:2,name:'Edición de otra persona'};await userEvent.click(screen.getByRole('button',{name:'Recargar ficha conservando borrador'}));await screen.findByRole('heading',{name:'Edición de otra persona'});expect(screen.getByLabelText('Nombre')).toHaveValue('Borrador revisado');status=0;await userEvent.click(screen.getByRole('button',{name:'Revisé la versión actual; aplicar mi borrador'}));await userEvent.click(screen.getByRole('button',{name:'Guardar cambios'}));await screen.findByRole('heading',{name:'Borrador revisado'});const patches=fetchMock.mock.calls.filter(([,options])=>options?.method==='PATCH');expect(JSON.parse(patches[1]?.[1]?.body as string)).toMatchObject({expectedVersion:2,name:'Borrador revisado'});
  });
  it('editar antes de cambiar estado utiliza la nueva versión si aún no hay borrador de estado', async () => {
    view();await screen.findByRole('button',{name:'Editar descripción y organizaciones'});await userEvent.click(screen.getByRole('button',{name:'Editar descripción y organizaciones'}));await userEvent.type(screen.getByLabelText('Descripción'),' ampliada');await userEvent.click(screen.getByRole('button',{name:'Guardar cambios'}));await waitFor(()=>expect(screen.queryByRole('button',{name:'Guardar cambios'})).not.toBeInTheDocument());await userEvent.click(screen.getByRole('button',{name:'Confirmar cambio de estado'}));await waitFor(()=>expect(screen.getByLabelText('Nuevo estado')).toHaveValue('SUBMITTED'));const post=fetchMock.mock.calls.find(([,options])=>options?.method==='POST');expect(JSON.parse(post?.[1]?.body as string)).toMatchObject({expectedVersion:2,status:'PREPARING'});
  });
  it('precarga comunicación y proceso, conserva ambos y no ofrece editar el origen', async () => {
    const original=fetchMock.getMockImplementation()!, communicationId='44444444-4444-4444-8444-444444444444', timestamp='2000-01-01T00:00:00.000Z', user=fixture.createdBy;
    fetchMock.mockImplementation(async(url,options)=>{
      if(url.endsWith('/relationship-processes/'+id))return Response.json({id,purpose:'Cooperación original',state:'PREPARATION',version:1,createdBy:user,sourceIntentId:null,target:{kind:'ORGANIZATION',id:orgId,label:'Organización regional',isActive:true},createdAt:timestamp,updatedAt:timestamp,lastActivityAt:timestamp,currentResult:null,closureObservation:null,closedAt:null,closedBy:null,allowedStates:['IN_PROGRESS'],canClose:true,canReopen:false,exceptionalAdministration:false,participants:[],events:[],eventsTotal:0});
      if(url.endsWith('/communications/'+communicationId))return Response.json({id:communicationId,processId:id,direction:'RECEIVED',subject:'Convocatoria original',sentAt:null,receivedAt:timestamp,occurredAt:timestamp,createdAt:timestamp,validity:'VALID',version:1,emailAccount:null,sender:'partner@example.test',bodyOriginal:'Original',registeredBy:user,recipients:[]});
      return original(url,options);
    });view('/opportunities/new?processId='+id+'&communicationId='+communicationId);await screen.findByRole('button',{name:'Quitar Organización regional'});expect(screen.getByRole('link',{name:'Comunicación: Convocatoria original'})).toHaveAttribute('href','/communications/'+communicationId);await userEvent.type(screen.getByLabelText('Nombre'),'Derivada del origen');await userEvent.click(screen.getByRole('button',{name:'Crear oportunidad'}));await screen.findByRole('heading',{name:'Derivada del origen'});const post=fetchMock.mock.calls.find(([,options])=>options?.method==='POST');expect(JSON.parse(post?.[1]?.body as string)).toMatchObject({processId:id,communicationId,organizationIds:[orgId]});
  });
});
