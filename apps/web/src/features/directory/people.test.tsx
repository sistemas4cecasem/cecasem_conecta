import { QueryClientProvider } from '@tanstack/react-query';
import { render,screen,waitFor,within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter, MemoryRouter, useLocation } from 'react-router';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { AppRoutes } from '../../app/router/app-routes';
import { createQueryClient } from '../../lib/query/query-client';
import { type AuthIdentity } from '../auth/session';
import { personFormSchema,relationFormSchema,type Person,type PersonRelation } from './contracts';
const stamp='2026-10-02T00:00:00.000Z';
const identity:AuthIdentity={id:'qa',givenNames:'QA',familyNames:'Personas',username:'qa',email:'qa@example.test',role:'RESEARCH',permissions:['directory.read','directory.write','directory.history.read']};
const base:Person={id:'person',displayName:'Ana QA',givenNames:null,familyNames:null,isActive:true,version:1,createdAt:stamp,updatedAt:stamp,currentRelationsCount:0,institutionalStatus:'NO_KNOWN_LINKS'};
const org={id:'org-a',name:'Organización A',country:null,alias:null,description:null,officialWebsite:null,branchOfId:null,branchOf:null,interestAreas:[],isActive:true,version:1,createdAt:stamp,updatedAt:stamp,};
const episode:PersonRelation={id:'episode-a',personId:base.id,organizationId:org.id,positionTitle:'Coordinadora',area:null,isCurrent:true,startDate:null,endDate:null,sourceDescription:null,sourceUrl:null,notes:null,version:1,createdAt:stamp,updatedAt:stamp,person:{id:base.id,displayName:base.displayName,isActive:true},organization:{id:org.id,name:org.name,isActive:true}};
const page=(items:unknown[],total=items.length)=>({items,total,page:1,pageSize:25});
describe('Personas y episodios institucionales en UI',()=>{
  let client=createQueryClient(),actor=identity,row={...base},peopleRows:Person[]|null=null,relations:PersonRelation[]=[],state='ok',detailStatus=200,total=1,conflicting=false,loggedOut=false,contextualFailure=false,contextualDeferred=false,contextualResolve:((response:Response)=>void)|null=null;
  const fetchMock=vi.fn<(url:string,options?:RequestInit)=>Promise<Response>>();
  beforeEach(()=>{
    client=createQueryClient();actor={...identity};row={...base};peopleRows=null;relations=[];state='ok';detailStatus=200;total=1;conflicting=false;loggedOut=false;contextualFailure=false;contextualDeferred=false;contextualResolve=null;fetchMock.mockReset();
    fetchMock.mockImplementation((url,options)=>{
      const path=url.replace('/api/v1/',''),method=options?.method??'GET';
      if (url.includes('/duplicate-candidates?')) return Promise.resolve(Response.json({items:[],total:0,page:1,pageSize:25}));
      if(path==='auth/me')return Promise.resolve(Response.json(loggedOut?{}:actor,{status:loggedOut?401:200}));
      if(path==='auth/logout'){loggedOut=true;return Promise.resolve(new Response(null,{status:204}));}
      if(path.includes('/history'))return Promise.resolve(Response.json({...page([{operationId:'operation-test',createdAt:stamp,objectType:'PERSON',actor:{id:actor.id,givenNames:actor.givenNames,familyNames:actor.familyNames,isActive:true},contextRecorded:true,relatedReferences:[],replacement:null,changes:[{field:path.startsWith('people')?'displayName':'positionTitle',label:'Dato de ficha',previousValue:'Anterior',newValue:'Corregido',previousReferences:[],newReferences:[],added:[],removed:[]}]}]),references:{}}));
      if(path.startsWith('people?')){
        if(state==='pending')return new Promise<Response>(()=>undefined);
        if(state==='error')return Promise.resolve(new Response(null,{status:500}));
        const query=new URLSearchParams(path.split('?')[1]??''),statusFilter=query.get('status')??'active',institutionalFilter=query.get('institutionalStatus')??'all';
        const allPeople=peopleRows??[row],matching=state==='empty'?[]:allPeople.filter(person=>{
          const personRelations=relations.filter(relation=>relation.personId===person.id),hasCurrent=person.currentRelationsCount>0||personRelations.some(relation=>relation.isCurrent);
          const hasHistory=personRelations.some(relation=>!relation.isCurrent)||person.institutionalStatus==='HISTORICAL_ONLY';
          const matchesStatus=statusFilter==='all'||(statusFilter==='active'?person.isActive:!person.isActive);
          const matchesInstitutionalStatus=institutionalFilter==='all'||(institutionalFilter==='without-current'&&!hasCurrent)||
            (institutionalFilter==='none'&&!hasCurrent&&!hasHistory)||(institutionalFilter==='historical-only'&&!hasCurrent&&hasHistory)||
            (institutionalFilter==='current'&&hasCurrent);
          const name=query.get('name')?.toLocaleLowerCase()??'';
          return matchesStatus&&matchesInstitutionalStatus&&person.displayName.toLocaleLowerCase().includes(name);
        });
        const requestedPage=Number(query.get('page')??1),pageSize=Number(query.get('pageSize')??25),responseTotal=peopleRows===null?(state==='empty'?0:total):matching.length;
        return Promise.resolve(Response.json({items:matching.slice((requestedPage-1)*pageSize,requestedPage*pageSize),total:responseTotal,page:requestedPage,pageSize}));
      }
      if(path.startsWith('organizations?'))return Promise.resolve(Response.json(page([org,{...org,id:'org-b',name:'Organización B'}])));
      if(path.includes('/branches'))return Promise.resolve(Response.json(page([])));
      if(path.includes('/contacts?'))return Promise.resolve(Response.json(page([])));
      if(path==='organizations/org-a/people'&&method==='POST'){
        if(contextualFailure)return Promise.resolve(Response.json({code:'PERSON_INACTIVE',message:'La persona está inactiva. Debe reactivarse antes de asociarla a una organización.'},{status:409}));
        const input=JSON.parse(String(options?.body)) as {personMode:'new'|'existing';person?:{displayName:string;givenNames:string;familyNames:string};personId?:string;positionTitle:string;area:string;isCurrent:boolean;startDate:string|null;endDate:string|null;sourceDescription:string;sourceUrl:string;notes:string};
        const person:Person=input.personMode==='new'?{...base,id:'context-person',...input.person,currentRelationsCount:0,institutionalStatus:'NO_KNOWN_LINKS'}:{...row};
        const created:PersonRelation={...episode,id:'context-episode-'+relations.length,personId:person.id,organizationId:org.id,positionTitle:input.positionTitle||null,area:input.area||null,isCurrent:input.isCurrent,startDate:input.startDate??null,endDate:input.endDate??null,sourceDescription:input.sourceDescription||null,sourceUrl:input.sourceUrl||null,notes:input.notes||null,person:{id:person.id,displayName:person.displayName,isActive:person.isActive},organization:{id:org.id,name:org.name,isActive:true}};
        relations=[...relations,created];const currentRelationsCount=relations.filter(relation=>relation.personId===person.id&&relation.isCurrent).length;
        const result={person:{...person,currentRelationsCount,institutionalStatus:currentRelationsCount?'CURRENT':relations.some(relation=>relation.personId===person.id)?'HISTORICAL_ONLY':'NO_KNOWN_LINKS'},relation:created};
        if(contextualDeferred)return new Promise<Response>(resolve=>{contextualResolve=resolve;});
        return Promise.resolve(Response.json(result,{status:201}));
      }
      if(path.startsWith('organizations/')&&path.includes('/people?')){const organizationId=path.split('/')[1];return Promise.resolve(Response.json(page(relations.filter(relation=>relation.organizationId===organizationId))));}
      if(path.includes('/relations?')){
        const personId=path.split('/')[1];return Promise.resolve(Response.json(page(relations.filter(relation=>relation.personId===personId&&(!path.includes('status=current')||relation.isCurrent)))));
      }
      if(path.includes('/people?'))return Promise.resolve(Response.json(page(relations)));
      if(path==='organizations/org-a')return Promise.resolve(Response.json(org));
      if(path==='organizations/org-b')return Promise.resolve(Response.json({...org,id:'org-b',name:'Organización B'}));
      if(path==='people'&&method==='POST'){row={...base,...JSON.parse(String(options?.body)) as object};return Promise.resolve(Response.json(row,{status:201}));}
      if(path.startsWith('people/person/profile')&&method==='GET'){
        if(detailStatus!==200||state==='reload-error')return Promise.resolve(Response.json({message:'internal detail'},{status:detailStatus!==200?detailStatus:500}));
        return Promise.resolve(Response.json({person:row,contacts:[],relations}));
      }
      if(path==='people/person/profile'&&method==='PUT'){
        if(conflicting)return Promise.resolve(Response.json({code:'VERSION_CONFLICT'},{status:409}));
        const input=JSON.parse(String(options?.body));row={...row,displayName:input.displayName,version:row.version+1};
        relations=relations.map(relation=>({...relation,...input.relations.find((update:{id:string})=>update.id===relation.id)}));
        return Promise.resolve(Response.json(row));
      }
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
  function app(path='/people'){
    const sectionPath=path==='/organizations/org-a'?`${path}/people`:path;
    return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[sectionPath]}><AppRoutes/></MemoryRouter></QueryClientProvider>);
  }
  function BrowserLocation(){const location=useLocation();return <output aria-label="URL actual">{location.pathname}</output>;}
  function appWithBrowserHistory(path:string){window.history.replaceState(null,'',path);return render(<QueryClientProvider client={client}><BrowserRouter><AppRoutes/><BrowserLocation/></BrowserRouter></QueryClientProvider>);}
  it('UI 2.4 conserva título y creación sin duplicar navegación',async()=>{
    const user=userEvent.setup();app();await screen.findByRole('link',{name:row.displayName});
    expect(screen.getByRole('heading',{level:1,name:'Personas externas'})).toBeVisible();
    expect(screen.getByText(/sin vínculos institucionales vigentes, con o sin episodios históricos/i)).toBeVisible();
    expect(screen.getByRole('link',{name:'Crear persona'})).toHaveAttribute('href','/people/new');
    expect(within(screen.getByRole('main')).queryByRole('link',{name:'Organizaciones del directorio'})).not.toBeInTheDocument();
    expect(screen.getAllByRole('link',{name:'Organizaciones'}).every(link=>link.getAttribute('href')==='/organizations')).toBe(true);
    await user.click(screen.getByRole('link',{name:row.displayName}));expect(await screen.findByRole('heading',{name:row.displayName})).toBeVisible();
    expect(screen.queryByText('Directorio / Personas externas')).not.toBeInTheDocument();
    await user.click(screen.getByRole('link',{name:'Volver a personas'}));
    expect(await screen.findByRole('heading',{name:'Personas externas'})).toBeVisible();
  });
  it('UI 2.4 lectura sin escritura no ofrece creación',async()=>{
    actor={...identity,permissions:['directory.read']};app();await screen.findByRole('link',{name:row.displayName});
    expect(screen.queryByRole('link',{name:'Crear persona'})).not.toBeInTheDocument();
  });
  it('incluye personas sin episodios y con historia, y excluye las que tienen cualquier vínculo vigente',async()=>{
    const withoutEpisodes={...base,id:'without-episodes',displayName:'Persona sin episodios',institutionalStatus:'NO_KNOWN_LINKS' as const};
    const historicalOnly={...base,id:'historical-only',displayName:'Persona con historia',institutionalStatus:'HISTORICAL_ONLY' as const};
    const currentOnly={...base,id:'current-only',displayName:'Persona con vínculo vigente',currentRelationsCount:1,institutionalStatus:'CURRENT' as const};
    const historicalAndCurrent={...base,id:'historical-and-current',displayName:'Persona con historia y vínculo vigente',currentRelationsCount:1,institutionalStatus:'CURRENT' as const};
    peopleRows=[withoutEpisodes,historicalOnly,currentOnly,historicalAndCurrent];
    relations=[
      {...episode,id:'historical-only-episode',personId:historicalOnly.id,isCurrent:false,organizationId:'org-b'},
      {...episode,id:'current-only-episode',personId:currentOnly.id},
      {...episode,id:'historical-episode',personId:historicalAndCurrent.id,isCurrent:false,organizationId:'org-b'},
      {...episode,id:'current-episode',personId:historicalAndCurrent.id},
    ];
    app();
    expect(await screen.findByRole('link',{name:withoutEpisodes.displayName})).toHaveAttribute('href','/people/without-episodes');
    expect(await screen.findByRole('link',{name:historicalOnly.displayName})).toHaveAttribute('href','/people/historical-only');
    expect(screen.getByText('Sin episodios institucionales registrados')).toBeVisible();
    expect(screen.getByText('Con antecedentes institucionales · sin vínculos vigentes')).toBeVisible();
    expect(screen.queryByRole('link',{name:currentOnly.displayName})).not.toBeInTheDocument();
    expect(screen.queryByRole('link',{name:historicalAndCurrent.displayName})).not.toBeInTheDocument();
    expect(screen.getByText('2 personas')).toBeVisible();
    expect(fetchMock.mock.calls.some(([url])=>url.includes('institutionalStatus=without-current'))).toBe(true);
  });
  it('muestra la situación histórica de una ficha inactiva sin confundirla con su estado institucional',async()=>{
    row={...base,id:'inactive-historical',displayName:'Persona inactiva con historia',isActive:false,institutionalStatus:'HISTORICAL_ONLY'};
    peopleRows=[row];relations=[{...episode,id:'inactive-history',personId:row.id,isCurrent:false,person:{...episode.person,id:row.id,displayName:row.displayName,isActive:false}}];
    const user=userEvent.setup();app();
    expect(await screen.findByText('No hay personas externas que coincidan.')).toBeVisible();
    await user.selectOptions(screen.getByLabelText('Estado'),'inactive');
    const result=within(screen.getByRole('region',{name:'Resultados de personas'}));
    expect(await result.findByRole('link',{name:row.displayName})).toBeVisible();
    expect(result.getByText('Ficha inactiva')).toBeVisible();
    expect(result.getByText('Con antecedentes institucionales · sin vínculos vigentes')).toBeVisible();
    expect(fetchMock.mock.calls.some(([url])=>url.includes('status=inactive&institutionalStatus=without-current'))).toBe(true);
  });
  it('UI 2.4 nombre y estado reinician página sin introducir parámetros URL',async()=>{
    total=26;const user=userEvent.setup();app();await screen.findByRole('link',{name:row.displayName});
    await user.click(screen.getByRole('button',{name:'Siguiente'}));
    await user.type(screen.getByLabelText('Filtrar personas por nombre'),'Ana');
    await waitFor(()=>expect(fetchMock.mock.calls.some(([url])=>url.includes('people?page=1&name=Ana&status=active&institutionalStatus=without-current'))).toBe(true));
    await user.selectOptions(screen.getByLabelText('Estado'),'all');
    await waitFor(()=>expect(fetchMock.mock.calls.some(([url])=>url.includes('people?page=1&name=Ana&status=all&institutionalStatus=without-current'))).toBe(true));
  });
  it('lista personas y solicita paginación backend, sin descargar todo',async()=>{
    total=26;const user=userEvent.setup();app();await screen.findByRole('link',{name:'Ana QA'});await user.click(screen.getByRole('button',{name:'Siguiente'}));
    await waitFor(()=>expect(fetchMock.mock.calls.some(([url])=>url.includes('page=2')&&url.includes('institutionalStatus=without-current'))).toBe(true));
  });
  it('mantiene Directorio activo al abrir una ficha de persona',async()=>{
    app('/people/person');await screen.findByRole('heading',{name:'Ana QA'});
    expect(screen.getAllByRole('link',{name:'Personas externas'}).every(link=>link.getAttribute('aria-current')==='page')).toBe(true);
    expect(screen.getByRole('link',{name:'Volver a personas'})).toHaveAttribute('href','/people');
    expect(screen.queryByText('Directorio / Personas externas')).not.toBeInTheDocument();
  });
  it('conserva el contexto de organización al abrir, recargar, volver y navegar con Atrás y Adelante',async()=>{
    relations=[episode];const user=userEvent.setup();appWithBrowserHistory('/organizations/org-a/people');
    const personLink=await screen.findByRole('link',{name:'Ana QA'});expect(personLink).toHaveAttribute('href','/organizations/org-a/people/person');
    await user.click(personLink);expect(await screen.findByRole('heading',{name:'Ana QA'})).toBeVisible();
    expect(screen.queryByText('Directorio / Organizaciones / Organización A / Personas')).not.toBeInTheDocument();
    expect(screen.getByRole('link',{name:'Volver a Organización A · Personas'})).toHaveAttribute('href','/organizations/org-a/people');
    expect(screen.getAllByRole('link',{name:/^Organizaciones$/}).every(link=>link.getAttribute('aria-current')==='page')).toBe(true);
    expect(screen.getAllByRole('link',{name:'Personas externas'}).every(link=>link.getAttribute('aria-current')!=='page')).toBe(true);
    expect(screen.getByLabelText('URL actual')).toHaveTextContent('/organizations/org-a/people/person');
    window.history.back();expect(await screen.findByRole('heading',{name:'Organización A'})).toBeVisible();
    expect(screen.getByLabelText('URL actual')).toHaveTextContent('/organizations/org-a/people');
    window.history.forward();expect(await screen.findByRole('heading',{name:'Ana QA'})).toBeVisible();
    expect(screen.queryByText('Directorio / Organizaciones / Organización A / Personas')).not.toBeInTheDocument();
    await user.click(screen.getByRole('link',{name:'Volver a Organización A · Personas'}));
    expect(await screen.findByRole('heading',{name:'Organización A'})).toBeVisible();
    expect(screen.getByLabelText('URL actual')).toHaveTextContent('/organizations/org-a/people');
  });
  it('restaura el contexto del enlace profundo tras recarga y usa la organización abierta como origen',async()=>{
    relations=[episode,{...episode,id:'episode-b',organizationId:'org-b',organization:{id:'org-b',name:'Organización B',isActive:true}}];
    app('/organizations/org-b/people/person');expect(await screen.findByRole('heading',{name:'Ana QA'})).toBeVisible();
    expect(screen.queryByText('Directorio / Organizaciones / Organización B / Personas')).not.toBeInTheDocument();
    expect(screen.getByRole('link',{name:'Volver a Organización B · Personas'})).toHaveAttribute('href','/organizations/org-b/people');
    expect(screen.getAllByRole('link',{name:/^Organizaciones$/}).every(link=>link.getAttribute('aria-current')==='page')).toBe(true);
  });
  it.each(['pending','empty','error'])('listado representa %s',async mode=>{
    state=mode;app();if(mode==='pending')expect(await screen.findByText('Cargando…')).toBeVisible();
    if(mode==='empty')expect(await screen.findByText('No hay personas externas que coincidan.')).toBeVisible();
    if(mode==='error'){expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar');state='ok';await userEvent.setup().click(screen.getByRole('button',{name:'Reintentar'}));expect(await screen.findByRole('link',{name:'Ana QA'})).toBeVisible();}
  });
  it('crea independiente con solo presentación e invalida directorio',async()=>{
    const user=userEvent.setup(),invalidate=vi.spyOn(client,'invalidateQueries');app('/people/new');await user.type(await screen.findByLabelText('Nombre de presentación'),'Profesional independiente');await user.click(screen.getByRole('button',{name:'Guardar persona'}));
    await screen.findByRole('heading',{name:'Profesional independiente'});expect(screen.getByText(/Sin vínculos vigentes: persona independiente/)).toBeVisible();
    const created=fetchMock.mock.calls.find(([url,options])=>url.endsWith('/people')&&options?.method==='POST');expect(JSON.parse(String(created?.[1]?.body))).toEqual({displayName:'Profesional independiente',givenNames:'',familyNames:''});expect(invalidate).toHaveBeenCalledWith({queryKey:['directory','qa']});
  });
  it('muestra dos organizaciones simultáneas y períodos desconocidos',async()=>{
    relations=[episode,{...episode,id:'episode-b',organizationId:'org-b',positionTitle:'Consultora',organization:{id:'org-b',name:'Organización B',isActive:true}}];app('/people/person');
    expect(await screen.findByText('Organización A')).toBeVisible();expect(screen.getByText('Organización B')).toBeVisible();expect(screen.getByText('Coordinadora')).toBeVisible();expect(screen.getByText('Consultora')).toBeVisible();
  });
  it('un solo editor corrige el cargo conservando su vínculo',async()=>{
    relations=[episode];const user=userEvent.setup();app('/people/person');await user.click(await screen.findByRole('button',{name:'Editar datos de la persona'}));
    await user.clear(screen.getByLabelText('Cargo institucional (opcional)'));await user.type(screen.getByLabelText('Cargo institucional (opcional)'),'Coordinadora de proyectos');
    expect(screen.queryByRole('checkbox',{name:'Vínculo vigente'})).not.toBeInTheDocument();
    await user.click(screen.getByRole('button',{name:'Guardar cambios'}));expect(await screen.findByText('Coordinadora de proyectos')).toBeVisible();
    expect(relations).toHaveLength(1);expect(relations[0]).toMatchObject({id:episode.id,isCurrent:true});
  });
  it('perfil no ofrece edición individual ni finalización del vínculo',async()=>{
    relations=[episode];app('/people/person');await screen.findByRole('heading',{name:base.displayName});
    expect(screen.queryByRole('button',{name:'Finalizar vínculo'})).not.toBeInTheDocument();
    expect(screen.queryByRole('button',{name:'Corregir episodio'})).not.toBeInTheDocument();
  });
  it.each(['person','relation'])('conflicto %s conserva borrador y versión hasta recarga explícita',async kind=>{
    relations=[episode];conflicting=true;const user=userEvent.setup();app('/people/person');
    await user.click(await screen.findByRole('button',{name:'Editar datos de la persona'}));
    const label=kind==='person'?'Nombre de presentación':'Cargo institucional (opcional)',save='Guardar cambios';
    await user.clear(screen.getByLabelText(label));await user.type(screen.getByLabelText(label),'Mi borrador');
    if(kind==='person')row={...row,version:2,displayName:'Cambio ajeno'};else relations=[{...episode,version:2,positionTitle:'Cambio ajeno'}];
    await user.click(screen.getByRole('button',{name:save}));expect(await screen.findByRole('alert')).toHaveTextContent('Recargar descartará');expect(screen.getByLabelText(label)).toHaveValue('Mi borrador');
    expect(fetchMock.mock.calls.filter(([,options])=>options?.method==='PUT')).toHaveLength(1);await user.click(screen.getByRole('button',{name:'Recargar ficha y descartar cambios'}));
    await waitFor(()=>expect(screen.getByLabelText(label)).toHaveValue('Cambio ajeno'));conflicting=false;await user.click(screen.getByRole('button',{name:save}));
    await waitFor(()=>expect(fetchMock.mock.calls.filter(([,options])=>options?.method==='PUT')).toHaveLength(2));
    const calls=fetchMock.mock.calls.filter(([,options])=>options?.method==='PUT');expect(JSON.parse(String(calls[1]?.[1]?.body))).toMatchObject(kind==='person'?{expectedVersion:2}:{relations:[expect.objectContaining({expectedVersion:2})]});
  });
  it('organización muestra personas y distingue episodios actuales/históricos',async()=>{
    relations=[episode,{...episode,id:'old',isCurrent:false,positionTitle:'Consultora'}];app('/organizations/org-a');
    await screen.findByRole('heading',{name:'Personas vinculadas'});expect(await screen.findAllByRole('link',{name:'Ana QA'})).toHaveLength(2);expect(screen.getByText('Consultora')).toBeVisible();
    expect(screen.getByText('Coordinadora')).toBeVisible();
  });
  it('desde la organización edita la ficha personal y conserva cargo y vigencia del vínculo',async()=>{
    relations=[episode];const user=userEvent.setup();app('/organizations/org-a');
    expect(screen.queryByText('Ver detalles del vínculo')).not.toBeInTheDocument();
    await user.click(await screen.findByRole('link',{name:'Ana QA'}));
    await user.click(await screen.findByRole('button',{name:'Editar datos de la persona'}));
    const name=await screen.findByLabelText('Nombre de presentación');await user.clear(name);await user.type(name,'Ana Actualizada');
    await user.click(screen.getByRole('button',{name:'Guardar cambios'}));
    await waitFor(()=>expect(fetchMock.mock.calls.map(([url,options])=>[url,options?.method])).toContainEqual(['/api/v1/people/person/profile','PUT']));
    const write=fetchMock.mock.calls.find(([url,options])=>url.endsWith('/people/person/profile')&&options?.method==='PUT');
    expect(JSON.parse(String(write?.[1]?.body))).toMatchObject({displayName:'Ana Actualizada',expectedVersion:1});
    expect(JSON.parse(String(write?.[1]?.body))).not.toHaveProperty('positionTitle');
    expect(relations).toMatchObject([{positionTitle:'Coordinadora',isCurrent:true,organizationId:'org-a'}]);
    expect(await screen.findByText('Coordinadora')).toBeVisible();
  });
  it('organización registra una persona con vínculo vigente sin filtros del listado en el formulario',async()=>{
    const user=userEvent.setup();app('/organizations/org-a');
    await user.click(await screen.findByRole('button',{name:'Añadir persona'}));
    expect(screen.queryByLabelText('El vínculo está vigente')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Buscar por nombre')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Vigencia del vínculo')).not.toBeInTheDocument();
    expect(screen.queryByText('No hay vínculos en esta selección.')).not.toBeInTheDocument();
    expect(screen.getByRole('group',{name:'Medio de contacto 1'})).toBeVisible();
    await user.click(screen.getByRole('button',{name:'Agregar otro medio'}));
    expect(screen.getByRole('group',{name:'Medio de contacto 2'})).toBeVisible();
    await user.type(screen.getByLabelText('Nombres (opcional)'),'Lucía');
    await user.type(screen.getByLabelText('Apellidos (opcional)'),'Paz');
    await user.type(screen.getByLabelText('Cargo institucional (opcional)'),'Directora');
    await user.click(screen.getByRole('button',{name:'Registrar persona y vincular'}));
    expect(await screen.findByText('Persona vinculada correctamente.')).toBeVisible();
    expect(screen.getByRole('link',{name:'Abrir ficha de Lucía Paz'})).toHaveAttribute('href','/organizations/org-a/people/context-person');
    expect(await screen.findByText('Directora')).toBeVisible();
    expect(screen.getByLabelText('Buscar por nombre')).toBeVisible();
    expect(screen.getByLabelText('Vigencia del vínculo')).toBeVisible();
    const calls=fetchMock.mock.calls.filter(([url,options])=>url.endsWith('/organizations/org-a/people')&&options?.method==='POST');
    expect(calls).toHaveLength(1);
    const body=JSON.parse(String(calls[0]?.[1]?.body));
    expect(body).toMatchObject({personMode:'new',person:{displayName:'Lucía Paz',givenNames:'Lucía',familyNames:'Paz'},positionTitle:'Directora',isCurrent:true});
    expect(body).not.toHaveProperty('organizationId');expect(body).not.toHaveProperty('personId');
  });
  it('el registro contextual pide nombres y contactos sin selector de episodios',async()=>{
    const user=userEvent.setup();app('/organizations/org-a');await user.click(await screen.findByRole('button',{name:'Añadir persona'}));
    expect(screen.queryByRole('radio',{name:'Seleccionar persona existente'})).not.toBeInTheDocument();
    expect(screen.getByLabelText('Nombres (opcional)')).toBeVisible();expect(screen.getByLabelText('Dato de contacto')).toBeVisible();
    expect(screen.queryByRole('checkbox',{name:/vigente/})).not.toBeInTheDocument();
  });
  it('el registro contextual exige al menos un nombre y no envía el formulario vacío',async()=>{
    const user=userEvent.setup();app('/organizations/org-a');await user.click(await screen.findByRole('button',{name:'Añadir persona'}));
    await user.click(screen.getByRole('button',{name:'Registrar persona y vincular'}));
    expect(fetchMock.mock.calls.some(([,options])=>options?.method==='POST')).toBe(false);
  });
  it('cancelar el registro contextual devuelve al listado sin escribir',async()=>{
    relations=[episode];const user=userEvent.setup();app('/organizations/org-a');await user.click(await screen.findByRole('button',{name:'Añadir persona'}));
    await user.type(screen.getByLabelText('Nombres (opcional)'),'Borrador');await user.click(screen.getByRole('button',{name:'Cancelar'}));
    expect(await screen.findByRole('link',{name:'Ana QA'})).toBeVisible();expect(fetchMock.mock.calls.some(([,options])=>options?.method==='POST')).toBe(false);
  });
  it('conserva el borrador al fallar el alta contextual',async()=>{
    row={...base};contextualFailure=true;const user=userEvent.setup();app('/organizations/org-a');await user.click(await screen.findByRole('button',{name:'Añadir persona'}));
    await user.type(screen.getByLabelText('Nombres (opcional)'),'Ana');
    await user.type(screen.getByLabelText('Cargo institucional (opcional)'),'Borrador conservado');await user.click(screen.getByRole('button',{name:'Registrar persona y vincular'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('La persona está inactiva. Debe reactivarse antes de asociarla a una organización.');
    expect(screen.getByLabelText('Cargo institucional (opcional)')).toHaveValue('Borrador conservado');
    expect(screen.queryByText('Persona vinculada correctamente.')).not.toBeInTheDocument();
  });
  it('impide duplicar el envío mientras el registro contextual está pendiente',async()=>{
    contextualDeferred=true;const user=userEvent.setup();app('/organizations/org-a');await user.click(await screen.findByRole('button',{name:'Añadir persona'}));
    await user.type(screen.getByLabelText('Nombres (opcional)'),'Lucía Pendiente');const submit=screen.getByRole('button',{name:'Registrar persona y vincular'});
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
  it('operador edita pero no desactiva persona',async()=>{app('/people/person');expect(await screen.findByRole('button',{name:'Editar datos de la persona'})).toBeVisible();expect(screen.queryByRole('button',{name:'Desactivar persona'})).not.toBeInTheDocument();});
  it('Admin ve control de estado; vínculos conservados en persona inactiva',async()=>{
    actor={...actor,role:'ADMINISTRATOR',permissions:[...actor.permissions,'directory.status.update']};row={...row,isActive:false};relations=[{...episode,person:{...episode.person,isActive:false}}];app('/people/person');
    expect(await screen.findByRole('button',{name:'Reactivar persona'})).toBeVisible();expect(await screen.findByText('Coordinadora')).toBeVisible();
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
    relations=[episode];app('/people/person');await screen.findByText('Organización A');expect(client.getQueriesData({queryKey:['directory','qa']}).length).toBeGreaterThan(0);
    await userEvent.setup().click(screen.getByRole('button',{name:'Cerrar sesión'}));await screen.findByRole('heading',{name:'Iniciar sesión'});expect(client.getQueriesData({queryKey:['directory']})).toHaveLength(0);
  });
  it('Zod valida persona parcial, fechas completas y coherencia temporal',()=>{
    expect(personFormSchema.safeParse({displayName:'Ana',givenNames:'',familyNames:''}).success).toBe(true);
    const blank={organizationId:'a',positionTitle:'',area:'',isCurrent:false,startDate:'',endDate:'',sourceDescription:'',sourceUrl:'',notes:''};
    expect(relationFormSchema.safeParse(blank).success).toBe(true);expect(relationFormSchema.safeParse({...blank,startDate:'2024'}).success).toBe(false);
    expect(relationFormSchema.safeParse({...blank,startDate:'2025-01-01',endDate:'2024-01-01'}).success).toBe(false);
  });
  it('corrección mantiene entidad y organización; no ofrece reemplazarlas',async()=>{
    relations=[episode];app('/people/person');await userEvent.setup().click(await screen.findByRole('button',{name:'Editar datos de la persona'}));
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();expect(screen.getByText('Organización A')).toBeVisible();
    const form=screen.getByRole('button',{name:'Guardar cambios'}).closest('form')!;expect(within(form).queryByRole('checkbox',{name:'Vínculo vigente'})).not.toBeInTheDocument();
  });
  it('recarga fallida después de conflicto conserva el borrador del episodio',async()=>{
    relations=[episode];conflicting=true;const user=userEvent.setup();app('/people/person');await user.click(await screen.findByRole('button',{name:'Editar datos de la persona'}));
    await user.clear(screen.getByLabelText('Cargo institucional (opcional)'));await user.type(screen.getByLabelText('Cargo institucional (opcional)'),'Mi dato conservado');
    await user.click(screen.getByRole('button',{name:'Guardar cambios'}));await screen.findByRole('alert');state='reload-error';
    await user.click(screen.getByRole('button',{name:'Recargar ficha y descartar cambios'}));expect(await screen.findByText('No se pudo recargar la ficha. Tus cambios se conservan.')).toBeVisible();
    expect(screen.getByLabelText('Cargo institucional (opcional)')).toHaveValue('Mi dato conservado');
  });
});
