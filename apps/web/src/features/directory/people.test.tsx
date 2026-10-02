import { QueryClientProvider } from '@tanstack/react-query';
import { render,screen,waitFor,within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { AppRoutes } from '../../app/router/app-routes';
import { createQueryClient } from '../../lib/query/query-client';
import { type AuthIdentity } from '../auth/session';
import { personFormSchema,relationFormSchema,type Person,type PersonRelation } from './contracts';
const stamp='2026-10-02T00:00:00.000Z';
const identity:AuthIdentity={id:'qa',givenNames:'QA',familyNames:'Personas',username:'qa',email:'qa@example.test',role:'RESEARCH',permissions:['directory.read','directory.write','directory.history.read']};
const base:Person={id:'person',displayName:'Ana QA',givenNames:null,familyNames:null,isActive:true,version:1,createdAt:stamp,updatedAt:stamp,lastVerifiedAt:null,currentRelationsCount:0};
const org={id:'org-a',name:'Organización A',country:null,alias:null,description:null,officialWebsite:null,parentId:null,parent:null,categories:[],isActive:true,version:1,createdAt:stamp,updatedAt:stamp,lastVerifiedAt:null};
const episode:PersonRelation={id:'episode-a',personId:base.id,organizationId:org.id,positionTitle:'Coordinadora',area:null,isCurrent:true,startDate:null,endDate:null,sourceDescription:null,sourceUrl:null,notes:null,version:1,createdAt:stamp,updatedAt:stamp,person:{id:base.id,displayName:base.displayName,isActive:true},organization:{id:org.id,name:org.name,isActive:true}};
const page=(items:unknown[],total=items.length)=>({items,total,page:1,pageSize:25});
describe('Personas y episodios institucionales en UI',()=>{
  let client=createQueryClient(),actor=identity,row={...base},relations:PersonRelation[]=[],state='ok',total=1,conflicting=false,loggedOut=false;
  const fetchMock=vi.fn<(url:string,options?:RequestInit)=>Promise<Response>>();
  beforeEach(()=>{
    client=createQueryClient();actor={...identity};row={...base};relations=[];state='ok';total=1;conflicting=false;loggedOut=false;fetchMock.mockReset();
    fetchMock.mockImplementation((url,options)=>{
      const path=url.replace('/api/v1/',''),method=options?.method??'GET';
      if(path==='auth/me')return Promise.resolve(Response.json(loggedOut?{}:actor,{status:loggedOut?401:200}));
      if(path==='auth/logout'){loggedOut=true;return Promise.resolve(new Response(null,{status:204}));}
      if(path.includes('/history'))return Promise.resolve(Response.json({...page([{operationId:'operation-test',createdAt:stamp,objectType:'PERSON',actor:{id:actor.id,givenNames:actor.givenNames,familyNames:actor.familyNames,isActive:true},contextRecorded:true,relatedReferences:[],replacement:null,changes:[{field:path.startsWith('people')?'displayName':'positionTitle',label:'Dato de ficha',previousValue:'Anterior',newValue:'Corregido',previousReferences:[],newReferences:[],added:[],removed:[]}]}]),references:{}}));
      if(path.startsWith('people?')){
        if(state==='pending')return new Promise<Response>(()=>undefined);
        if(state==='error')return Promise.resolve(new Response(null,{status:500}));
        return Promise.resolve(Response.json(page(state==='empty'?[]:[row],state==='empty'?0:total)));
      }
      if(path.startsWith('organizations?'))return Promise.resolve(Response.json(page([org,{...org,id:'org-b',name:'Organización B'}])));
      if(path.includes('/children'))return Promise.resolve(Response.json(page([])));
      if(path.includes('/contacts?'))return Promise.resolve(Response.json(page([])));
      if(path.includes('/people?')||path.includes('/relations?'))return Promise.resolve(Response.json(page(relations)));
      if(path==='organizations/org-a')return Promise.resolve(Response.json(org));
      if(path==='people'&&method==='POST'){row={...base,...JSON.parse(String(options?.body)) as object};return Promise.resolve(Response.json(row,{status:201}));}
      if(path==='people/person'&&method==='PUT'){
        if(conflicting)return Promise.resolve(Response.json({code:'VERSION_CONFLICT'},{status:409}));
        row={...row,...JSON.parse(String(options?.body)) as object,version:row.version+1};return Promise.resolve(Response.json(row));
      }
      if(path==='people/person')return Promise.resolve(Response.json({...row,currentRelationsCount:relations.filter(r=>r.isCurrent).length}));
      if(path==='people/person/relations'&&method==='POST'){
        const input=JSON.parse(String(options?.body)) as {organizationId:string;positionTitle:string};const created={...episode,...input,id:'episode-'+relations.length,organization:{id:input.organizationId,name:input.organizationId==='org-b'?'Organización B':org.name,isActive:true}};
        relations=[...relations,created];return Promise.resolve(Response.json(created,{status:201}));
      }
      if(path.startsWith('person-organization-relations/')){
        if(method==='GET'&&state==='reload-error')return Promise.resolve(new Response(null,{status:500}));
        const id=path.split('/')[1],found=relations.find(r=>r.id===id)??episode;
        if(method==='PUT'){
          if(conflicting)return Promise.resolve(Response.json({code:'VERSION_CONFLICT'},{status:409}));
          const updated={...found,...JSON.parse(String(options?.body)) as object,version:found.version+1};relations=relations.map(r=>r.id===id?updated:r);return Promise.resolve(Response.json(updated));
        }
        if(method==='PATCH'){
          const input=JSON.parse(String(options?.body)) as {endDate:string|null};const updated={...found,isCurrent:false,endDate:input.endDate,version:found.version+1};relations=relations.map(r=>r.id===id?updated:r);return Promise.resolve(Response.json(updated));
        }
        return Promise.resolve(Response.json(found));
      }
      return Promise.reject(new Error('Ruta inesperada: '+path));
    });vi.stubGlobal('fetch',fetchMock);
  });
  afterEach(()=>{client.clear();vi.unstubAllGlobals();});
  function app(path='/people'){return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><AppRoutes/></MemoryRouter></QueryClientProvider>);}
  it('lista personas y solicita paginación backend, sin descargar todo',async()=>{
    total=26;const user=userEvent.setup();app();await screen.findByRole('link',{name:'Ana QA'});await user.click(screen.getByRole('button',{name:'Siguiente'}));
    await waitFor(()=>expect(fetchMock.mock.calls.some(([url])=>url.includes('page=2'))).toBe(true));
  });
  it.each(['pending','empty','error'])('listado representa %s',async mode=>{
    state=mode;app();if(mode==='pending')expect(await screen.findByText('Cargando…')).toBeVisible();
    if(mode==='empty')expect(await screen.findByText('No hay personas que coincidan.')).toBeVisible();
    if(mode==='error'){expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar');state='ok';await userEvent.setup().click(screen.getByRole('button',{name:'Reintentar'}));expect(await screen.findByRole('link',{name:'Ana QA'})).toBeVisible();}
  });
  it('crea independiente con solo presentación e invalida directorio',async()=>{
    const user=userEvent.setup(),invalidate=vi.spyOn(client,'invalidateQueries');app('/people/new');await user.type(await screen.findByLabelText('Nombre de presentación'),'Profesional independiente');await user.click(screen.getByRole('button',{name:'Guardar persona'}));
    await screen.findByRole('heading',{name:'Profesional independiente'});expect(screen.getByText(/Sin vínculos vigentes: persona independiente/)).toBeVisible();expect(screen.getByText('Sin verificar')).toBeVisible();
    const created=fetchMock.mock.calls.find(([url,options])=>url.endsWith('/people')&&options?.method==='POST');expect(JSON.parse(String(created?.[1]?.body))).toEqual({displayName:'Profesional independiente',givenNames:'',familyNames:''});expect(invalidate).toHaveBeenCalledWith({queryKey:['directory','qa']});
  });
  it('muestra dos organizaciones simultáneas y períodos desconocidos',async()=>{
    relations=[episode,{...episode,id:'episode-b',organizationId:'org-b',positionTitle:'Consultora',organization:{id:'org-b',name:'Organización B',isActive:true}}];app('/people/person');
    expect(await screen.findByRole('link',{name:'Organización A'})).toBeVisible();expect(screen.getByRole('link',{name:'Organización B'})).toBeVisible();expect(screen.getAllByText('Período: Inicio desconocido → Actualidad')).toHaveLength(2);
  });
  it('registra un episodio nuevo y mantiene el histórico',async()=>{
    relations=[{...episode,isCurrent:false}];const user=userEvent.setup();app('/people/person');await user.click(await screen.findByRole('button',{name:'Registrar nuevo episodio'}));
    await user.click(await screen.findByRole('radio',{name:'Organización A'}));await user.type(screen.getByLabelText('Cargo (opcional)'),'Directora');await user.click(screen.getByRole('button',{name:'Registrar episodio'}));
    expect(await screen.findByText('Vigente · Cargo: Directora')).toBeVisible();expect(screen.getByText('Histórico / finalizado · Cargo: Coordinadora')).toBeVisible();
    const call=fetchMock.mock.calls.find(([url,options])=>url.endsWith('/relations')&&options?.method==='POST');expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({organizationId:'org-a',startDate:null,endDate:null,isCurrent:true});
  });
  it('corregir es distinto de nuevo episodio y conserva su identidad',async()=>{
    relations=[episode];const user=userEvent.setup();app('/people/person');await user.click(await screen.findByRole('button',{name:'Corregir episodio'}));expect(screen.getByText(/Si hubo un cambio real de cargo/)).toBeVisible();
    await user.clear(screen.getByLabelText('Cargo (opcional)'));await user.type(screen.getByLabelText('Cargo (opcional)'),'Coordinadora de proyectos');await user.click(screen.getByRole('button',{name:'Guardar corrección'}));
    expect(await screen.findByText('Vigente · Cargo: Coordinadora de proyectos')).toBeVisible();expect(relations).toHaveLength(1);
    const call=fetchMock.mock.calls.find(([,options])=>options?.method==='PUT');expect(call?.[0]).toContain('person-organization-relations/episode-a');expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({expectedVersion:1});
  });
  it('finaliza con confirmación, sin eliminar ni inventar fecha',async()=>{
    relations=[episode];const user=userEvent.setup();app('/people/person');await user.click(await screen.findByRole('button',{name:'Finalizar vínculo'}));await user.click(screen.getByRole('button',{name:'Confirmar finalización'}));
    expect(await screen.findByText('Confirma la finalización para continuar.')).toBeVisible();expect(fetchMock.mock.calls.some(([,options])=>options?.method==='PATCH')).toBe(false);
    await user.click(screen.getByRole('checkbox',{name:'Confirmo la finalización de este vínculo'}));await user.click(screen.getByRole('button',{name:'Confirmar finalización'}));
    expect(await screen.findByText('Histórico / finalizado · Cargo: Coordinadora')).toBeVisible();expect(screen.getByText('Período: Inicio desconocido → Fin desconocido')).toBeVisible();
    const call=fetchMock.mock.calls.find(([,options])=>options?.method==='PATCH');expect(JSON.parse(String(call?.[1]?.body))).toEqual({expectedVersion:1,endDate:null});expect(relations).toHaveLength(1);
  });
  it('historial del episodio presenta valores y autor',async()=>{
    relations=[episode];const user=userEvent.setup();app('/people/person');await user.click(await screen.findByRole('button',{name:'Ver historial del episodio'}));
    expect(await screen.findAllByText('Antes: Anterior')).toHaveLength(2);expect(screen.getAllByText('Después: Corregido')).toHaveLength(2);expect(screen.queryByText('operation-test')).not.toBeInTheDocument();
  });
  it.each(['person','relation'])('conflicto %s conserva borrador y versión hasta recarga explícita',async kind=>{
    relations=[episode];conflicting=true;const user=userEvent.setup();app('/people/person');
    await user.click(await screen.findByRole('button',{name:kind==='person'?'Editar persona':'Corregir episodio'}));
    const label=kind==='person'?'Nombre de presentación':'Cargo (opcional)',save=kind==='person'?'Guardar persona':'Guardar corrección';
    await user.clear(screen.getByLabelText(label));await user.type(screen.getByLabelText(label),'Mi borrador');
    if(kind==='person')row={...row,version:2,displayName:'Cambio ajeno'};else relations=[{...episode,version:2,positionTitle:'Cambio ajeno'}];
    await user.click(screen.getByRole('button',{name:save}));expect(await screen.findByRole('alert')).toHaveTextContent('Recargar descartará');expect(screen.getByLabelText(label)).toHaveValue('Mi borrador');
    expect(fetchMock.mock.calls.filter(([,options])=>options?.method==='PUT')).toHaveLength(1);await user.click(screen.getByRole('button',{name:'Recargar ficha y descartar cambios'}));
    await waitFor(()=>expect(screen.getByLabelText(label)).toHaveValue('Cambio ajeno'));conflicting=false;await user.click(screen.getByRole('button',{name:save}));
    await waitFor(()=>expect(fetchMock.mock.calls.filter(([,options])=>options?.method==='PUT')).toHaveLength(2));
    const calls=fetchMock.mock.calls.filter(([,options])=>options?.method==='PUT');expect(JSON.parse(String(calls[1]?.[1]?.body))).toMatchObject({expectedVersion:2});
  });
  it('organización muestra personas y distingue episodios actuales/históricos',async()=>{
    relations=[episode,{...episode,id:'old',isCurrent:false,positionTitle:'Consultora'}];app('/organizations/org-a');
    await screen.findByRole('heading',{name:'Personas vinculadas'});expect(await screen.findAllByRole('link',{name:'Ana QA'})).toHaveLength(2);expect(screen.getByText('Histórico / finalizado · Cargo: Consultora')).toBeVisible();
    expect(screen.getByText('Vigente · Cargo: Coordinadora')).toBeVisible();
  });
  it('sin permisos no consulta ni crea; status solo con capability',async()=>{
    actor={...actor,permissions:[]};app('/people');expect(await screen.findByRole('alert')).toHaveTextContent('No tienes permiso');expect(fetchMock.mock.calls.some(([url])=>url.includes('/people'))).toBe(false);
  });
  it('operador edita pero no desactiva persona',async()=>{app('/people/person');expect(await screen.findByRole('button',{name:'Editar persona'})).toBeVisible();expect(screen.queryByRole('button',{name:'Desactivar persona'})).not.toBeInTheDocument();});
  it('Admin ve control de estado; vínculos conservados en persona inactiva',async()=>{
    actor={...actor,role:'ADMINISTRATOR',permissions:[...actor.permissions,'directory.status.update']};row={...row,isActive:false};relations=[{...episode,person:{...episode.person,isActive:false}}];app('/people/person');
    expect(await screen.findByRole('button',{name:'Reactivar persona'})).toBeVisible();expect(await screen.findByText('Persona inactiva; vínculo conservado.')).toBeVisible();
  });
  it('logout limpia personas y episodios de caché',async()=>{
    relations=[episode];app('/people/person');await screen.findByRole('link',{name:'Organización A'});expect(client.getQueriesData({queryKey:['directory','qa']}).length).toBeGreaterThan(1);
    await userEvent.setup().click(screen.getByRole('button',{name:'Cerrar sesión'}));await screen.findByRole('heading',{name:'Iniciar sesión'});expect(client.getQueriesData({queryKey:['directory']})).toHaveLength(0);
  });
  it('Zod valida persona parcial, fechas completas y coherencia temporal',()=>{
    expect(personFormSchema.safeParse({displayName:'Ana',givenNames:'',familyNames:''}).success).toBe(true);
    const blank={organizationId:'a',positionTitle:'',area:'',isCurrent:false,startDate:'',endDate:'',sourceDescription:'',sourceUrl:'',notes:''};
    expect(relationFormSchema.safeParse(blank).success).toBe(true);expect(relationFormSchema.safeParse({...blank,startDate:'2024'}).success).toBe(false);
    expect(relationFormSchema.safeParse({...blank,startDate:'2025-01-01',endDate:'2024-01-01'}).success).toBe(false);
  });
  it('corrección mantiene entidad y organización; no ofrece reemplazarlas',async()=>{
    relations=[episode];app('/people/person');await userEvent.setup().click(await screen.findByRole('button',{name:'Corregir episodio'}));
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();expect(screen.getByText('Organización: Organización A')).toBeVisible();
    const form=screen.getByRole('button',{name:'Guardar corrección'}).closest('form')!;expect(within(form).getByRole('checkbox',{name:'Vínculo vigente'})).toBeChecked();
  });
  it('recarga fallida después de conflicto conserva el borrador del episodio',async()=>{
    relations=[episode];conflicting=true;const user=userEvent.setup();app('/people/person');await user.click(await screen.findByRole('button',{name:'Corregir episodio'}));
    await user.clear(screen.getByLabelText('Cargo (opcional)'));await user.type(screen.getByLabelText('Cargo (opcional)'),'Mi dato conservado');
    await user.click(screen.getByRole('button',{name:'Guardar corrección'}));await screen.findByRole('alert');state='reload-error';
    await user.click(screen.getByRole('button',{name:'Recargar ficha y descartar cambios'}));expect(await screen.findByText(/No se pudo recargar el episodio/)).toBeVisible();
    expect(screen.getByLabelText('Cargo (opcional)')).toHaveValue('Mi dato conservado');
  });
});
