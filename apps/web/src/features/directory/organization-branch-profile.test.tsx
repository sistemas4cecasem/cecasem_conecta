import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../../app/router/app-routes';
import { createQueryClient } from '../../lib/query/query-client';
import type { BranchProfileFormValues } from './organization-branch-profile.contracts';
const stamp='2026-10-15T10:00:00Z';
const owner={id:'org',name:'Fundación principal',country:'Países Bajos',alias:null,description:null,officialWebsite:null,isActive:true,version:1,branchOfId:null,branchOf:null,interestAreas:['Educación'],createdAt:stamp,updatedAt:stamp};
const branchBase={...owner,id:'branch',country:'Amsterdam',description:'Oficina regional',branchOfId:owner.id,branchOf:{id:owner.id,name:owner.name,isActive:true}};
const method={id:'method',type:'EMAIL' as const,value:'sede@example.test',label:null as string|null,condition:'USABLE' as const,version:1,associationCount:1,createdAt:stamp,updatedAt:stamp};
const contact={id:'association',organizationId:'branch',organization:{id:'branch',name:owner.name,isActive:true},contactMethodId:method.id,sourceDescription:'Fuente original' as string|null,sourceUrl:null as string|null,notes:null as string|null,isActive:true,version:1,createdAt:stamp,updatedAt:stamp,contactMethod:method};
type SaveBody=Omit<BranchProfileFormValues,'contacts'>&{expectedVersion:number;expectedContacts:Array<{id:string;version:number;methodVersion:number}>;contacts:Array<Omit<BranchProfileFormValues['contacts'][number],'associationId'>&{id?:string}>};
describe('Perfil y edición unificada de sede',()=>{
  let client=createQueryClient(),branch={...branchBase},contacts=[{...contact}],role='RESEARCH',writable=true,conflict=false;
  const fetchMock=vi.fn<(url:string,options?:RequestInit)=>Promise<Response>>();
  const page=(items:unknown[])=>({items,total:items.length,page:1,pageSize:10});
  beforeEach(()=>{
    client=createQueryClient();branch={...branchBase};contacts=[{...contact}];role='RESEARCH';writable=true;conflict=false;fetchMock.mockReset();
    fetchMock.mockImplementation(async(url,options)=>{
      const path=new URL(url,'http://localhost').pathname.replace('/api/v1/',''),verb=options?.method??'GET';
      if(path==='auth/me')return Response.json({id:'qa',givenNames:'QA',familyNames:'Sedes',username:'qa',email:'qa@example.test',role,permissions:['directory.read','directory.history.read',...(writable?['directory.write']:[])]});
      if(path==='organizations/org')return Response.json(owner);
      if(path==='organizations/org/branches')return Response.json(page([branch]));
      if(path==='organizations/org/branches/branch/profile') {
        if(verb==='GET')return Response.json({branch,contacts});
        if(conflict)return Response.json({code:'VERSION_CONFLICT'},{status:409});
        const body=JSON.parse(String(options?.body)) as SaveBody;
        branch={...branch,country:body.country,description:body.description,version:branch.version+1};
        contacts=body.contacts.map((row,index)=>({...contact,id:row.id??'new-'+index,sourceDescription:row.sourceDescription||null,sourceUrl:row.sourceUrl||null,notes:row.notes||null,
          contactMethod:{...method,value:row.value,label:row.label||null}}));
        return Response.json(branch);
      }
      if(path.endsWith('/history'))return Response.json({...page([]),references:{}});
      throw new Error('Ruta inesperada: '+verb+' '+path);
    });vi.stubGlobal('fetch',fetchMock);
  });
  afterEach(()=>{client.clear();vi.unstubAllGlobals();});
  function view(path='/organizations/org/locations'){render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><AppRoutes/></MemoryRouter></QueryClientProvider>);}
  it('el listado solo abre el perfil y el perfil muestra información sin acciones de contactos',async()=>{
    view();const user=userEvent.setup();await user.click(await screen.findByRole('link',{name:owner.name}));
    expect(await screen.findByRole('heading',{name:'Información de la sede'})).toBeVisible();expect(screen.getByText('Amsterdam')).toBeVisible();expect(screen.getByText(method.value)).toBeVisible();
    expect(screen.getAllByRole('button',{name:'Editar sede'})).toHaveLength(1);
    expect(screen.queryByRole('button',{name:/Añadir medio|Agregar medio|Editar contexto|Quitar medio/})).not.toBeInTheDocument();
    expect(screen.queryByText('Ver detalles y acciones')).not.toBeInTheDocument();
    expect(screen.getByRole('link',{name:'Volver a Fundación principal · Sedes'})).toHaveAttribute('href','/organizations/org/locations');
  });
  it('un único guardado edita los datos y contactos y conserva las versiones de la instantánea',async()=>{
    view('/organizations/org/locations/branch');const user=userEvent.setup();await user.click(await screen.findByRole('button',{name:'Editar sede'}));
    expect(screen.getByLabelText('Nombre')).toHaveAttribute('readonly');
    await user.clear(screen.getByLabelText('Lugar de la sede'));await user.type(screen.getByLabelText('Lugar de la sede'),'Rotterdam');
    await user.clear(screen.getByLabelText('Dato de contacto'));await user.type(screen.getByLabelText('Dato de contacto'),'corregido@example.test');
    await user.click(screen.getByText('Fuente y observaciones'));await user.type(screen.getByLabelText('Observaciones (opcional)'),'Nota actualizada');
    await user.click(screen.getByRole('button',{name:'Agregar medio de contacto'}));
    const second=within(screen.getByRole('group',{name:'Medio de contacto 2'}));await user.type(second.getByLabelText('Dato de contacto'),'nuevo@example.test');
    await user.click(screen.getByRole('button',{name:'Guardar sede'}));expect(await screen.findByText('Rotterdam')).toBeVisible();expect(screen.getByText('corregido@example.test')).toBeVisible();expect(screen.getByText('nuevo@example.test')).toBeVisible();
    const writes=fetchMock.mock.calls.filter(([,options])=>options?.method==='PUT');expect(writes).toHaveLength(1);
    expect(JSON.parse(String(writes[0]?.[1]?.body))).toMatchObject({country:'Rotterdam',expectedVersion:1,expectedContacts:[{id:'association',version:1,methodVersion:1}],contacts:[{id:'association',value:'corregido@example.test',notes:'Nota actualizada'},{value:'nuevo@example.test'}]});
  });
  it('cancelar una edición no guarda ni mantiene cambios locales en el perfil',async()=>{
    view('/organizations/org/locations/branch');const user=userEvent.setup();await user.click(await screen.findByRole('button',{name:'Editar sede'}));
    await user.type(screen.getByLabelText('Lugar de la sede'),'No guardar');await user.click(screen.getByRole('button',{name:'Quitar medio'}));await user.click(screen.getByRole('button',{name:'Cancelar'}));
    expect(await screen.findByText('Amsterdam')).toBeVisible();expect(screen.getByText(method.value)).toBeVisible();expect(fetchMock.mock.calls.some(([,options])=>options?.method==='PUT')).toBe(false);
  });
  it('un conflicto preserva todo el formulario y permite recargar por decisión explícita',async()=>{
    conflict=true;view('/organizations/org/locations/branch');const user=userEvent.setup();await user.click(await screen.findByRole('button',{name:'Editar sede'}));
    await user.clear(screen.getByLabelText('Lugar de la sede'));await user.type(screen.getByLabelText('Lugar de la sede'),'Borrador');
    await user.clear(screen.getByLabelText('Dato de contacto'));await user.type(screen.getByLabelText('Dato de contacto'),'borrador@example.test');
    await user.click(screen.getByRole('button',{name:'Guardar sede'}));expect(await screen.findByRole('alert')).toHaveTextContent('Recargar descartará');
    expect(screen.getByLabelText('Lugar de la sede')).toHaveValue('Borrador');expect(screen.getByLabelText('Dato de contacto')).toHaveValue('borrador@example.test');
    branch={...branch,country:'Cambio ajeno',version:2};await user.click(screen.getByRole('button',{name:'Recargar ficha y descartar cambios'}));
    await waitFor(()=>expect(screen.getByLabelText('Lugar de la sede')).toHaveValue('Cambio ajeno'));
  });
  it.each(['RESEARCH','ADMINISTRATOR'])('el historial respeta el rol %s y lectura sin escritura no ofrece edición',async currentRole=>{
    role=currentRole;writable=false;view('/organizations/org/locations/branch');await screen.findByRole('heading',{name:'Información de la sede'});
    expect(screen.queryByRole('button',{name:'Editar sede'})).not.toBeInTheDocument();
    if(role==='ADMINISTRATOR')expect(await screen.findByRole('region',{name:'Historial de modificaciones'})).toBeVisible();
    else expect(fetchMock.mock.calls.some(([url])=>url.includes('/history'))).toBe(false);
  });
  it('un enlace antiguo al contacto de la sede lleva a su perfil de consulta',async()=>{
    view('/organizations/org/locations/branch/contacts/method');expect(await screen.findByRole('heading',{name:'Información de la sede'})).toBeVisible();expect(screen.getByText(method.value)).toBeVisible();
    expect(screen.queryByRole('button',{name:'Corregir medio de contacto'})).not.toBeInTheDocument();
  });
});
