import { useState } from 'react';
import { Link,useParams } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSession,type AuthIdentity } from '../auth/session';
import { ApiError,apiRequest } from '../../lib/api/client';
import { useDirectoryMutation } from './queries';
import { useContactMethod } from './contacts.queries';
import { contactCorrectionSchema,contactMethodSchema,contactLabels,conditionLabels,type ContactCorrectionValues,type ContactMethod } from './contacts.contracts';
import { ContactMethodAssociations } from './contact-associations';
import { DirectoryHistory } from './directory-history';
import { Field,inputClass,buttonClass,MutationError,QueryState } from './directory-ui';
function correctionValues(row:ContactMethod):ContactCorrectionValues {return {type:row.type,value:row.value,label:row.label??'',confirmShared:false};}
function ContactCorrectionForm({identity,initial,saved,cancel,onExisting}:{identity:AuthIdentity;initial:ContactMethod;saved:()=>void;cancel:()=>void;onExisting:(id:string)=>void}) {
  const form=useForm<ContactCorrectionValues>({resolver:zodResolver(contactCorrectionSchema),defaultValues:correctionValues(initial)});
  const [snapshot,setSnapshot]=useState(initial),[reloadFailed,setReloadFailed]=useState(false);const mutation=useDirectoryMutation(identity);
  return <form className="space-y-3" onSubmit={form.handleSubmit(async({value,label,confirmShared})=>{try{contactMethodSchema.parse(await mutation.mutateAsync({path:'contact-methods/'+initial.id,method:'PUT',body:{value,label,confirmShared,expectedVersion:snapshot.version}}));saved();}catch(error){if(error instanceof ApiError&&error.code==='CONTACT_VALUE_EXISTS'&&error.details?.contactMethodId)onExisting(error.details.contactMethodId);}})}>
    <p>Corrige un dato erróneo del mismo canal. Un canal distinto se registra por separado y se sustituye solo en la asociación elegida.</p>
    <Field label="Valor corregido del medio" error={form.formState.errors.value?.message}><input className={inputClass} {...form.register('value')}/></Field>
    <Field label="Etiqueta corregida del medio" error={form.formState.errors.label?.message}><input className={inputClass} {...form.register('label')}/></Field>
    {snapshot.associationCount>1&&<><p>Medio compartido: esta corrección afectará a las {snapshot.associationCount} asociaciones mostradas abajo, incluidas las inactivas.</p>
      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" {...form.register('confirmShared')}/>Confirmo la corrección global del medio compartido</label></>}
    <MutationError error={mutation.error} reload={async()=>{try{const fresh=contactMethodSchema.parse(await apiRequest('contact-methods/'+initial.id));setSnapshot(fresh);form.reset(correctionValues(fresh));mutation.reset();setReloadFailed(false);}catch{setReloadFailed(true);}}}/>
    {reloadFailed&&<p role="alert">No se pudo recargar el medio. El borrador se conserva.</p>}
    <div className="flex flex-wrap gap-3"><button className={buttonClass} disabled={mutation.isPending}>Guardar corrección del medio</button><button type="button" className={buttonClass} onClick={cancel}>Cancelar corrección del medio</button></div></form>;
}
export function ContactDetailPage() {
  const {id=''}=useParams();const identity=useSession().data;const query=useContactMethod(identity,id);const mutation=useDirectoryMutation(identity);
  const [editing,setEditing]=useState<ContactMethod|null>(null),[replacementId,setReplacementId]=useState<string>();const replacement=useContactMethod(identity,replacementId);
  if(!identity?.permissions.includes('directory.read'))return <p role="alert">No tienes permiso para consultar medios de contacto.</p>;
  if(!query.data)return <QueryState pending={query.isPending} error={query.isError} retry={query.refetch}/>;
  const row=query.data;
  return <section className="min-w-0 space-y-5 break-words"><Link className="inline-flex min-h-11 underline" to="/organizations">Volver al directorio</Link>
    <h1 className="text-2xl font-semibold">Medio de contacto: {row.value}</h1><p>{contactLabels[row.type]} · {conditionLabels[row.condition]}</p>{row.label&&<p>Etiqueta: {row.label}</p>}
    <p>{row.associationCount>1?'Medio compartido':'Medio canónico'} · {row.associationCount} asociaciones. La condición global no representa verificación.</p>
    {editing?<ContactCorrectionForm identity={identity} initial={editing} saved={()=>{setEditing(null);setReplacementId(undefined);}} cancel={()=>setEditing(null)} onExisting={setReplacementId}/>:
      identity.permissions.includes('directory.write')&&<button className={buttonClass} onClick={()=>setEditing(row)}>Corregir medio de contacto</button>}
    {identity.permissions.includes('directory.write')&&<button className={buttonClass} disabled={mutation.isPending} onClick={()=>{void mutation.mutateAsync({path:'contact-methods/'+id+'/condition',method:'PATCH',body:{condition:row.condition==='USABLE'?'UNUSABLE':'USABLE',expectedVersion:row.version}}).catch(()=>undefined);}}>{row.condition==='USABLE'?'Marcar medio no utilizable':'Restablecer medio disponible'}</button>}
    <MutationError error={mutation.error} reload={async()=>{const fresh=await query.refetch();if(fresh.isSuccess)mutation.reset();}}/>
    {replacementId&&<><QueryState pending={replacement.isPending} error={replacement.isError} retry={replacement.refetch}/>{replacement.data&&<section className="space-y-3 rounded border border-amber-500 p-3">
      <p>El correo ya existe como {replacement.data.value}. Elige explícitamente abajo qué asociación sustituir. Los actores y el otro medio conservan sus identidades.</p>
      <Link className="inline-flex min-h-11 underline" to={'/contact-methods/'+replacementId}>Ver ficha del correo existente</Link><ContactMethodAssociations identity={identity} methodId={replacementId} readOnly/>
      <button className={buttonClass} onClick={()=>setReplacementId(undefined)}>Cancelar reutilización para corrección</button></section>}</>}
    <h2 className="text-xl font-semibold">Asociaciones del medio</h2><ContactMethodAssociations key={id} identity={identity} methodId={id} replacement={replacement.data}/>
    {identity.permissions.includes('directory.history.read')&&<DirectoryHistory key={'history-'+id} identity={identity} path={'contact-methods/'+id+'/history'}/>}</section>;
}
