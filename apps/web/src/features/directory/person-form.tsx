import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { AuthIdentity } from '../auth/session';
import { personFormSchema,personSchema,type Person,type PersonFormValues } from './contracts';
import { useDirectoryMutation } from './queries';
import { Field,inputClass,buttonClass,MutationError } from './directory-ui';
function values(row?:Person):PersonFormValues {return {displayName:row?.displayName??'',givenNames:row?.givenNames??'',familyNames:row?.familyNames??''};}
export function PersonForm({identity,initial,saved,cancel,reload}:{identity:AuthIdentity;initial?:Person;saved:(row:Person)=>void;cancel:()=>void;reload?:()=>Promise<Person|undefined>}) {
  const form=useForm<PersonFormValues>({resolver:zodResolver(personFormSchema),defaultValues:values(initial)});
  const mutation=useDirectoryMutation(identity);const [version,setVersion]=useState(initial?.version);
  async function submit(input:PersonFormValues) {
    try {const row=personSchema.parse(await mutation.mutateAsync({path:initial?'people/'+initial.id:'people',method:initial?'PUT':'POST',body:{...input,...(initial?{expectedVersion:version}:{})}}));saved(row);} catch { /* Mostrar error sin perder borrador. */ }
  }
  return <form onSubmit={form.handleSubmit(submit)} className="space-y-4">
    <Field label="Nombre de presentación" error={form.formState.errors.displayName?.message}><input className={inputClass} {...form.register('displayName')} maxLength={250}/></Field>
    <Field label="Nombres (opcional)" error={form.formState.errors.givenNames?.message}><input className={inputClass} {...form.register('givenNames')} maxLength={150}/></Field>
    <Field label="Apellidos (opcional)" error={form.formState.errors.familyNames?.message}><input className={inputClass} {...form.register('familyNames')} maxLength={150}/></Field>
    <p>No requiere organización. Guardar no verifica la información.</p>
    <MutationError error={mutation.error} reload={reload?async()=>{const row=await reload();if(row){form.reset(values(row));setVersion(row.version);mutation.reset();}}:undefined}/>
    <div className="flex flex-wrap gap-3"><button className={buttonClass} disabled={mutation.isPending}>{mutation.isPending?'Guardando…':'Guardar persona'}</button>
      <button type="button" className={buttonClass} onClick={cancel} disabled={mutation.isPending}>Cancelar</button></div>
  </form>;
}
