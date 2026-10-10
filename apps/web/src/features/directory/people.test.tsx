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
const base:Person={id:'person',displayName:'Ana QA',givenNames:null,familyNames:null,isActive:true,version:1,createdAt:stamp,updatedAt:stamp,lastVerifiedAt:null,currentRelationsCount:0,institutionalStatus:'NO_KNOWN_LINKS'};
const org={id:'org-a',name:'Organización A',country:null,alias:null,description:null,officialWebsite:null,parentId:null,parent:null,categories:[],isActive:true,version:1,createdAt:stamp,updatedAt:stamp,lastVerifiedAt:null};
const episode:PersonRelation={id:'episode-a',personId:base.id,organizationId:org.id,positionTitle:'Coordinadora',area:null,isCurrent:true,startDate:null,endDate:null,sourceDescription:null,sourceUrl:null,notes:null,version:1,createdAt:stamp,updatedAt:stamp,person:{id:base.id,displayName:base.displayName,isActive:true},organization:{id:org.id,name:org.name,isActive:true}};
const page=(items:unknown[],total=items.length)=>({items,total,page:1,pageSize:25});
describe('Personas y episodios institucionales en UI',()=>{
  let client=createQueryClient(),actor=identity,row={...base},relations:PersonRelation[]=[],state='ok',detailStatus=200,total=1,conflicting=false,loggedOut=false,contextualFailure=false,contextualDeferred=false,contextualResolve:((response:Response)=>void)|null=null;
  const fetchMock=vi.fn<(url:string,options?:RequestInit)=>Promise<Response>>();
  beforeEach(()=>{
    client=createQueryClient();actor={...identity};row={...base};relations=[];state='ok';detailStatus=200;total=1;conflicting=false;loggedOut=false;contextualFailure=false;contextualDeferred=false;contextualResolve=null;fetchMock.mockReset();
    fetchMock.mockImplementation((url,options)=>{
      const path=url.replace('/api/v1/',''),method=options?.method??'GET';
      if (url.includes('/duplicate-candidates?')) return Promise.resolve(Response.json({items:[],total:0,page:1,pageSize:25}));
      if (path.endsWith('/verification')) return Promise.resolve(Response.json({objectType:'person',classification:'personal',intervalMonths:6,verificationStatus:'NEVER_VERIFIED',lastVerifiedAt:null,lastVerifiedBy:null,nextReviewAt:null,changedSinceVerification:false,timeReviewDue:false,version:1,contactValueVersion:null}));
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
      if(path==='organizations/org-a/people'&&method==='POST'){
        if(contextualFailure)return Promise.resolve(Response.json({code:'PERSON_INACTIVE',message:'La persona está inactiva. Debe reactivarse antes de asociarla a una organización.'},{status:409}));
        const input=JSON.parse(String(options?.body)) as {personMode:'new'|'existing';person?:{displayName:string;givenNames:string;familyNames:string};personId?:string;positionTitle:string;area:string;isCurrent:boolean;startDate:string|null;endDate:string|null;sourceDescription:string;sourceUrl:string;notes:string};
        const person:Person=input.personMode==='new'?{...base,id:'context-person',...input.person,currentRelationsCount:0,institutionalStatus:'NO_KNOWN_LINKS'}:{...row};
        const created:PersonRelation={...episode,id:'context-episode-'+relations.length,personId:person.id,organizationId:org.id,positionTitle:input.positionTitle||null,area:input.area||null,isCurrent:input.isCurrent,startDate:input.startDate,endDate:input.endDate,sourceDescription:input.sourceDescription||null,sourceUrl:input.sourceUrl||null,notes:input.notes||null,person:{id:person.id,displayName:person.displayName,isActive:person.isActive},organization:{id:org.id,name:org.name,isActive:true}};
        relations=[...relations,created];const currentRelationsCount=relations.filter(relation=>relation.personId===person.id&&relation.isCurrent).length;
        const result={person:{...person,currentRelationsCount,institutionalStatus:currentRelationsCount?'CURRENT':relations.some(relation=>relation.personId===person.id)?'HISTORICAL_ONLY':'NO_KNOWN_LINKS'},relation:created};
        if(contextualDeferred)return new Promise<Response>(resolve=>{contextualResolve=resolve;});
        return Promise.resolve(Response.json(result,{status:201}));
      }
      if(path.startsWith('organizations/org-a/people?'))return Promise.resolve(Response.json(page(relations.filter(relation=>relation.organizationId===org.id))));
      if(path.includes('/relations?')){
        const personId=path.split('/')[1];return Promise.resolve(Response.json(page(relations.filter(relation=>relation.personId===personId&&(!path.includes('status=current')||relation.isCurrent)))));
      }
      if(path.includes('/people?'))return Promise.resolve(Response.json(page(relations)));
      if(path==='organizations/org-a')return Promise.resolve(Response.json(org));
      if(path==='people'&&method==='POST'){row={...base,...JSON.parse(String(options?.body)) as object};return Promise.resolve(Response.json(row,{status:201}));}
      if(path==='people/person'&&method==='PUT'){
        if(conflicting)return Promise.resolve(Response.json({code:'VERSION_CONFLICT'},{status:409}));
        row={...row,...JSON.parse(String(options?.body)) as object,version:row.version+1};return Promise.resolve(Response.json(row));
      }
      if(path==='people/person/status'&&method==='PATCH'){
        const input=JSON.parse(String(options?.body)) as {isActive:boolean;expectedVersion:number};row={...row,isActive:input.isActive,version:row.version+1};return Promise.resolve(Response.json(row));
      }
      if(path==='people/person')return Promise.resolve(detailStatus===404?Response.json({code:'NOT_FOUND',stack:'internal detail'},{status:404}):Response.json({...row,currentRelationsCount:relations.filter(r=>r.isCurrent).length}));
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
  it('UI 2.4 conserva título y creación sin duplicar navegación',async()=>{
    app();await screen.findByRole('link',{name:row.displayName});
    expect(screen.getByRole('heading',{level:1,name:'Personas externas'})).toBeVisible();
    expect(screen.getByRole('link',{name:'Crear persona'})).toHaveAttribute('href','/people/new');
    expect(within(screen.getByRole('main')).queryByRole('link',{name:'Organizaciones del directorio'})).not.toBeInTheDocument();
    expect(screen.getAllByRole('link',{name:'Organizaciones'}).every(link=>link.getAttribute('href')==='/organizations')).toBe(true);
  });
  it('UI 2.4 lectura sin escritura no ofrece creación',async()=>{
    actor={...identity,permissions:['directory.read']};app();await screen.findByRole('link',{name:row.displayName});
    expect(screen.queryByRole('link',{name:'Crear persona'})).not.toBeInTheDocument();
  });
  it('UI 2.4 preserva conteo de vínculos y estado sin inventar organización o cargo',async()=>{
    row={...base,currentRelationsCount:3,isActive:false};app();await screen.findByRole('link',{name:row.displayName});
    const result=within(screen.getByRole('region',{name:'Resultados de personas'}));
    expect(result.getByText('3 vínculos vigentes')).toBeVisible();expect(result.getByText('Inactiva')).toBeVisible();
    expect(result.getByRole('link',{name:row.displayName})).toHaveAttribute('href','/people/person');
    expect(result.queryByText(org.name)).not.toBeInTheDocument();
  });
  it('UI 2.4 nombre y estado reinician página sin introducir parámetros URL',async()=>{
    total=26;const user=userEvent.setup();app();await screen.findByRole('link',{name:row.displayName});
    await user.click(screen.getByRole('button',{name:'Siguiente'}));
    await user.type(screen.getByLabelText('Filtrar personas por nombre'),'Ana');
    await waitFor(()=>expect(fetchMock.mock.calls.some(([url])=>url.includes('people?page=1&name=Ana&status=active'))).toBe(true));
    await user.selectOptions(screen.getByLabelText('Estado'),'all');
    await waitFor(()=>expect(fetchMock.mock.calls.some(([url])=>url.includes('people?page=1&name=Ana&status=all'))).toBe(true));
  });
  it('lista personas y solicita paginación backend, sin descargar todo',async()=>{
    total=26;const user=userEvent.setup();app();await screen.findByRole('link',{name:'Ana QA'});await user.click(screen.getByRole('button',{name:'Siguiente'}));
    await waitFor(()=>expect(fetchMock.mock.calls.some(([url])=>url.includes('page=2'))).toBe(true));
  });
  it('mantiene Directorio activo al abrir una ficha de persona',async()=>{
    app('/people/person');await screen.findByRole('heading',{name:'Ana QA'});
    expect(screen.getAllByRole('link',{name:'Personas externas'}).every(link=>link.getAttribute('aria-current')==='page')).toBe(true);
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
  it('organización registra persona nueva y su episodio con una única solicitud contextual',async()=>{
    const user=userEvent.setup();app('/organizations/org-a');await user.click(await screen.findByRole('button',{name:'Añadir persona'}));
    await user.type(screen.getByLabelText('Nombre de presentación'),'Lucía Contextual');await user.type(screen.getByLabelText('Nombres (opcional)'),'Lucía');
    await user.type(screen.getByLabelText('Apellidos (opcional)'),'Paz');await user.type(screen.getByLabelText('Cargo institucional (opcional)'),'Directora');
    await user.click(screen.getByRole('button',{name:'Registrar persona y vincular'}));
    expect(await screen.findByText('Persona vinculada correctamente.')).toBeVisible();
    expect(screen.getByRole('link',{name:'Abrir ficha de Lucía Contextual'})).toHaveAttribute('href','/people/context-person');
    expect(await screen.findByText('Vigente · Cargo: Directora')).toBeVisible();
    const calls=fetchMock.mock.calls.filter(([url,options])=>url.endsWith('/organizations/org-a/people')&&options?.method==='POST');
    expect(calls).toHaveLength(1);const body=JSON.parse(String(calls[0]?.[1]?.body));
    expect(body).toMatchObject({personMode:'new',person:{displayName:'Lucía Contextual',givenNames:'Lucía',familyNames:'Paz'},positionTitle:'Directora',isCurrent:true,startDate:null,endDate:null});
    expect(body).not.toHaveProperty('organizationId');expect(body).not.toHaveProperty('personId');
  });
  it('busca personas con todos los estados y añade episodio sin sobrescribir datos ni borrar históricos',async()=>{
    row={...base,currentRelationsCount:1,institutionalStatus:'CURRENT'};relations=[episode,{...episode,id:'old-context',isCurrent:false,positionTitle:'Asesora'}];
    const user=userEvent.setup();app('/organizations/org-a');await user.click(await screen.findByRole('button',{name:'Añadir persona'}));
    await user.click(screen.getByRole('radio',{name:'Seleccionar persona existente'}));await user.click(await screen.findByRole('radio',{name:/Ana QA/}));
    expect(await screen.findByRole('status')).toHaveTextContent('Ya tiene un vínculo vigente con esta organización');
    await user.type(screen.getByLabelText('Cargo institucional (opcional)'),'Directora');await user.click(screen.getByRole('button',{name:'Vincular persona'}));
    await waitFor(()=>expect(fetchMock.mock.calls.filter(([url,options])=>url.endsWith('/organizations/org-a/people')&&options?.method==='POST')).toHaveLength(1));
    expect(await screen.findByText('Persona vinculada correctamente.')).toBeVisible();
    expect(await screen.findByText('Vigente · Cargo: Directora')).toBeVisible();expect(screen.getByText('Histórico / finalizado · Cargo: Asesora')).toBeVisible();
    const search=fetchMock.mock.calls.find(([url])=>url.includes('people?page=1&pageSize=10&status=all&institutionalStatus=all'));
    expect(search).toBeDefined();const calls=fetchMock.mock.calls.filter(([url,options])=>url.endsWith('/organizations/org-a/people')&&options?.method==='POST');
    expect(calls).toHaveLength(1);const body=JSON.parse(String(calls[0]?.[1]?.body));
    expect(body).toMatchObject({personMode:'existing',personId:'person',positionTitle:'Directora',isCurrent:true});
    expect(body).not.toHaveProperty('person');expect(body).not.toHaveProperty('organizationId');
  });
  it('muestra personas inactivas sin permitir seleccionarlas e incluye acceso seguro a su ficha',async()=>{
    row={...base,isActive:false};const user=userEvent.setup();app('/organizations/org-a');await user.click(await screen.findByRole('button',{name:'Añadir persona'}));
    await user.click(screen.getByRole('radio',{name:'Seleccionar persona existente'}));
    const candidate=await screen.findByRole('radio',{name:/Ana QA/});
    expect(candidate).toBeDisabled();expect(screen.getByText('La ficha está inactiva. Debe reactivarse antes de añadir un nuevo vínculo institucional.')).toBeVisible();
    expect(screen.getByRole('link',{name:'Consultar ficha personal'})).toHaveAttribute('href','/people/person');
    expect(screen.getByRole('link',{name:'Consultar ficha personal'})).toHaveAttribute('target','_blank');
    await user.click(candidate);
    expect(screen.getByRole('button',{name:'Vincular persona'})).toBeDisabled();
    expect(fetchMock.mock.calls.some(([url,options])=>url.endsWith('/organizations/org-a/people')&&options?.method==='POST')).toBe(false);
  });
  it.each([
    ['solo vínculos históricos',{...base,institutionalStatus:'HISTORICAL_ONLY' as const},[{...episode,isCurrent:false}]],
    ['sin vínculos institucionales',{...base,institutionalStatus:'NO_KNOWN_LINKS' as const},[]],
  ])('permite seleccionar una persona activa %s',async(_label,candidate,episodes)=>{
    row={...candidate};relations=episodes;
    const user=userEvent.setup();app('/organizations/org-a');await user.click(await screen.findByRole('button',{name:'Añadir persona'}));
    await user.click(screen.getByRole('radio',{name:'Seleccionar persona existente'}));
    const selection=await screen.findByRole('radio',{name:/Ana QA/});
    expect(selection).toBeEnabled();await user.click(selection);
    await user.type(screen.getByLabelText('Cargo institucional (opcional)'),'Directora');
    await user.click(screen.getByRole('button',{name:'Vincular persona'}));
    expect(await screen.findByText('Persona vinculada correctamente.')).toBeVisible();
    const call=fetchMock.mock.calls.find(([url,options])=>url.endsWith('/organizations/org-a/people')&&options?.method==='POST');
    expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({personMode:'existing',personId:'person',positionTitle:'Directora'});
  });
  it('conserva el borrador al fallar el alta contextual',async()=>{
    row={...base};contextualFailure=true;const user=userEvent.setup();app('/organizations/org-a');await user.click(await screen.findByRole('button',{name:'Añadir persona'}));
    await user.click(screen.getByRole('radio',{name:'Seleccionar persona existente'}));await user.click(await screen.findByRole('radio',{name:/Ana QA/}));
    await user.type(screen.getByLabelText('Cargo institucional (opcional)'),'Borrador conservado');await user.click(screen.getByRole('button',{name:'Vincular persona'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('La persona está inactiva. Debe reactivarse antes de asociarla a una organización.');
    expect(screen.getByLabelText('Cargo institucional (opcional)')).toHaveValue('Borrador conservado');
    expect(screen.getByRole('link',{name:'Consultar ficha personal para reactivarla explícitamente'})).toHaveAttribute('href','/people/person');
    expect(screen.queryByText('Persona vinculada correctamente.')).not.toBeInTheDocument();
  });
  it('impide duplicar el envío mientras el registro contextual está pendiente',async()=>{
    contextualDeferred=true;const user=userEvent.setup();app('/organizations/org-a');await user.click(await screen.findByRole('button',{name:'Añadir persona'}));
    await user.type(screen.getByLabelText('Nombre de presentación'),'Lucía Pendiente');const submit=screen.getByRole('button',{name:'Registrar persona y vincular'});
    await user.click(submit);await waitFor(()=>expect(contextualResolve).toBeTypeOf('function'));expect(submit).toBeDisabled();await user.click(submit);
    expect(fetchMock.mock.calls.filter(([url,options])=>url.endsWith('/organizations/org-a/people')&&options?.method==='POST')).toHaveLength(1);
    const body=JSON.parse(String(fetchMock.mock.calls.find(([url,options])=>url.endsWith('/organizations/org-a/people')&&options?.method==='POST')?.[1]?.body));
    const person={...base,id:'context-person',...body.person,currentRelationsCount:1,institutionalStatus:'CURRENT'};
    const relation:PersonRelation={...episode,id:'context-episode',personId:person.id,positionTitle:null,person:{id:person.id,displayName:person.displayName,isActive:true}};
    contextualResolve?.(Response.json({person,relation},{status:201}));
    expect(await screen.findByText('Persona vinculada correctamente.')).toBeVisible();
    expect(fetchMock.mock.calls.filter(([url,options])=>url.endsWith('/organizations/org-a/people')&&options?.method==='POST')).toHaveLength(1);
  });
  it('no ofrece añadir personas desde la organización sin permiso de escritura',async()=>{
    actor={...identity,permissions:['directory.read']};app('/organizations/org-a');await screen.findByRole('heading',{name:'Personas vinculadas'});
    expect(screen.queryByRole('button',{name:'Añadir persona'})).not.toBeInTheDocument();
  });
  it('sin permisos no consulta ni crea; status solo con capability',async()=>{
    actor={...actor,permissions:[]};app('/people');expect(await screen.findByRole('alert')).toHaveTextContent('No tienes permiso');expect(fetchMock.mock.calls.some(([url])=>url.includes('/people'))).toBe(false);
  });
  it('operador edita pero no desactiva persona',async()=>{app('/people/person');expect(await screen.findByRole('button',{name:'Editar persona'})).toBeVisible();expect(screen.queryByRole('button',{name:'Desactivar persona'})).not.toBeInTheDocument();});
  it('Admin ve control de estado; vínculos conservados en persona inactiva',async()=>{
    actor={...actor,role:'ADMINISTRATOR',permissions:[...actor.permissions,'directory.status.update']};row={...row,isActive:false};relations=[{...episode,person:{...episode.person,isActive:false}}];app('/people/person');
    expect(await screen.findByRole('button',{name:'Reactivar persona'})).toBeVisible();expect(await screen.findByText('Persona inactiva; vínculo conservado.')).toBeVisible();
  });
  it('desactivación de persona describe el efecto y espera confirmación explícita',async()=>{
    actor={...actor,role:'ADMINISTRATOR',permissions:[...actor.permissions,'directory.status.update']};const user=userEvent.setup();app('/people/person');
    await user.click(await screen.findByRole('button',{name:'Desactivar persona'}));
    expect(screen.getByText(/Sus datos, vínculos e historial institucional se conservarán/)).toBeVisible();
    expect(fetchMock.mock.calls.some(([url,options])=>url.endsWith('/status')&&options?.method==='PATCH')).toBe(false);
    await user.click(screen.getByRole('button',{name:'Confirmar desactivación'}));await screen.findByRole('button',{name:'Reactivar persona'});
    const call=fetchMock.mock.calls.find(([url,options])=>url.endsWith('/status')&&options?.method==='PATCH');
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({isActive:false,expectedVersion:1});
  });
  it('404 de persona muestra salida al listado y no expone respuesta técnica',async()=>{
    detailStatus=404;app('/people/person');
    expect(await screen.findByRole('alert')).toHaveTextContent('No se encontró la información solicitada.');
    expect(screen.getByRole('link',{name:'Volver a personas'})).toHaveAttribute('href','/people');
    expect(screen.queryByText(/internal detail/)).not.toBeInTheDocument();
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
