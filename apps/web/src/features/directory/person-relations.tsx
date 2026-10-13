import { ConsolidationProvenance } from './consolidation-provenance';
import { useState } from 'react';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { AuthIdentity } from '../auth/session';
import { apiRequest } from '../../lib/api/client';
import { relationSchema,relationEndFormSchema,type Person,type PersonRelation } from './contracts';
import { useDirectoryMutation,usePerson,usePersonRelations } from './queries';
import { Field,inputClass,buttonClass,MutationError,Pagination,QueryState } from './directory-ui';
import { RelationForm } from './relation-form';
import { DirectoryHistory } from './directory-history';
import { DataList, DataListItem } from '../../components/ui/lists';
import { ActionLink, Button } from '../../components/ui/actions';
import { FormField, Select } from '../../components/ui/forms';
import { OrganizationPersonForm } from './organization-person-form';
import { PersonForm } from './person-form';

function RelationCard({identity,row,fromOrganization,readOnly=false,organizationPresentation=false}:{identity:AuthIdentity;row:PersonRelation;fromOrganization:boolean;readOnly?:boolean;organizationPresentation?:boolean}) {
  const [editing,setEditing]=useState<PersonRelation|null>(null),[ending,setEnding]=useState<PersonRelation|null>(null),[history,setHistory]=useState(false),[detailsOpen,setDetailsOpen]=useState(false),[detailsVisited,setDetailsVisited]=useState(false);
  const [editingPersonId,setEditingPersonId]=useState<string>();
  const personForEdit=usePerson(identity,organizationPresentation?editingPersonId:undefined);
  const mutation=useDirectoryMutation(identity);readOnly=readOnly||!!row.person.duplicateOfId||!!row.organization.duplicateOfId;
  const [reloadFailed,setReloadFailed]=useState(false);
  const endForm=useForm({resolver:zodResolver(relationEndFormSchema),defaultValues:{endDate:'',confirmed:false}});
  async function reload() {const result=relationSchema.parse(await apiRequest('person-organization-relations/'+row.id));setEditing(result);return result;}
  async function finish(input:{endDate:string;confirmed:boolean}) {
    if(!ending) return;
    try {await mutation.mutateAsync({path:'person-organization-relations/'+row.id+'/end',method:'PATCH',body:{expectedVersion:ending.version,endDate:input.endDate||null}});setEnding(null);} catch { /* Mostrar error y preservar borrador. */ }
  }
  const relationActions=<div className={`flex flex-wrap gap-3 ${organizationPresentation?'organization-episode-actions':''}`}>
    {!readOnly&&identity.permissions.includes('directory.write')&&identity.permissions.includes('directory.read')&&<>
      {organizationPresentation&&<button className={buttonClass} onClick={()=>setEditingPersonId(row.personId)}>Editar persona</button>}
      <button className={buttonClass} onClick={()=>{setEditing(row);setEnding(null);}}>{organizationPresentation?'Corregir vínculo':'Corregir episodio'}</button>
      {row.isCurrent&&!ending&&<button className={buttonClass} onClick={()=>{setEnding(row);endForm.reset({endDate:'',confirmed:false});mutation.reset();}}>Finalizar vínculo</button>}
    </>}
    {identity.permissions.includes('directory.history.read')&&<button className={buttonClass} onClick={()=>setHistory(!history)}>{history?'Ocultar historial del vínculo':organizationPresentation?'Ver historial del vínculo':'Ver historial del episodio'}</button>}
  </div>;
  const relationDetails=<>
    {editing&&<RelationForm identity={identity} personId={row.personId} initial={editing} saved={()=>setEditing(null)} cancel={()=>setEditing(null)} reload={reload}/>}
    {organizationPresentation&&editingPersonId&&<div className="organization-person-edit"><QueryState pending={personForEdit.isPending} error={personForEdit.isError} failure={personForEdit.error} retry={personForEdit.refetch}/>
      {personForEdit.data&&<PersonForm identity={identity} initial={personForEdit.data} saved={()=>setEditingPersonId(undefined)} cancel={()=>setEditingPersonId(undefined)}
        reload={async()=>{const result=await personForEdit.refetch();if(!result.isSuccess)return undefined;return result.data;}}/>}
    </div>}
    {ending&&<form onSubmit={endForm.handleSubmit(finish)} className="space-y-3">
      <p>Finalizar conserva este vínculo y su historial. Un cambio real de cargo se registra en otro vínculo.</p>
      <Field label="Fecha de finalización (opcional)" error={endForm.formState.errors.endDate?.message}><input type="date" className={inputClass} {...endForm.register('endDate')}/></Field>
      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" {...endForm.register('confirmed')}/>Confirmo la finalización de este vínculo</label>
      {endForm.formState.errors.confirmed&&<p role="alert">{endForm.formState.errors.confirmed.message}</p>}
      <MutationError error={mutation.error} reload={async()=>{try{const updated=relationSchema.parse(await apiRequest('person-organization-relations/'+row.id));setEnding(updated);endForm.reset({endDate:'',confirmed:false});mutation.reset();setReloadFailed(false);}catch{setReloadFailed(true);}}}/>
      {reloadFailed&&<p role="alert">No se pudo recargar el vínculo. La finalización no se ha confirmado.</p>}
      <div className="flex flex-wrap gap-3"><button className={buttonClass} disabled={mutation.isPending}>Confirmar finalización</button><button type="button" className={buttonClass} disabled={mutation.isPending} onClick={()=>setEnding(null)}>Cancelar finalización</button></div>
    </form>}
    {organizationPresentation&&<div className="organization-episode-details">{row.sourceDescription&&<p>Fuente: {row.sourceDescription}</p>}{row.sourceUrl&&<p>URL de fuente: {row.sourceUrl}</p>}{row.notes&&<p>Observaciones: {row.notes}</p>}
      {!row.sourceDescription&&!row.sourceUrl&&!row.notes&&<p>No hay fuente ni observaciones adicionales.</p>}
      {!row.person.isActive&&<p>Persona inactiva; vínculo conservado.</p>}{!row.organization.isActive&&<p>Organización inactiva; vínculo conservado.</p>}
    </div>}
    <ConsolidationProvenance origins={row.consolidationOrigins}/>
    {history&&<DirectoryHistory modern headingLevel={3} hideEmptyPagination={organizationPresentation} identity={identity} path={'person-organization-relations/'+row.id+'/history'}/>}
  </>;
  const personLinkTo=fromOrganization
    ? organizationPresentation?`/organizations/${row.organizationId}/people/${row.personId}`:`/people/${row.personId}`
    : `/organizations/${row.organizationId}`;
  return <DataListItem className={organizationPresentation?'organization-episode-row':''}><div className="directory-episode-context space-y-3">
    <ActionLink className="inline-flex min-h-11" to={personLinkTo}>{fromOrganization?row.person.displayName:row.organization.name}</ActionLink>
    <div className="organization-episode-primary">
      <p>{organizationPresentation?(row.isCurrent?'Vínculo vigente':'Vínculo histórico / finalizado'):(row.isCurrent?'Vigente':'Histórico / finalizado')} · Cargo: {row.positionTitle??'Desconocido'}</p>
      <p>Período: {row.startDate??'Inicio desconocido'} → {row.endDate??(row.isCurrent?'Actualidad':'Fin desconocido')}</p>
      {row.area&&<p>Área o función: {row.area}</p>}
    </div>
    {organizationPresentation?<details className="organization-record-details" open={detailsOpen} onToggle={event=>{setDetailsOpen(event.currentTarget.open);if(event.currentTarget.open)setDetailsVisited(true);}}>
      <summary>Ver detalles del vínculo</summary>{detailsVisited&&<div className="organization-record-detail-content space-y-3">{relationActions}{relationDetails}</div>}
    </details>:<>
      {row.sourceDescription&&<p>Fuente: {row.sourceDescription}</p>}{row.sourceUrl&&<p>URL de fuente: {row.sourceUrl}</p>}{row.notes&&<p>Observaciones: {row.notes}</p>}
      {!row.person.isActive&&<p>Persona inactiva; vínculo conservado.</p>}{!row.organization.isActive&&<p>Organización inactiva; vínculo conservado.</p>}
      {relationActions}{relationDetails}
    </>}
  </div></DataListItem>;
}

export function PersonRelations({identity,personId,organizationId,readOnly=false,presentation='default'}:{identity:AuthIdentity;personId?:string;organizationId?:string;readOnly?:boolean;presentation?:'default'|'organization'}) {
  const [status,setStatus]=useState('all'),[page,setPage]=useState(1),[creating,setCreating]=useState(false),[name,setName]=useState('');
  const [createdPerson,setCreatedPerson]=useState<Person|null>(null);
  const organizationPresentation=presentation==='organization';
  const pageSize=organizationPresentation?10:25;
  const queryName=organizationPresentation&&name.trim()?`&name=${encodeURIComponent(name.trim())}`:'';
  const relationPath=(personId?'people/'+personId+'/relations':'organizations/'+organizationId+'/people')+`?status=${status}&page=${page}&pageSize=${pageSize}${queryName}`;
  const relations=usePersonRelations(identity,relationPath);
  const canAddOrganizationPerson=!!organizationId&&organizationPresentation&&!readOnly&&identity.permissions.includes('directory.write');
  return <section className={`space-y-4 ${organizationPresentation?'organization-people-section':''}`} aria-label={organizationPresentation?'Personas vinculadas':'Vínculos institucionales'}>
    <div className="organization-people-heading"><div><h2 className="text-xl font-semibold">{personId?'Vínculos institucionales':'Personas vinculadas'}</h2>
      {relations.data&&<p>{relations.data.total.toLocaleString('es-BO')} {relations.data.total===1?'vínculo registrado':'vínculos registrados'}</p>}</div>
      {canAddOrganizationPerson&&!creating&&<Button onClick={()=>{setCreatedPerson(null);setCreating(true);}}>Añadir persona</Button>}
    </div>
    {createdPerson&&organizationId&&<p className="organization-person-success" role="status">Persona vinculada correctamente. <ActionLink to={`/organizations/${organizationId}/people/${createdPerson.id}`}>Abrir ficha de {createdPerson.displayName}</ActionLink></p>}
    {creating&&organizationId&&<OrganizationPersonForm identity={identity} organizationId={organizationId} cancel={()=>setCreating(false)} saved={person=>{setCreating(false);setCreatedPerson(person);}}/>}
    {!readOnly&&personId&&identity.permissions.includes('directory.write')&&<Button onClick={()=>setCreating(true)}>Registrar nuevo episodio</Button>}
    {creating&&personId&&<RelationForm identity={identity} personId={personId} saved={()=>setCreating(false)} cancel={()=>setCreating(false)}/>}
    {organizationPresentation?<div className="organization-people-filters"><Field label="Buscar por nombre"><input className={inputClass} value={name} onChange={event=>{setName(event.target.value);setPage(1);}} /></Field>
      <Field label="Vigencia del vínculo"><select className={inputClass} value={status} onChange={event=>{setStatus(event.target.value);setPage(1);}}><option value="all">Todos</option><option value="current">Vigentes</option><option value="historical">Históricos</option></select></Field></div>
      :<FormField label="Vigencia de vínculos">{control=><Select {...control} value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}}><option value="all">Vigentes e históricos</option><option value="current">Solo vigentes</option><option value="historical">Solo históricos / finalizados</option></Select>}</FormField>}
    <QueryState pending={relations.isPending} error={relations.isError} retry={relations.refetch}/>
    {relations.data?.total===0&&<p>No hay vínculos en esta selección.</p>}
    <DataList className="directory-episode-list">{relations.data?.items.map(row=><RelationCard key={row.id} identity={identity} row={row} fromOrganization={!!organizationId} readOnly={readOnly} organizationPresentation={organizationPresentation}/>)}</DataList>
    {relations.data&&(!organizationPresentation||relations.data.total>0)&&<Pagination page={page} total={relations.data.total} pageSize={pageSize} onPage={setPage}/>}</section>;
}
