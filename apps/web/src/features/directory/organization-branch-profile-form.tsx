import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { AuthIdentity } from '../auth/session';
import { Button } from '../../components/ui/actions';
import { FormActions, FormSection } from '../../components/ui/forms';
import { Field, inputClass, MutationError } from './directory-ui';
import { contactLabels, contactTypes } from './contacts.contracts';
import { organizationSchema } from './contracts';
import { useDirectoryMutation } from './queries';
import { branchProfileFormSchema, branchProfileValues, type BranchProfile, type BranchProfileFormValues } from './organization-branch-profile.contracts';

export function OrganizationBranchProfileForm({identity,ownerId,initial,saved,cancel,reload}:{identity:AuthIdentity;ownerId:string;initial:BranchProfile;saved:()=>void;cancel:()=>void;reload:()=>Promise<BranchProfile|undefined>}) {
  const [snapshot,setSnapshot]=useState(initial),[reloadFailed,setReloadFailed]=useState(false);
  const form=useForm<BranchProfileFormValues>({resolver:zodResolver(branchProfileFormSchema),defaultValues:branchProfileValues(initial)});
  const contacts=useFieldArray({control:form.control,name:'contacts'}),mutation=useDirectoryMutation(identity);
  const pending=mutation.isPending||form.formState.isSubmitting;
  async function submit(values:BranchProfileFormValues) {
    try {
      organizationSchema.parse(await mutation.mutateAsync({path:`organizations/${ownerId}/branches/${initial.branch.id}/profile`,method:'PUT',body:{
        country:values.country,alias:values.alias,description:values.description,officialWebsite:values.officialWebsite,expectedVersion:snapshot.branch.version,
        expectedContacts:snapshot.contacts.map(row=>({id:row.id,version:row.version,methodVersion:row.contactMethod.version})),
        contacts:values.contacts.map(({associationId,...fields})=>({...fields,...(associationId?{id:associationId}:{})})),
      }}));saved();
    }catch { /* Conservar todos los datos del editor ante un error. */ }
  }
  return <form className="person-profile-form" onSubmit={form.handleSubmit(submit)}>
    <fieldset disabled={pending} className="person-profile-fields">
      <FormSection heading="Datos de la sede">
        <Field label="Nombre"><input className={inputClass} value={snapshot.branch.branchOf?.name??snapshot.branch.name} readOnly/></Field>
        <Field label="Lugar de la sede" error={form.formState.errors.country?.message}><input className={inputClass} required maxLength={150} {...form.register('country')}/></Field>
        <Field label="Sigla o nombre alternativo (opcional)" error={form.formState.errors.alias?.message}><input className={inputClass} maxLength={150} {...form.register('alias')}/></Field>
        <Field label="Descripción (opcional)" error={form.formState.errors.description?.message}><textarea className={inputClass} maxLength={5000} {...form.register('description')}/></Field>
        <Field label="Sitio oficial (opcional)" error={form.formState.errors.officialWebsite?.message}><input className={inputClass} maxLength={2048} {...form.register('officialWebsite')}/></Field>
      </FormSection>
      <FormSection heading="Medios de contacto de la sede">
        {contacts.fields.map((contact,index)=><div key={contact.id} className="organization-person-contact-method" role="group" aria-label={`Medio de contacto ${index+1}`}>
          <p className="organization-person-contact-heading">Medio de contacto {index+1}</p>
          <Field label="Tipo de medio" error={form.formState.errors.contacts?.[index]?.type?.message}><select className={inputClass} {...form.register(`contacts.${index}.type`)}>{contactTypes.map(type=><option key={type} value={type}>{contactLabels[type]}</option>)}</select></Field>
          <Field label="Dato de contacto" error={form.formState.errors.contacts?.[index]?.value?.message}><input className={inputClass} maxLength={2048} {...form.register(`contacts.${index}.value`)}/></Field>
          <Field label="Etiqueta (opcional)" error={form.formState.errors.contacts?.[index]?.label?.message}><input className={inputClass} maxLength={150} {...form.register(`contacts.${index}.label`)}/></Field>
          <details><summary>Fuente y observaciones</summary>
            <Field label="Descripción de fuente (opcional)" error={form.formState.errors.contacts?.[index]?.sourceDescription?.message}><input className={inputClass} maxLength={1000} {...form.register(`contacts.${index}.sourceDescription`)}/></Field>
            <Field label="URL de fuente (opcional)" error={form.formState.errors.contacts?.[index]?.sourceUrl?.message}><input className={inputClass} maxLength={2048} {...form.register(`contacts.${index}.sourceUrl`)}/></Field>
            <Field label="Observaciones (opcional)" error={form.formState.errors.contacts?.[index]?.notes?.message}><textarea className={inputClass} maxLength={5000} {...form.register(`contacts.${index}.notes`)}/></Field>
          </details>
          <Button onClick={()=>contacts.remove(index)}>Quitar medio</Button>
        </div>)}
        {!contacts.fields.length&&<p>No hay medios de contacto añadidos.</p>}
        <Button onClick={()=>contacts.append({associationId:'',type:'EMAIL',value:'',label:'',sourceDescription:'',sourceUrl:'',notes:''})}>Agregar medio de contacto</Button>
      </FormSection>
    </fieldset>
    <MutationError error={mutation.error} reload={async()=>{const fresh=await reload();if(fresh){setSnapshot(fresh);form.reset(branchProfileValues(fresh));mutation.reset();setReloadFailed(false);}else setReloadFailed(true);}}/>
    {reloadFailed&&<p role="alert">No se pudo recargar la sede. Tus cambios se conservan.</p>}
    <FormActions><Button type="submit" variant="primary" pending={pending} disabled={pending}>Guardar sede</Button><Button disabled={pending} onClick={cancel}>Cancelar</Button></FormActions>
  </form>;
}
