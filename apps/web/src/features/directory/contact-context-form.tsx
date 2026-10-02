import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { AuthIdentity } from '../auth/session';
import { apiRequest } from '../../lib/api/client';
import { useDirectoryMutation } from './queries';
import { Field,inputClass,buttonClass,MutationError } from './directory-ui';
import { contactAssociationSchema,contactContextSchema,type ContactAssociation,type ContactContextValues } from './contacts.contracts';
import { contextValues,associationPath } from './contact-context';
export function ContactContextFields<T extends ContactContextValues>({form}:{form:UseFormReturn<T>}) {
  // Estos tres campos pertenecen a la asociación, aunque otros formularios añadan datos del medio.
  const contextForm=form as unknown as UseFormReturn<ContactContextValues>;
  return <><Field label="Descripción de fuente (opcional)" error={contextForm.formState.errors.sourceDescription?.message}><input className={inputClass} {...contextForm.register('sourceDescription')} maxLength={1000}/></Field>
    <Field label="URL de fuente (opcional)" error={contextForm.formState.errors.sourceUrl?.message}><input className={inputClass} {...contextForm.register('sourceUrl')} maxLength={2048}/></Field>
    <Field label="Observaciones de la asociación (opcional)" error={contextForm.formState.errors.notes?.message}><textarea className={inputClass} {...contextForm.register('notes')} maxLength={5000}/></Field></>;
}
export function ContactContextForm({identity,initial,saved,cancel}:{identity:AuthIdentity;initial:ContactAssociation;saved:()=>void;cancel:()=>void}) {
  const form=useForm<ContactContextValues>({resolver:zodResolver(contactContextSchema),defaultValues:contextValues(initial)});
  const [version,setVersion]=useState(initial.version),[reloadFailed,setReloadFailed]=useState(false);const mutation=useDirectoryMutation(identity);
  async function submit(values:ContactContextValues) {try{await mutation.mutateAsync({path:associationPath(initial),method:'PUT',body:{...values,expectedVersion:version}});saved();}catch{/* Preservar contexto escrito. */}}
  return <form onSubmit={form.handleSubmit(submit)} className="space-y-3"><p>Estos datos corresponden solo a esta asociación; las otras asociaciones del medio se conservan.</p>
    <ContactContextFields form={form}/><MutationError error={mutation.error} reload={async()=>{try{const row=contactAssociationSchema.parse(await apiRequest(associationPath(initial)));form.reset(contextValues(row));setVersion(row.version);mutation.reset();setReloadFailed(false);}catch{setReloadFailed(true);}}}/>
    {reloadFailed&&<p role="alert">No se pudo recargar. El borrador se conserva.</p>}
    <div className="flex flex-wrap gap-3"><button className={buttonClass} disabled={mutation.isPending}>Guardar contexto</button><button type="button" className={buttonClass} disabled={mutation.isPending} onClick={cancel}>Cancelar edición de contexto</button></div></form>;
}
