import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { AuthIdentity } from '../auth/session';
import { useDirectoryMutation } from './queries';
import { useExactContactEmail } from './contacts.queries';
import { contactAssociationResultSchema, contactCreateFormSchema, contactLabels, contactTypes, type ContactCreateValues } from './contacts.contracts';
import { ContactContextFields } from './contact-context-form';
import { Field, inputClass, buttonClass, MutationError, QueryState } from './directory-ui';
export function ContactCreateForm({identity,actorPath,saved,cancel,organizationPresentation=false}:{identity:AuthIdentity;actorPath:string;saved:()=>void;cancel:()=>void;organizationPresentation?:boolean}) {
  const form=useForm<ContactCreateValues>({resolver:zodResolver(contactCreateFormSchema),defaultValues:{type:'EMAIL',value:'',label:'',sourceDescription:'',sourceUrl:'',notes:''}});
  const type=useWatch({control:form.control,name:'type'}),value=useWatch({control:form.control,name:'value'});
  const lookup=useExactContactEmail(identity,value,type==='EMAIL');
  const existing=type==='EMAIL'&&!!lookup.data?.contact;
  const mutation=useDirectoryMutation(identity);
  async function submit(input:ContactCreateValues) {
    if(existing)return;
    try {contactAssociationResultSchema.parse(await mutation.mutateAsync({path:actorPath+'/contacts',method:'POST',body:input}));saved();}
    catch { /* El error se muestra sin descartar el formulario. */ }
  }
  const methodFields=<>
    <Field label="Tipo de medio" error={form.formState.errors.type?.message}><select className={inputClass} {...form.register('type')}>{contactTypes.map(kind=><option key={kind} value={kind}>{contactLabels[kind]}</option>)}</select></Field>
    <Field label="Valor del medio" error={form.formState.errors.value?.message}><input className={inputClass} {...form.register('value')} maxLength={2048}/></Field>
    <Field label={type==='OTHER'?'Descripción del canal':'Etiqueta del medio (opcional)'} error={form.formState.errors.label?.message}><input className={inputClass} {...form.register('label')} maxLength={150}/></Field>
  </>;
  return <form onSubmit={form.handleSubmit(input=>submit(input))} className={organizationPresentation?'organization-contact-form':'space-y-4'}>
    {organizationPresentation?<fieldset className="organization-contact-group"><legend>Datos del medio</legend><div className="organization-contact-method-fields">{methodFields}</div></fieldset>:methodFields}
    {lookup.isFetching&&<p role="status">Consultando si el correo ya existe…</p>}
    {lookup.isError&&<QueryState pending={false} error retry={lookup.refetch}/>}
    {existing&&<p role="alert">Este correo ya está registrado. Utiliza otro correo; no se puede compartir entre personas u organizaciones.</p>}
    {organizationPresentation?<fieldset className="organization-contact-group"><legend>Contexto de la asociación</legend><div className="organization-contact-context-fields"><ContactContextFields form={form}/></div></fieldset>:<ContactContextFields form={form}/>}<p>La fuente y las observaciones pertenecen a esta asociación.</p>
    <MutationError error={mutation.error}/>
    <div className={`flex flex-wrap gap-3 ${organizationPresentation?'organization-contact-form-actions':''}`}><button className={buttonClass} disabled={mutation.isPending||existing}>{mutation.isPending?'Guardando…':'Registrar medio y asociar'}</button>
      <button type="button" className={buttonClass} disabled={mutation.isPending} onClick={cancel}>Cancelar registro de contacto</button></div></form>;
}
