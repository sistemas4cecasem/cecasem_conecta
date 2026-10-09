import { useState } from 'react';
import { Link } from 'react-router';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { AuthIdentity } from '../auth/session';
import { ApiError,apiRequest } from '../../lib/api/client';
import { useDirectoryMutation } from './queries';
import { useExactContactEmail,useContactMethod,useContactMethods } from './contacts.queries';
import { contactAssociationResultSchema,contactCreateFormSchema,contactLabels,contactTypes,conditionLabels,contactMethodSchema,type ContactCreateValues,type ContactMethod } from './contacts.contracts';
import { ContactContextFields } from './contact-context-form';
import { ContactMethodAssociations } from './contact-associations';
import { Field,inputClass,buttonClass,MutationError,QueryState,Pagination } from './directory-ui';
export function ContactCreateForm({identity,actorPath,saved,cancel,organizationPresentation=false}:{identity:AuthIdentity;actorPath:string;saved:()=>void;cancel:()=>void;organizationPresentation?:boolean}) {
  const form=useForm<ContactCreateValues>({resolver:zodResolver(contactCreateFormSchema),defaultValues:{type:'EMAIL',value:'',label:'',sourceDescription:'',sourceUrl:'',notes:''}});
  const type=useWatch({control:form.control,name:'type'}),value=useWatch({control:form.control,name:'value'});
  const lookup=useExactContactEmail(identity,value,type==='EMAIL');const [conflictSelection,setConflictSelection]=useState<{id:string;value:string;type:string}>();
  const conflictId=conflictSelection?.type===type&&conflictSelection.value===value.trim()?conflictSelection.id:undefined;
  const [selecting,setSelecting]=useState(false),[page,setPage]=useState(1),[selection,setSelection]=useState<ContactMethod>();
  const candidates=useContactMethods(identity,selecting?`contact-methods?type=${type}&page=${page}`:undefined);
  const [reloadFailed,setReloadFailed]=useState(false);
  const conflict=useContactMethod(identity,conflictId);const existing=selection?.type===type&&selection.value===value?selection:conflictId?conflict.data:type==='EMAIL'?lookup.data?.contact:undefined;const mutation=useDirectoryMutation(identity);
  async function submit(input:ContactCreateValues,reuseId?:string) {
    const {sourceDescription,sourceUrl,notes}=input;
    try {contactAssociationResultSchema.parse(await mutation.mutateAsync({path:actorPath+'/contacts'+(reuseId?'/existing':''),method:'POST',
      body:reuseId?{contactMethodId:reuseId,expectedMethodVersion:existing?.version,sourceDescription,sourceUrl,notes}:input}));saved();}
    catch(error){if(error instanceof ApiError&&error.code==='CONTACT_EMAIL_EXISTS'&&error.details?.contactMethodId)setConflictSelection({id:error.details.contactMethodId,value:input.value,type:input.type});}
  }
  const methodFields=<>
    <Field label="Tipo de medio" error={form.formState.errors.type?.message}><select className={inputClass} {...form.register('type')}>{contactTypes.map(kind=><option key={kind} value={kind}>{contactLabels[kind]}</option>)}</select></Field>
    <Field label="Valor del medio" error={form.formState.errors.value?.message}><input className={inputClass} {...form.register('value')} maxLength={2048}/></Field>
    <Field label={type==='OTHER'?'Descripción del canal':'Etiqueta del medio (opcional)'} error={form.formState.errors.label?.message}><input className={inputClass} {...form.register('label')} maxLength={150}/></Field>
  </>;
  return <form onSubmit={form.handleSubmit(input=>submit(input))} className={organizationPresentation?'organization-contact-form':'space-y-4'}>
    {organizationPresentation?<fieldset className="organization-contact-group"><legend>Datos del medio</legend><div className="organization-contact-method-fields">{methodFields}</div></fieldset>:methodFields}
    <button type="button" className={buttonClass} onClick={()=>{setSelecting(!selecting);setPage(1);}}>{selecting?'Cerrar selección de medios':'Seleccionar un medio existente'}</button>
    {selecting&&<section className={organizationPresentation?'organization-contact-candidate-panel space-y-3':'space-y-3'}><p>Medios canónicos del tipo seleccionado, incluidos sus antecedentes.</p><QueryState pending={candidates.isPending} error={candidates.isError} retry={candidates.refetch}/>
      {candidates.data?.total===0&&<p>No hay medios canónicos de este tipo.</p>}
      <ul className={organizationPresentation?'organization-contact-candidates':''}>{candidates.data?.items.map(candidate=><li key={candidate.id}><button type="button" className={buttonClass} onClick={()=>{form.setValue('type',candidate.type);form.setValue('value',candidate.value);form.setValue('label',candidate.label??'');setSelection(candidate);setSelecting(false);}}>Seleccionar {candidate.value}</button></li>)}</ul>
      {candidates.data&&(!organizationPresentation||candidates.data.total>0)&&<Pagination page={page} total={candidates.data.total} onPage={setPage}/>}</section>}
    {lookup.isFetching&&<p role="status">Consultando si el correo ya existe…</p>}
    {lookup.isError&&<QueryState pending={false} error retry={lookup.refetch}/>}
    {conflictId&&<QueryState pending={conflict.isPending} error={conflict.isError} retry={conflict.refetch}/>}
    {existing&&<section className={`space-y-3 rounded border border-amber-500 p-3 ${organizationPresentation?'organization-contact-existing':''}`}><h3 className="font-semibold">{existing.type==='EMAIL'?'Este correo ya está registrado.':'Este medio ya está registrado.'}</h3>
      <p>{contactLabels[existing.type]}: {existing.value} · {conditionLabels[existing.condition]}</p><Link className="inline-flex min-h-11 underline" to={'/contact-methods/'+existing.id}>Ver ficha del medio existente</Link>
      <ContactMethodAssociations identity={identity} methodId={existing.id} readOnly/>
      <p>La fuente y las observaciones escritas abajo se aplicarán a la asociación nueva solo si confirmas. Si la asociación ya existe, se conserva su contexto.</p>
      <button type="button" className={buttonClass} disabled={mutation.isPending||existing.condition==='UNUSABLE'} onClick={()=>{void form.handleSubmit(input=>submit(input,existing.id))();}}>Asociar este contacto</button>
    </section>}
    {organizationPresentation?<fieldset className="organization-contact-group"><legend>Contexto de la asociación</legend><div className="organization-contact-context-fields"><ContactContextFields form={form}/></div></fieldset>:<ContactContextFields form={form}/>}<p>La fuente pertenece a esta asociación. Registrar o editar no verifica el medio ni sus asociaciones.</p>
    <MutationError error={mutation.error}/>
    {mutation.error instanceof ApiError&&mutation.error.code==='VERSION_CONFLICT'&&existing&&<button type="button" className={buttonClass} onClick={()=>{void apiRequest('contact-methods/'+existing.id).then(result=>{const fresh=contactMethodSchema.parse(result);form.setValue('type',fresh.type);form.setValue('value',fresh.value);form.setValue('label',fresh.label??'');setSelection(fresh);mutation.reset();setReloadFailed(false);}).catch(()=>setReloadFailed(true));}}>Recargar medio y conservar fuente y observaciones</button>}
    {reloadFailed&&<p role="alert">No se pudo recargar el medio. Los datos del formulario se conservan.</p>}
    <div className={`flex flex-wrap gap-3 ${organizationPresentation?'organization-contact-form-actions':''}`}><button className={buttonClass} disabled={mutation.isPending||!!existing||!!conflictId}>{mutation.isPending?'Guardando…':'Registrar medio y asociar'}</button>
      <button type="button" className={buttonClass} disabled={mutation.isPending} onClick={cancel}>Cancelar registro de contacto</button></div></form>;
}
