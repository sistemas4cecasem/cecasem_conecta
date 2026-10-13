import { QueryClientProvider } from '@tanstack/react-query';
import { render,screen,waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { AppRoutes } from '../../app/router/app-routes';
import { createQueryClient } from '../../lib/query/query-client';
const stamp='2026-10-13T00:00:00Z';
const organizationId='630c7a1d-c107-4b39-ad12-ab5ed139c8f4';
const personId='2a4482a7-e407-48ba-8923-b9cb8ae5070f';
const organization={id:organizationId,name:'Institución contextual',country:null,alias:null,description:null,officialWebsite:null,branchOfId:null,branchOf:null,categories:[],isActive:true,version:1,createdAt:stamp,updatedAt:stamp};
const base={id:personId,displayName:'Persona objetivo',givenNames:null,familyNames:null,isActive:true,version:1,createdAt:stamp,updatedAt:stamp,currentRelationsCount:0,institutionalStatus:'NO_KNOWN_LINKS'};
const page=(items:unknown[])=>({items,total:items.length,page:1,pageSize:25});
describe('Identidad de persona directa y contextual AF-01',()=>{
  let client=createQueryClient();let row={...base};let wrongPerson={...base,id:organizationId,displayName:'Otra persona existente'};
  const requests:Array<{path:string;method:string}>=[];const unexpected:string[]=[];
  beforeEach(()=>{client=createQueryClient();row={...base};wrongPerson={...base,id:organizationId,displayName:'Otra persona existente'};requests.length=0;unexpected.length=0;
    vi.stubGlobal('fetch',vi.fn(async(url:string,options?:RequestInit)=>{
      const parsed=new URL(url,'http://localhost');const path=parsed.pathname.replace('/api/v1/','');const method=options?.method??'GET';requests.push({path,method});
      if(path==='auth/me'&&method==='GET')return Response.json({id:'qa',givenNames:'QA',familyNames:'Contexto',username:'qa',email:'qa@example.test',role:'ADMINISTRATOR',permissions:['directory.read','directory.write','directory.history.read','directory.status.update']});
      if(path==='organizations/'+organizationId&&method==='GET')return Response.json(organization);
      if(path==='organizations'&&method==='GET')return Response.json(page([organization]));
      if(path==='people/'+organizationId){unexpected.push(path);if(method==='PATCH')wrongPerson={...wrongPerson,isActive:false};return Response.json(wrongPerson);}
      if(path.startsWith('people/'+organizationId+'/')){unexpected.push(path);if(method==='PATCH')wrongPerson={...wrongPerson,isActive:false};return Response.json(method==='PATCH'?wrongPerson:page([]));}
      if(path==='people/'+personId&&method==='PUT'){const body=JSON.parse(String(options?.body));expect(body.expectedVersion).toBe(row.version);row={...row,displayName:body.displayName,version:row.version+1};return Response.json(row);}
      if(path==='people/'+personId&&method==='GET')return Response.json(row);
      if(path==='people/'+personId+'/status'&&method==='PATCH'){const body=JSON.parse(String(options?.body));expect(body.expectedVersion).toBe(row.version);row={...row,isActive:body.isActive,version:row.version+1};return Response.json(row);}
      if(method==='GET'&&['contacts','relations','duplicate-candidates'].some(section=>path==='people/'+personId+'/'+section))return Response.json(page([]));
      if(path==='people/'+personId+'/history'&&method==='GET')return Response.json({...page([]),references:{}});
      if(path==='people/'+personId+'/contacts'&&method==='POST')return Response.json({outcome:'created',association:{id:'association',personId,person:{id:personId,displayName:row.displayName,isActive:true},contactMethodId:'method',sourceDescription:null,sourceUrl:null,notes:null,isActive:true,version:1,createdAt:stamp,updatedAt:stamp,contactMethod:{id:'method',type:'PHONE',value:'+591 76543210',label:null,condition:'USABLE',version:1,createdAt:stamp,updatedAt:stamp,associationCount:1}}},{status:201});
      if(path==='people/'+personId+'/relations'&&method==='POST')return Response.json({id:'episode',personId,organizationId,positionTitle:null,area:null,isCurrent:true,startDate:null,endDate:null,sourceDescription:null,sourceUrl:null,notes:null,version:1,createdAt:stamp,updatedAt:stamp,person:{id:personId,displayName:row.displayName,isActive:true},organization:{id:organizationId,name:organization.name,isActive:true}},{status:201});
      unexpected.push(method+' '+path);throw new Error('Solicitud inesperada: '+method+' '+path);
    }));
  });afterEach(()=>{client.clear();vi.unstubAllGlobals();});
  it.each(['/people/'+personId,'/organizations/'+organizationId+'/people/'+personId])('%s consulta y escribe únicamente en la persona objetivo',async path=>{
    const user=userEvent.setup();render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><AppRoutes/></MemoryRouter></QueryClientProvider>);
    await screen.findByRole('heading',{name:row.displayName});
    await waitFor(()=>{for(const section of ['contacts','relations','duplicate-candidates','history'])expect(requests).toContainEqual({path:'people/'+personId+'/'+section,method:'GET'});});
    expect(screen.getByRole('link',{name:path.startsWith('/organizations')?'Volver a Institución contextual · Personas':'Volver a personas'})).toHaveAttribute('href',path.startsWith('/organizations')?'/organizations/'+organizationId+'/people':'/people');
    await user.click(screen.getByRole('button',{name:'Registrar medio de contacto'}));await user.selectOptions(screen.getByLabelText('Tipo de medio'),'PHONE');await user.type(screen.getByLabelText('Valor del medio'),'+591 76543210');await user.click(screen.getByRole('button',{name:'Registrar medio y asociar'}));
    await waitFor(()=>expect(screen.queryByLabelText('Valor del medio')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button',{name:'Registrar nuevo episodio'}));await user.click(await screen.findByRole('radio',{name:organization.name}));await user.click(screen.getByRole('button',{name:'Registrar episodio'}));
    await waitFor(()=>expect(screen.queryByRole('button',{name:'Registrar episodio'})).not.toBeInTheDocument());
    await user.click(screen.getByRole('button',{name:'Editar persona'}));await user.clear(screen.getByLabelText('Nombre de presentación'));await user.type(screen.getByLabelText('Nombre de presentación'),'Persona objetivo corregida');await user.click(screen.getByRole('button',{name:'Guardar persona'}));await screen.findByRole('heading',{name:'Persona objetivo corregida'});
    expect(requests).toContainEqual({path:'people/'+personId,method:'PUT'});
    await user.click(screen.getByRole('button',{name:'Desactivar persona'}));await user.click(screen.getByRole('button',{name:'Confirmar desactivación'}));await screen.findByRole('button',{name:'Reactivar persona'});
    for(const section of ['contacts','relations'])expect(requests).toContainEqual({path:'people/'+personId+'/'+section,method:'POST'});
    expect(requests).toContainEqual({path:'people/'+personId+'/status',method:'PATCH'});expect(wrongPerson).toEqual({...base,id:organizationId,displayName:'Otra persona existente'});expect(unexpected).toEqual([]);
    const keys=client.getQueryCache().getAll().map(q=>JSON.stringify(q.queryKey));expect(keys.some(key=>key.includes('people/'+organizationId+'/'))).toBe(false);
  });
});
