import { z } from 'zod';
import { contactLabels, contactTypes, optionalContactMethodsSchema } from './contacts.contracts';
import { FormSection, FormActions } from '../../components/ui/forms';
import { Button } from '../../components/ui/actions';
import { useState } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import type { AuthIdentity } from '../auth/session';
import { organizationFormSchema, organizationSchema, type Organization } from './contracts';
import { useDirectoryMutation } from './queries';
import { Field, inputClass, MutationError } from './directory-ui';

const formSchema=organizationFormSchema.extend({contactMethods:optionalContactMethodsSchema});
type FormValues=z.infer<typeof formSchema>;

export function OrganizationForm({ identity, initial, branchOfId, branchOwnerName, saved, cancel, reload }: {
  identity: AuthIdentity; initial?: Organization; branchOfId?: string; branchOwnerName?:string; saved: (organization: Organization) => void; cancel: () => void; reload?: () => Promise<Organization | undefined>;
}) {
  const isBranch=!!(initial?.branchOfId||branchOfId);
  const form = useForm<FormValues>({ resolver: zodResolver(formSchema.superRefine((values,context)=>{if(isBranch&&!values.country.trim())context.addIssue({code:'custom',path:['country'],message:'Indica el lugar de la sede.'});})), defaultValues: {
    name: isBranch?(branchOwnerName??initial?.branchOf?.name??initial?.name??''):initial?.name??'', country: initial?.country ?? '', alias: initial?.alias ?? '', description: initial?.description ?? '',
    officialWebsite: initial?.officialWebsite ?? '', branchOfId: initial?.branchOfId ?? branchOfId ?? '', interestAreas: initial?.interestAreas ?? [],contactMethods:!initial&&isBranch?[{type:'EMAIL',value:'',label:''}]:[] } });
  const contacts=useFieldArray({control:form.control,name:'contactMethods'});
  const mutation = useDirectoryMutation(identity);
  const areas = useWatch({ control: form.control, name: 'interestAreas' });
  const [areaDraft, setAreaDraft] = useState('');
  const [areaError, setAreaError] = useState('');
  const [version, setVersion] = useState(initial?.version);

  function addArea(): string[] | null {
    const area = areaDraft.trim().replace(/\s+/gu, ' ');
    if (!area) { setAreaError('Escribe un área de interés.'); return null; }
    if (area.length > 150) { setAreaError('El máximo es 150 caracteres por área.'); return null; }
    if (areas.some(item => item.toLowerCase() === area.toLowerCase())) { setAreaError('Esta área ya está añadida.'); return null; }
    if (areas.length >= 100) { setAreaError('Puedes añadir hasta 100 áreas de interés.'); return null; }
    const next = [...areas, area];
    form.setValue('interestAreas', next, { shouldDirty: true, shouldValidate: true });
    setAreaDraft(''); setAreaError(''); return next;
  }
  async function submit(values: FormValues) {
    const nextAreas = isBranch ? [] : areaDraft.trim() ? addArea() : values.interestAreas;
    if (!nextAreas) return;
    values = { ...values, interestAreas: nextAreas };
    try {
      const result = await mutation.mutateAsync({ path: initial ? 'organizations/' + initial.id : isBranch ? 'organizations/'+branchOfId+'/branches' : 'organizations', method: initial ? 'PUT' : 'POST',
        body: initial || !isBranch ? {name:values.name,country:values.country,alias:values.alias,description:values.description,officialWebsite:values.officialWebsite,interestAreas:values.interestAreas,branchOfId:values.branchOfId||null,...(initial?{expectedVersion:version}:{})} : {country:values.country,alias:values.alias,description:values.description,officialWebsite:values.officialWebsite,contactMethods:values.contactMethods.filter(contact=>contact.value.trim())} });
      saved(organizationSchema.parse(result));
    } catch { /* La mutación mantiene el error y el borrador. */ }
  }
  async function reloadForm() {
    const row = await reload?.();
    if (!row) return;
    form.reset({ name: isBranch?(branchOwnerName??row.branchOf?.name??row.name):row.name, country: row.country ?? '', alias: row.alias ?? '', description: row.description ?? '',
      officialWebsite: row.officialWebsite ?? '', branchOfId: row.branchOfId ?? branchOfId ?? '', interestAreas: row.interestAreas, contactMethods:[] });
    setAreaDraft(''); setAreaError('');
    setVersion(row.version); mutation.reset();
  }

  return <form onSubmit={form.handleSubmit(submit)} className="organization-form">
    <input type="hidden" {...form.register('branchOfId')} />
    <FormSection className="organization-form-group" heading={isBranch?"Datos de la sede":"Datos institucionales"}>
      <div className="organization-basic-fields">
        <Field label="Nombre" error={form.formState.errors.name?.message}><input {...form.register('name')} readOnly={isBranch} className={inputClass} maxLength={250} /></Field>
        <Field label={isBranch?"Lugar de la sede":"País (opcional)"} error={form.formState.errors.country?.message}><input {...form.register('country')} required={isBranch} className={inputClass} maxLength={150} /></Field>
        <Field label="Sigla o nombre alternativo (opcional)" error={form.formState.errors.alias?.message}><input {...form.register('alias')} className={inputClass} maxLength={150} /></Field>
        <Field label="Descripción (opcional)" error={form.formState.errors.description?.message}><textarea {...form.register('description')} className={inputClass} maxLength={5000} /></Field>
        <Field label="Sitio oficial (opcional)" error={form.formState.errors.officialWebsite?.message}><input {...form.register('officialWebsite')} className={inputClass} maxLength={2048} placeholder="https://…" /></Field>
      </div>
    </FormSection>

    {!isBranch&&<FormSection className="organization-form-group" heading="Áreas de interés (opcional)">
      <p>Añade los temas en los que trabaja la organización para orientar el acercamiento institucional.</p>
      <Field label="Área de interés" error={areaError || form.formState.errors.interestAreas?.message}>
        <input value={areaDraft} onChange={event => { setAreaDraft(event.target.value); setAreaError(''); }} className={inputClass} maxLength={150}
          placeholder="Por ejemplo: Educación ambiental" disabled={mutation.isPending}
          onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addArea(); } }} />
      </Field>
      <Button onClick={addArea} disabled={mutation.isPending}>Añadir área de interés</Button>
      {!!areas.length && <ul className="organization-interest-areas" aria-label="Áreas de interés añadidas">
        {areas.map((area, index) => <li key={area}><span>{area}</span><Button aria-label={'Quitar ' + area} disabled={mutation.isPending}
          onClick={() => form.setValue('interestAreas', areas.filter((_, i) => i !== index), { shouldDirty: true, shouldValidate: true })}>Quitar</Button></li>)}
      </ul>}
      {!areas.length && <p>No hay áreas de interés añadidas.</p>}
    </FormSection>}

    {!initial&&isBranch&&<FormSection className="organization-form-group" heading="Medios de contacto de la sede">
      {contacts.fields.map((contact,index)=><div className="organization-person-contact-method" key={contact.id} role="group" aria-label={`Medio de contacto ${index+1}`}>
        <p className="organization-person-contact-heading">Medio de contacto {index+1}</p>
        <Field label="Tipo de medio" error={form.formState.errors.contactMethods?.[index]?.type?.message}><select className={inputClass} {...form.register(`contactMethods.${index}.type`)}>{contactTypes.map(type=><option key={type} value={type}>{contactLabels[type]}</option>)}</select></Field>
        <Field label="Dato de contacto" error={form.formState.errors.contactMethods?.[index]?.value?.message}><input className={inputClass} maxLength={2048} {...form.register(`contactMethods.${index}.value`)}/></Field>
        <Field label="Etiqueta (opcional)" error={form.formState.errors.contactMethods?.[index]?.label?.message}><input className={inputClass} maxLength={150} {...form.register(`contactMethods.${index}.label`)}/></Field>
        <Button disabled={mutation.isPending} onClick={()=>contacts.remove(index)}>Quitar medio</Button>
      </div>)}
      <Button disabled={mutation.isPending} onClick={()=>contacts.append({type:'EMAIL',value:'',label:''})}>Agregar otro medio</Button>
    </FormSection>}
    {isBranch&&<p>Las áreas de interés corresponden a la organización principal.</p>}
    <MutationError error={mutation.error} reload={reload ? reloadForm : undefined} />
    <FormActions className="organization-form-actions"><Button type="submit" variant="primary" pending={mutation.isPending} disabled={mutation.isPending}>{mutation.isPending ? 'Guardando…' : branchOfId || initial?.branchOfId ? 'Guardar sede' : 'Guardar organización'}</Button>
      <Button disabled={mutation.isPending} onClick={cancel}>Cancelar</Button></FormActions>
  </form>;
}
