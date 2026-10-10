import { ConsolidationProvenance } from './consolidation-provenance';
import { VerificationPanel } from './verification-panel';
import { useState } from 'react';
import { Link } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { AuthIdentity } from '../auth/session';
import { apiRequest } from '../../lib/api/client';
import { relationSchema,relationEndFormSchema,type Person,type PersonRelation } from './contracts';
import { useDirectoryMutation,usePersonRelations } from './queries';
import { Field,inputClass,buttonClass,MutationError,Pagination,QueryState } from './directory-ui';
import { RelationForm } from './relation-form';
import { DirectoryHistory } from './directory-history';
import { DataList, DataListItem } from '../../components/ui/lists';
import { Button } from '../../components/ui/actions';
import { FormField, Select } from '../../components/ui/forms';
import { OrganizationPersonForm } from './organization-person-form';

function RelationCard({identity,row,fromOrganization,readOnly=false,organizationPresentation=false,hideEmptyHistoryPagination=false}:{identity:AuthIdentity;row:PersonRelation;fromOrganization:boolean;readOnly?:boolean;organizationPresentation?:boolean;hideEmptyHistoryPagination?:boolean}) {
  const [editing,setEditing]=useState<PersonRelation|null>(null),[ending,setEnding]=useState<PersonRelation|null>(null),[history,setHistory]=useState(false);
  const mutation=useDirectoryMutation(identity);readOnly=readOnly||!!row.person.duplicateOfId||!!row.organization.duplicateOfId;
  const [reloadFailed,setReloadFailed]=useState(false);
  const endForm=useForm({resolver:zodResolver(relationEndFormSchema),defaultValues:{endDate:'',confirmed:false}});
  async function reload() {const result=relationSchema.parse(await apiRequest('person-organization-relations/'+row.id));setEditing(result);return result;}
  async function finish(input:{endDate:string;confirmed:boolean}) {
    if(!ending) return;
    try {await mutation.mutateAsync({path:'person-organization-relations/'+row.id+'/end',method:'PATCH',body:{expectedVersion:ending.version,endDate:input.endDate||null}});setEnding(null);} catch { /* Mostrar error y preservar borrador. */ }
  }
  return <DataListItem className={organizationPresentation?'organization-episode-row':''}><div className="directory-episode-context space-y-3">
    <Link className="inline-flex min-h-11 underline" to={fromOrganization?'/people/'+row.personId:'/organizations/'+row.organizationId}>{fromOrganization?row.person.displayName:row.organization.name}</Link>
    {organizationPresentation?<>
      <div className="organization-episode-primary">
        <p>{row.isCurrent?'Vigente':'Histórico / finalizado'} · Cargo: {row.positionTitle??'Desconocido'}</p>
        <p>Período: {row.startDate??'Inicio desconocido'} → {row.endDate??(row.isCurrent?'Actualidad':'Fin desconocido')}</p>
        {row.area&&<p>Área o función: {row.area}</p>}
      </div>
      <div className="organization-episode-details">
        {row.sourceDescription&&<p>Fuente: {row.sourceDescription}</p>}{row.sourceUrl&&<p>URL de fuente: {row.sourceUrl}</p>}{row.notes&&<p>Observaciones: {row.notes}</p>}
        {!row.person.isActive&&<p>Persona inactiva; vínculo conservado.</p>}{!row.organization.isActive&&<p>Organización inactiva; vínculo conservado.</p>}
      </div>
    </>:<>
      <p>{row.isCurrent?'Vigente':'Histórico / finalizado'} · Cargo: {row.positionTitle??'Desconocido'}</p>
      <p>Período: {row.startDate??'Inicio desconocido'} → {row.endDate??(row.isCurrent?'Actualidad':'Fin desconocido')}</p>
      {row.area&&<p>Área o función: {row.area}</p>}
      {row.sourceDescription&&<p>Fuente: {row.sourceDescription}</p>}{row.sourceUrl&&<p>URL de fuente: {row.sourceUrl}</p>}{row.notes&&<p>Observaciones: {row.notes}</p>}
      {!row.person.isActive&&<p>Persona inactiva; vínculo conservado.</p>}{!row.organization.isActive&&<p>Organización inactiva; vínculo conservado.</p>}
    </>}
    {editing?<RelationForm identity={identity} personId={row.personId} initial={editing} saved={()=>setEditing(null)} cancel={()=>setEditing(null)} reload={reload}/>:
      <div className={`flex flex-wrap gap-3 ${organizationPresentation?'organization-episode-actions':''}`}>{!readOnly&&identity.permissions.includes('directory.write')&&<><button className={buttonClass} onClick={()=>{setEditing(row);setEnding(null);}}>Corregir episodio</button>
        {row.isCurrent&&!ending&&<button className={buttonClass} onClick={()=>{setEnding(row);endForm.reset({endDate:'',confirmed:false});mutation.reset();}}>Finalizar vínculo</button>}</>}
      {identity.permissions.includes('directory.history.read')&&<button className={buttonClass} onClick={()=>setHistory(!history)}>{history?'Ocultar historial del episodio':'Ver historial del episodio'}</button>}</div>}
    {ending&&<form onSubmit={endForm.handleSubmit(finish)} className="space-y-3">
      <p>Finalizar conserva este episodio y su historial. Un cargo nuevo se registra como otro episodio.</p>
      <Field label="Fecha de finalización (opcional)" error={endForm.formState.errors.endDate?.message}><input type="date" className={inputClass} {...endForm.register('endDate')}/></Field>
      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" {...endForm.register('confirmed')}/>Confirmo la finalización de este vínculo</label>
      {endForm.formState.errors.confirmed&&<p role="alert">{endForm.formState.errors.confirmed.message}</p>}
      <MutationError error={mutation.error} reload={async()=>{try{const updated=relationSchema.parse(await apiRequest('person-organization-relations/'+row.id));setEnding(updated);endForm.reset({endDate:'',confirmed:false});mutation.reset();setReloadFailed(false);}catch{setReloadFailed(true);}}}/>
      {reloadFailed&&<p role="alert">No se pudo recargar el episodio. La finalización no se ha confirmado.</p>}
      <div className="flex flex-wrap gap-3"><button className={buttonClass} disabled={mutation.isPending}>Confirmar finalización</button><button type="button" className={buttonClass} disabled={mutation.isPending} onClick={()=>setEnding(null)}>Cancelar finalización</button></div>
    </form>}
    <ConsolidationProvenance origins={row.consolidationOrigins}/>
    </div>
    <VerificationPanel modern headingLevel={3} compactActionLabels={organizationPresentation} hideEmptyHistoryPagination={hideEmptyHistoryPagination} identity={identity} readOnly={readOnly} path={'person-organization-relations/'+row.id} label={'vínculo de '+row.person.displayName+' con '+row.organization.name}/>
    {history&&<DirectoryHistory modern headingLevel={3} hideEmptyPagination={hideEmptyHistoryPagination} identity={identity} path={'person-organization-relations/'+row.id+'/history'}/>}
  </DataListItem>;
}
export function PersonRelations({identity,personId,organizationId,readOnly=false,presentation='default'}:{identity:AuthIdentity;personId?:string;organizationId?:string;readOnly?:boolean;presentation?:'default'|'organization'}) {
  const [status,setStatus]=useState('all'),[page,setPage]=useState(1),[creating,setCreating]=useState(false);
  const [createdPerson,setCreatedPerson]=useState<Person|null>(null);
  const relations=usePersonRelations(identity,(personId?'people/'+personId+'/relations':'organizations/'+organizationId+'/people')+`?status=${status}&page=${page}`);
  const organizationPresentation=presentation==='organization';
  const canAddOrganizationPerson=!!organizationId&&organizationPresentation&&!readOnly&&identity.permissions.includes('directory.write');
  return <section className={`space-y-4 ${organizationPresentation?'organization-people-section':''}`}>
    <div className="organization-people-heading"><h2 className="text-xl font-semibold">{personId?'Vínculos institucionales':'Personas vinculadas'}</h2>
      {canAddOrganizationPerson&&!creating&&<Button onClick={()=>{setCreatedPerson(null);setCreating(true);}}>Añadir persona</Button>}
    </div>
    {createdPerson&&<p className="organization-person-success" role="status">Persona vinculada correctamente. <Link to={'/people/'+createdPerson.id}>Abrir ficha de {createdPerson.displayName}</Link></p>}
    {creating&&organizationId&&<OrganizationPersonForm identity={identity} organizationId={organizationId} cancel={()=>setCreating(false)} saved={person=>{setCreating(false);setCreatedPerson(person);}}/>}
    {!readOnly&&personId&&identity.permissions.includes('directory.write')&&<Button onClick={()=>setCreating(true)}>Registrar nuevo episodio</Button>}
    {creating&&personId&&<RelationForm identity={identity} personId={personId} saved={()=>setCreating(false)} cancel={()=>setCreating(false)}/>}
    <FormField label="Vigencia de vínculos">{control=><Select {...control} value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}}><option value="all">Vigentes e históricos</option><option value="current">Solo vigentes</option><option value="historical">Solo históricos / finalizados</option></Select>}</FormField>
    <QueryState pending={relations.isPending} error={relations.isError} retry={relations.refetch}/>
    {relations.data?.total===0&&<p>No hay vínculos en esta selección.</p>}
    <DataList className="directory-episode-list">{relations.data?.items.map(row=><RelationCard key={row.id} identity={identity} row={row} fromOrganization={!!organizationId} readOnly={readOnly} organizationPresentation={organizationPresentation} hideEmptyHistoryPagination={organizationPresentation}/>)}</DataList>
    {relations.data&&(!organizationPresentation||relations.data.total>0)&&<Pagination page={page} total={relations.data.total} onPage={setPage}/>}
  </section>;
}
