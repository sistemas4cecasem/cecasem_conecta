import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { AuthIdentity } from '../auth/session';
import { useDirectoryMutation } from './queries';
import { personProfileFormSchema, profileFormValues, type PersonProfile, type PersonProfileFormValues } from './person-profile.contracts';
import { contactTypes, contactLabels } from './contacts.contracts';
import { personSchema } from './contracts';
import { Field, inputClass, MutationError } from './directory-ui';
import { Button } from '../../components/ui/actions';
import { FormActions, FormSection } from '../../components/ui/forms';

export function PersonProfileForm({identity,initial,organizationId,saved,cancel,reload}:{identity:AuthIdentity;initial:PersonProfile;organizationId?:string;saved:()=>void;cancel:()=>void;reload:()=>Promise<PersonProfile|undefined>}) {
  const [snapshot,setSnapshot]=useState(initial);
  const [reloadFailed,setReloadFailed]=useState(false);
  const form=useForm<PersonProfileFormValues>({resolver:zodResolver(personProfileFormSchema),defaultValues:profileFormValues(initial)});
  const contacts=useFieldArray({control:form.control,name:'contacts'});
  const mutation=useDirectoryMutation(identity);
  async function submit(values:PersonProfileFormValues) {
    try {
      personSchema.parse(await mutation.mutateAsync({path:'people/'+initial.person.id+'/profile',method:'PUT',body:{
        displayName:values.displayName,givenNames:values.givenNames,familyNames:values.familyNames,expectedVersion:snapshot.person.version,
        ...(organizationId?{organizationId}:{}),
        expectedContacts:snapshot.contacts.map(row=>({id:row.id,version:row.version,methodVersion:row.contactMethod.version})),
        contacts:values.contacts.map(row=>({...(row.associationId?{id:row.associationId}:{}),type:row.type,value:row.value,label:row.label})),
        relations:values.relations.map(row=>({id:row.id,expectedVersion:row.expectedVersion,positionTitle:row.positionTitle,area:row.area})),
      }})); saved();
    } catch { /* La mutación conserva el error y el formulario completo. */ }
  }
  const pending=mutation.isPending||form.formState.isSubmitting;
  return <form className="person-profile-form" onSubmit={form.handleSubmit(submit)}>
    <fieldset disabled={pending} className="person-profile-fields">
      <FormSection heading="Información personal">
        <Field label="Nombre de presentación" error={form.formState.errors.displayName?.message}><input className={inputClass} maxLength={250} {...form.register('displayName')}/></Field>
        <div className="ui-form-grid">
          <Field label="Nombres (opcional)" error={form.formState.errors.givenNames?.message}><input className={inputClass} maxLength={150} {...form.register('givenNames')}/></Field>
          <Field label="Apellidos (opcional)" error={form.formState.errors.familyNames?.message}><input className={inputClass} maxLength={150} {...form.register('familyNames')}/></Field>
        </div>
      </FormSection>
      <FormSection heading="Medios de contacto">
        {contacts.fields.map((contact,index)=><div key={contact.id} className="organization-person-contact-method" role="group" aria-label={`Medio de contacto ${index+1}`}>
          <p className="organization-person-contact-heading">Medio de contacto {index+1}</p>
          <Field label="Tipo de medio" error={form.formState.errors.contacts?.[index]?.type?.message}><select className={inputClass} {...form.register(`contacts.${index}.type`)}>{contactTypes.map(type=><option key={type} value={type}>{contactLabels[type]}</option>)}</select></Field>
          <Field label="Dato de contacto" error={form.formState.errors.contacts?.[index]?.value?.message}><input className={inputClass} maxLength={2048} {...form.register(`contacts.${index}.value`)}/></Field>
          <Field label="Etiqueta (opcional)" error={form.formState.errors.contacts?.[index]?.label?.message}><input className={inputClass} maxLength={150} {...form.register(`contacts.${index}.label`)}/></Field>
          <Button onClick={()=>contacts.remove(index)}>Quitar medio</Button>
        </div>)}
        {!contacts.fields.length&&<p>No hay medios de contacto añadidos.</p>}
        <Button onClick={()=>contacts.append({associationId:'',type:'EMAIL',value:'',label:'',sourceDescription:'',sourceUrl:'',notes:''})}>Agregar medio de contacto</Button>
      </FormSection>
      {!!initial.relations.length&&<FormSection heading="Cargo y función">
        {initial.relations.map((relation,index)=><fieldset key={relation.id} className="person-profile-role">
          <legend>{relation.organization.name}{!relation.isCurrent?' · Histórico':''}</legend>
          <div className="ui-form-grid">
            <Field label="Cargo institucional (opcional)" error={form.formState.errors.relations?.[index]?.positionTitle?.message}><input className={inputClass} maxLength={250} {...form.register(`relations.${index}.positionTitle`)}/></Field>
            <Field label="Área o función (opcional)" error={form.formState.errors.relations?.[index]?.area?.message}><input className={inputClass} maxLength={250} {...form.register(`relations.${index}.area`)}/></Field>
          </div>
        </fieldset>)}
      </FormSection>}
    </fieldset>
    <MutationError error={mutation.error} reload={async()=>{const fresh=await reload();if(fresh){setSnapshot(fresh);form.reset(profileFormValues(fresh));mutation.reset();setReloadFailed(false);}else setReloadFailed(true);}}/>
    {reloadFailed&&<p role="alert">No se pudo recargar la ficha. Tus cambios se conservan.</p>}
    <FormActions><Button type="submit" variant="primary" pending={pending} disabled={pending}>Guardar cambios</Button><Button onClick={cancel} disabled={pending}>Cancelar</Button></FormActions>
  </form>;
}
