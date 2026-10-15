import { useRef, type FormEvent } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import type { AuthIdentity } from '../auth/session';
import { contactLabels, contactTypes } from './contacts.contracts';
import { organizationPersonContextFormSchema, type OrganizationPersonContextFormValues } from './organization-person-form.contracts';
import {
  organizationPersonContextResponseSchema,
  type Person,
} from './contracts';
import { useDirectoryMutation } from './queries';
import { buttonClass, Field, inputClass, MutationError } from './directory-ui';

export function OrganizationPersonForm({ identity, organizationId, saved, cancel }: {
  identity: AuthIdentity;
  organizationId: string;
  saved: (person: Person) => void;
  cancel: () => void;
}) {
  const submitLock = useRef(false);
  const form = useForm<OrganizationPersonContextFormValues>({
    resolver: zodResolver(organizationPersonContextFormSchema),
    defaultValues: {
      person: { givenNames: '', familyNames: '' },
      contactMethods: [{type:'EMAIL',value:'',label:''}],
      positionTitle: '', area: '', isCurrent: true, notes: '',
    },
  });
  const contactMethods = useFieldArray({control:form.control,name:'contactMethods'});
  const mutation = useDirectoryMutation(identity);

  async function submit(values: OrganizationPersonContextFormValues) {
    if (submitLock.current) return;
    submitLock.current = true;
    const { person, contactMethods:methods, ...episode } = values;
    const body = {
      personMode: 'new',
      person:{...person,displayName:[person.givenNames,person.familyNames].filter(Boolean).join(' ')},
      contactMethods:methods.filter(method=>method.value.trim()),
      ...episode,
    };
    try {
      const result = organizationPersonContextResponseSchema.parse(await mutation.mutateAsync({
        path: `organizations/${organizationId}/people`, method: 'POST', body,
      }));
      saved(result.person);
    } catch {
      // MutationError muestra el mensaje público y conserva los valores del formulario.
    } finally {
      submitLock.current = false;
    }
  }

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    void form.handleSubmit(submit)(event);
  }

  return <form className="organization-person-form" onSubmit={handleFormSubmit} noValidate>
    <fieldset className="organization-person-identity">
      <legend>Datos de la persona</legend>
      <Field label="Nombres (opcional)" error={form.formState.errors.person?.givenNames?.message}>
        <input className={inputClass} maxLength={150} {...form.register('person.givenNames')} />
      </Field>
      <Field label="Apellidos (opcional)" error={form.formState.errors.person?.familyNames?.message}>
        <input className={inputClass} maxLength={150} {...form.register('person.familyNames')} />
      </Field>
      <p>Registra al menos los nombres o los apellidos.</p>
    </fieldset>

    <fieldset className="organization-person-contacts">
      <legend>Medios de contacto</legend>
      <p>Agrega los medios disponibles, como correo, teléfono o LinkedIn. Puedes añadir más de uno.</p>
      {contactMethods.fields.map((method,index)=><div className="organization-person-contact-method" key={method.id}>
        <Field label="Tipo de medio" error={form.formState.errors.contactMethods?.[index]?.type?.message}>
          <select className={inputClass} {...form.register(`contactMethods.${index}.type`)}>
            {contactTypes.map(type=><option key={type} value={type}>{contactLabels[type]}</option>)}
          </select>
        </Field>
        <Field label="Dato de contacto" error={form.formState.errors.contactMethods?.[index]?.value?.message}>
          <input className={inputClass} maxLength={2048} {...form.register(`contactMethods.${index}.value`)} />
        </Field>
        <Field label="Etiqueta (opcional)" error={form.formState.errors.contactMethods?.[index]?.label?.message}>
          <input className={inputClass} maxLength={150} {...form.register(`contactMethods.${index}.label`)} />
        </Field>
        <button type="button" className={buttonClass} onClick={()=>contactMethods.remove(index)}>Quitar medio</button>
      </div>)}
      <button type="button" className={buttonClass} onClick={()=>contactMethods.append({type:'EMAIL',value:'',label:''})}>Agregar otro medio</button>
    </fieldset>

    {(form.formState.errors.positionTitle || form.formState.errors.area || form.formState.errors.notes) && <p role="alert">Revisa los datos del vínculo señalados en el formulario.</p>}
    <fieldset className="organization-person-episode">
      <legend>Vínculo con esta organización</legend>
      <Field label="Cargo institucional (opcional)" error={form.formState.errors.positionTitle?.message}>
        <input className={inputClass} maxLength={250} {...form.register('positionTitle')} />
      </Field>
      <Field label="Área o función (opcional)" error={form.formState.errors.area?.message}>
        <input className={inputClass} maxLength={250} {...form.register('area')} />
      </Field>
      <label className="organization-person-current"><input type="checkbox" {...form.register('isCurrent')} /> El vínculo está vigente</label>
      <Field label="Observaciones (opcional)" error={form.formState.errors.notes?.message}>
        <textarea className={inputClass} maxLength={5000} {...form.register('notes')} />
      </Field>
    </fieldset>

    <MutationError error={mutation.error} />
    <div className="organization-person-actions">
      <button className={buttonClass} disabled={mutation.isPending || form.formState.isSubmitting}>
        {mutation.isPending ? 'Guardando…' : 'Registrar persona y vincular'}
      </button>
      <button type="button" className={buttonClass} disabled={mutation.isPending} onClick={cancel}>Cancelar</button>
    </div>
  </form>;
}
