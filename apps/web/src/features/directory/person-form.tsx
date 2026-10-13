import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { AuthIdentity } from '../auth/session';
import { personFormSchema,personSchema,type Person,type PersonFormValues } from './contracts';
import { useDirectoryMutation } from './queries';
import { MutationError } from './directory-ui';
import { FormActions, FormField, FormSection, Input } from '../../components/ui/forms';
import { Button } from '../../components/ui/actions';
function values(row?:Person):PersonFormValues {return {displayName:row?.displayName??'',givenNames:row?.givenNames??'',familyNames:row?.familyNames??''};}
export function PersonForm({identity,initial,saved,cancel,reload}:{identity:AuthIdentity;initial?:Person;saved:(row:Person)=>void;cancel:()=>void;reload?:()=>Promise<Person|undefined>}) {
  const form=useForm<PersonFormValues>({resolver:zodResolver(personFormSchema),defaultValues:values(initial)});
  const mutation=useDirectoryMutation(identity);const [version,setVersion]=useState(initial?.version);
  async function submit(input:PersonFormValues) {
    try {const row=personSchema.parse(await mutation.mutateAsync({path:initial?'people/'+initial.id:'people',method:initial?'PUT':'POST',body:{...input,...(initial?{expectedVersion:version}:{})}}));saved(row);} catch { /* Mostrar error sin perder borrador. */ }
  }
  return <form onSubmit={form.handleSubmit(submit)} className="space-y-4">
    <FormSection heading="Identidad de la persona">
      <FormField label="Nombre de presentación" error={form.formState.errors.displayName?.message}>{control => <Input {...control} {...form.register('displayName')} maxLength={250}/>}</FormField>
      <div className="ui-form-grid">
        <FormField label="Nombres (opcional)" error={form.formState.errors.givenNames?.message}>{control => <Input {...control} {...form.register('givenNames')} maxLength={150}/>}</FormField>
        <FormField label="Apellidos (opcional)" error={form.formState.errors.familyNames?.message}>{control => <Input {...control} {...form.register('familyNames')} maxLength={150}/>}</FormField>
      </div>
    </FormSection>
    <p>No requiere organización.</p>
    <MutationError error={mutation.error} reload={reload?async()=>{const row=await reload();if(row){form.reset(values(row));setVersion(row.version);mutation.reset();}}:undefined}/>
    <FormActions><Button type="submit" variant="primary" pending={mutation.isPending} disabled={mutation.isPending}>{mutation.isPending?'Guardando…':'Guardar persona'}</Button>
      <Button onClick={cancel} disabled={mutation.isPending}>Cancelar</Button></FormActions>
  </form>;
}
