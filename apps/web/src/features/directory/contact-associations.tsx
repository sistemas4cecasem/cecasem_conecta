import { ConsolidationProvenance } from './consolidation-provenance';
import { VerificationPanel } from './verification-panel';
import { useState } from 'react';
import { Link } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { AuthIdentity } from '../auth/session';
import { apiRequest } from '../../lib/api/client';
import { useDirectoryMutation } from './queries';
import { useContactAssociations } from './contacts.queries';
import { contactAssociationSchema,contactMethodSchema,contactReplacementSchema,contactAssociationResultSchema,conditionLabels,contactLabels,type ContactAssociation,type ContactMethod } from './contacts.contracts';
import { ContactContextFields,ContactContextForm } from './contact-context-form';
import { contextValues,associationPath } from './contact-context';
import { buttonClass,MutationError,Pagination,QueryState } from './directory-ui';
import { DirectoryHistory } from './directory-history';
export function ContactReplacementForm({identity,row,target,done,cancel}:{identity:AuthIdentity;row:ContactAssociation;target:ContactMethod;done:()=>void;cancel:()=>void}) {
  const form=useForm({resolver:zodResolver(contactReplacementSchema),defaultValues:{...contextValues(row),confirmed:false}});const mutation=useDirectoryMutation(identity);
  const [version,setVersion]=useState(row.version),[targetSnapshot,setTargetSnapshot]=useState(target),[reloadFailed,setReloadFailed]=useState(false);
  return <form className="space-y-3" onSubmit={form.handleSubmit(async values=>{try{contactAssociationResultSchema.parse(await mutation.mutateAsync({path:associationPath(row)+'/replace',method:'POST',body:{...values,contactMethodId:targetSnapshot.id,expectedMethodVersion:targetSnapshot.version,expectedVersion:version}}));done();}catch{/* Decisión explícita; conservar borrador. */}})}>
    <p>Usar {targetSnapshot.value} para esta persona u organización. La asociación con {row.contactMethod.value} quedará inactiva como antecedente. Las otras asociaciones se conservan.</p>
    <p>Revisa qué fuente y observaciones corresponden al nuevo canal. Si la asociación destino ya existe, se conserva su contexto.</p><ContactContextFields form={form}/>
    <label className="flex min-h-11 items-center gap-2"><input type="checkbox" {...form.register('confirmed')}/>Confirmo sustituir esta asociación conservando el antecedente</label>
    {form.formState.errors.confirmed&&<p role="alert">{form.formState.errors.confirmed.message}</p>}
    <MutationError error={mutation.error} reload={async()=>{try{const fresh=contactAssociationSchema.parse(await apiRequest(associationPath(row)));const freshTarget=contactMethodSchema.parse(await apiRequest('contact-methods/'+target.id));form.reset({...contextValues(fresh),confirmed:false});setVersion(fresh.version);setTargetSnapshot(freshTarget);mutation.reset();setReloadFailed(false);}catch{setReloadFailed(true);}}}/>
    {reloadFailed&&<p role="alert">No se pudo recargar. La sustitución no se ha confirmado.</p>}
    <div className="flex flex-wrap gap-3"><button className={buttonClass} disabled={mutation.isPending}>Confirmar sustitución</button><button type="button" className={buttonClass} onClick={cancel}>Cancelar sustitución</button></div></form>;
}
export function ContactAssociationCard({identity,row,readOnly=false,replacement,modern=false}:{identity:AuthIdentity;row:ContactAssociation;readOnly?:boolean;replacement?:ContactMethod;modern?:boolean}) {
  const [editing,setEditing]=useState<ContactAssociation|null>(null),[ending,setEnding]=useState<ContactAssociation|null>(null),[confirmed,setConfirmed]=useState(false),[history,setHistory]=useState(false),[replacing,setReplacing]=useState(false),[reloadFailed,setReloadFailed]=useState(false);
  const mutation=useDirectoryMutation(identity);readOnly=readOnly||!!('person' in row?row.person.duplicateOfId:row.organization.duplicateOfId);const actorName='person' in row?row.person.displayName:row.organization.name;
  return <li className={modern?'ui-data-list-item':'min-w-0 space-y-3 rounded border p-3 break-words'}><div className={modern?'directory-contact-context space-y-3':'space-y-3'}><Link className="inline-flex min-h-11 underline" to={'personId' in row?'/people/'+row.personId:'/organizations/'+row.organizationId}>{actorName}</Link>
    <p>{contactLabels[row.contactMethod.type]}: <Link className="underline" to={'/contact-methods/'+row.contactMethodId}>{row.contactMethod.value}</Link></p>
    <p>Asociación {row.isActive?'activa':'inactiva / antecedente'} · Medio: {conditionLabels[row.contactMethod.condition]}</p>
    <p>{row.contactMethod.associationCount>1?'Medio compartido entre '+row.contactMethod.associationCount+' asociaciones.':'Medio con una asociación.'}</p>
    {!('person' in row?row.person.isActive:row.organization.isActive)&&<p>Ficha del actor inactiva; asociación conservada.</p>}
    {row.sourceDescription&&<p>Fuente: {row.sourceDescription}</p>}{row.sourceUrl&&<p>URL de fuente: {row.sourceUrl}</p>}{row.notes&&<p>Observaciones: {row.notes}</p>}
    {editing?<ContactContextForm identity={identity} initial={editing} saved={()=>setEditing(null)} cancel={()=>setEditing(null)}/>:!readOnly&&<div className="flex flex-wrap gap-3">
      {identity.permissions.includes('directory.write')&&<><button className={buttonClass} onClick={()=>{setEditing(row);setEnding(null);}}>Editar contexto</button>
        {row.isActive&&!ending&&<button className={buttonClass} onClick={()=>{setEnding(row);setConfirmed(false);mutation.reset();}}>Finalizar asociación</button>}
        {replacement&&row.isActive&&<button className={buttonClass} onClick={()=>setReplacing(true)}>Usar el medio existente para {actorName}</button>}</>}
      {!row.isActive&&identity.permissions.includes('directory.write')&&<button className={buttonClass} disabled={mutation.isPending} onClick={()=>{void mutation.mutateAsync({path:associationPath(row)+'/status',method:'PATCH',body:{isActive:true,expectedVersion:row.version}}).catch(()=>undefined);}}>Reactivar asociación</button>}
      {identity.permissions.includes('directory.history.read')&&<button className={buttonClass} onClick={()=>setHistory(!history)}>{history?'Ocultar historial de asociación':'Ver historial de asociación'}</button>}</div>}
    {readOnly&&identity.permissions.includes('directory.history.read')&&<button className={buttonClass} onClick={()=>setHistory(!history)}>{history?'Ocultar historial de asociación':'Ver historial de asociación'}</button>}
    {ending&&<form className="space-y-3" onSubmit={event=>{event.preventDefault();if(!confirmed)return;void mutation.mutateAsync({path:associationPath(row)+'/end',method:'PATCH',body:{expectedVersion:ending.version}}).then(()=>setEnding(null)).catch(()=>undefined);}}>
      <p>Finalizar esta asociación conserva el medio y los antecedentes; no cambia las asociaciones de otros actores.</p>
      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/>Confirmo finalizar esta asociación</label>
      <div className="flex flex-wrap gap-3"><button className={buttonClass} disabled={!confirmed||mutation.isPending}>Confirmar finalización de asociación</button><button type="button" className={buttonClass} onClick={()=>setEnding(null)}>Cancelar finalización de asociación</button></div></form>}
    <MutationError error={mutation.error} reload={async()=>{try{const fresh=contactAssociationSchema.parse(await apiRequest(associationPath(row)));if(ending){setEnding(fresh);setConfirmed(false);}mutation.reset();setReloadFailed(false);}catch{setReloadFailed(true);}}}/>
    {reloadFailed&&<p role="alert">No se pudo recargar la asociación. Los datos se conservan.</p>}
    {replacing&&replacement&&<ContactReplacementForm identity={identity} row={row} target={replacement} done={()=>setReplacing(false)} cancel={()=>setReplacing(false)}/>}
    <ConsolidationProvenance origins={row.consolidationOrigins}/>
    </div>
    <VerificationPanel modern={modern} headingLevel={modern?3:2} identity={identity} path={associationPath(row)} label={'contacto de '+('person' in row?row.person.displayName:row.organization.name)+': '+row.contactMethod.value} contact readOnly={readOnly}/>
    {history&&<DirectoryHistory modern={modern} headingLevel={modern?3:2} identity={identity} path={associationPath(row)+'/history'}/>}</li>;
}
function MethodActorAssociations({identity,methodId,kind,readOnly,replacement}:{identity:AuthIdentity;methodId:string;kind:'people'|'organizations';readOnly:boolean;replacement?:ContactMethod}) {
  const [page,setPage]=useState(1);const query=useContactAssociations(identity,`contact-methods/${methodId}/${kind}?page=${page}`);
  return <section className="space-y-3"><h3 className="font-semibold">{kind==='people'?'Personas asociadas':'Organizaciones asociadas'}</h3><QueryState pending={query.isPending} error={query.isError} retry={query.refetch}/>
    {query.data?.total===0&&<p>No hay {kind==='people'?'personas':'organizaciones'} asociadas.</p>}
    <ul className="space-y-3">{query.data?.items.map(row=><ContactAssociationCard key={row.id} identity={identity} row={row} readOnly={readOnly} replacement={replacement}/>)}</ul>
    {query.data&&<Pagination page={page} total={query.data.total} onPage={setPage}/>}</section>;
}
export function ContactMethodAssociations({identity,methodId,readOnly=false,replacement}:{identity:AuthIdentity;methodId:string;readOnly?:boolean;replacement?:ContactMethod}) {
  return <div className="space-y-4"><MethodActorAssociations key={'people-'+methodId} identity={identity} methodId={methodId} kind="people" readOnly={readOnly} replacement={replacement}/>
    <MethodActorAssociations key={'organizations-'+methodId} identity={identity} methodId={methodId} kind="organizations" readOnly={readOnly} replacement={replacement}/></div>;
}
