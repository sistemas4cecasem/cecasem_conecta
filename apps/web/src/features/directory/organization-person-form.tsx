import { useRef, useState, type FormEvent } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router';
import type { AuthIdentity } from '../auth/session';
import { ApiError } from '../../lib/api/client';
import {
  organizationPersonContextFormSchema,
  organizationPersonContextResponseSchema,
  type OrganizationPersonContextFormValues,
  type Person,
} from './contracts';
import { useDirectoryMutation, usePeople, usePersonRelations } from './queries';
import { buttonClass, Field, inputClass, MutationError, Pagination, QueryState } from './directory-ui';

const institutionalStatusLabels = {
  NO_KNOWN_LINKS: 'Sin vínculos institucionales conocidos',
  HISTORICAL_ONLY: 'Solo vínculos históricos',
  CURRENT: 'Con vínculos vigentes',
} as const;

function institutionalStatusLabel(person: Person) {
  if (person.institutionalStatus) return institutionalStatusLabels[person.institutionalStatus];
  return person.currentRelationsCount > 0 ? institutionalStatusLabels.CURRENT : 'Clasificación institucional no disponible';
}

export function OrganizationPersonForm({ identity, organizationId, saved, cancel }: {
  identity: AuthIdentity;
  organizationId: string;
  saved: (person: Person) => void;
  cancel: () => void;
}) {
  const [searchName, setSearchName] = useState('');
  const [searchPage, setSearchPage] = useState(1);
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const submitLock = useRef(false);
  const form = useForm<OrganizationPersonContextFormValues>({
    resolver: zodResolver(organizationPersonContextFormSchema),
    defaultValues: {
      personMode: 'new', person: { displayName: '', givenNames: '', familyNames: '' }, personId: '',
      positionTitle: '', area: '', isCurrent: true, startDate: '', endDate: '', sourceDescription: '', sourceUrl: '', notes: '',
    },
  });
  const mode = useWatch({ control: form.control, name: 'personMode' });
  const peoplePath = `people?page=${searchPage}&pageSize=10&status=all&institutionalStatus=all&name=${encodeURIComponent(searchName)}`;
  const candidates = usePeople(identity, peoplePath, mode === 'existing');
  const currentRelations = usePersonRelations(identity,
    selectedPerson ? `people/${selectedPerson.id}/relations?status=current&page=1&pageSize=100` : 'people/_context-picker/relations?status=current',
    mode === 'existing' && !!selectedPerson);
  const mutation = useDirectoryMutation(identity);
  const currentOrganizationRelation = currentRelations.data?.items.find(relation => relation.organizationId === organizationId && relation.isCurrent);

  function selectMode(nextMode: 'new' | 'existing') {
    form.setValue('personMode', nextMode, { shouldValidate: true });
    setSelectedPerson(null);
    mutation.reset();
  }

  function selectPerson(person: Person) {
    if (!person.isActive || person.duplicateOfId) return;
    setSelectedPerson(person);
    form.setValue('personId', person.id, { shouldValidate: true });
    mutation.reset();
  }

  async function submit(values: OrganizationPersonContextFormValues) {
    if (submitLock.current || (values.personMode === 'existing' && (!selectedPerson || currentRelations.isPending || currentRelations.isError))) return;
    submitLock.current = true;
    const { personMode, personId, person, ...episode } = values;
    const body = {
      personMode,
      ...(personMode === 'new' ? { person } : { personId }),
      ...episode,
      startDate: episode.startDate || null,
      endDate: episode.endDate || null,
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

  const cannotConfirmExistingLink = mode === 'existing' && !!selectedPerson && (currentRelations.isPending || currentRelations.isError);
  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    void form.handleSubmit(submit)(event);
  }

  return <form className="organization-person-form" onSubmit={handleFormSubmit} noValidate>
    <input type="hidden" {...form.register('personMode')} />
    <fieldset className="organization-person-mode">
      <legend>¿Cómo quieres añadir a la persona?</legend>
      <label><input type="radio" name="personModeChoice" value="new" checked={mode === 'new'} onChange={() => selectMode('new')} /> Registrar persona nueva</label>
      <label><input type="radio" name="personModeChoice" value="existing" checked={mode === 'existing'} onChange={() => selectMode('existing')} /> Seleccionar persona existente</label>
    </fieldset>

    {mode === 'new' ? <fieldset className="organization-person-identity">
      <legend>Datos de la persona</legend>
      <Field label="Nombre de presentación" error={form.formState.errors.person?.displayName?.message}>
        <input className={inputClass} maxLength={250} {...form.register('person.displayName')} />
      </Field>
      <Field label="Nombres (opcional)" error={form.formState.errors.person?.givenNames?.message}>
        <input className={inputClass} maxLength={150} {...form.register('person.givenNames')} />
      </Field>
      <Field label="Apellidos (opcional)" error={form.formState.errors.person?.familyNames?.message}>
        <input className={inputClass} maxLength={150} {...form.register('person.familyNames')} />
      </Field>
    </fieldset> : <section className="organization-person-picker" aria-label="Buscar una persona existente">
      <input type="hidden" {...form.register('personId')} />
      {identity.permissions.includes('directory.read') ? <>
        <Field label="Buscar persona por nombre">
          <input className={inputClass} value={searchName} onChange={event => { setSearchName(event.target.value); setSearchPage(1); }} />
        </Field>
        <QueryState pending={candidates.isPending} error={candidates.isError} failure={candidates.error} retry={candidates.refetch} />
        {candidates.data?.items.length ? <ul className="organization-person-candidates">
          {candidates.data.items.map(person => {
            const unavailable = !person.isActive || !!person.duplicateOfId;
            return <li key={person.id}>
              <label className={selectedPerson?.id === person.id ? 'organization-person-candidate is-selected' : 'organization-person-candidate'}>
                <input type="radio" name="selectedExistingPerson" value={person.id} checked={selectedPerson?.id === person.id}
                  disabled={unavailable} onChange={() => selectPerson(person)} />
                <span className="organization-person-candidate-copy">
                  <strong>{person.displayName}</strong>
                  <span>{[person.givenNames, person.familyNames].filter(Boolean).join(' ') || 'Nombres y apellidos no registrados'}</span>
                  <span>{person.isActive ? 'Ficha activa' : 'Ficha inactiva'} · {person.currentRelationsCount} vínculos vigentes</span>
                  <span>{institutionalStatusLabel(person)}</span>
                  {person.duplicateOf && <span>Ficha consolidada con <Link to={'/people/' + person.duplicateOf.id}>{person.duplicateOf.displayName}</Link>.</span>}
                  {!person.isActive && <span>La ficha está inactiva. Debe reactivarse antes de añadir un nuevo vínculo institucional.</span>}
                </span>
              </label>
              {!person.isActive && identity.permissions.includes('directory.read') &&
                <Link className="mt-2 inline-block underline" to={'/people/' + person.id} target="_blank" rel="noreferrer">Consultar ficha personal</Link>}
            </li>;
          })}
        </ul> : candidates.data && <p>No hay personas que coincidan. Prueba con otro nombre.</p>}
        {candidates.data && candidates.data.total > 0 && <Pagination page={searchPage} total={candidates.data.total} pageSize={10} onPage={setSearchPage} />}
        {form.formState.errors.personId?.message && <p role="alert">{form.formState.errors.personId.message}</p>}
      </> : <p role="alert">No tienes permiso para buscar personas existentes. Puedes registrar una persona nueva si tienes permiso de escritura.</p>}

      {selectedPerson && <div className="organization-person-selected">
        <p>Persona seleccionada: <strong>{selectedPerson.displayName}</strong></p>
        <button type="button" className={buttonClass} onClick={() => { setSelectedPerson(null); form.setValue('personId', '', { shouldValidate: true }); }}>
          Cambiar persona
        </button>
        <QueryState pending={currentRelations.isPending} error={currentRelations.isError} failure={currentRelations.error} retry={currentRelations.refetch} />
        {currentRelations.isSuccess && currentOrganizationRelation && <p className="organization-person-existing-link" role="status">
          Ya tiene un vínculo vigente con esta organización{currentOrganizationRelation.positionTitle ? ` como ${currentOrganizationRelation.positionTitle}` : ''}.
          Puedes continuar si registrarás otro episodio válido.
        </p>}
        {currentRelations.isSuccess && !currentOrganizationRelation && <p role="status">No tiene un vínculo vigente con esta organización.</p>}
      </div>}
    </section>}

    {(form.formState.errors.positionTitle || form.formState.errors.area || form.formState.errors.startDate || form.formState.errors.endDate ||
      form.formState.errors.sourceDescription || form.formState.errors.sourceUrl || form.formState.errors.notes) && <p role="alert">Revisa los datos del episodio señalados en el formulario.</p>}
    {mode !== null && <fieldset className="organization-person-episode">
      <legend>Vínculo con esta organización</legend>
      <p>Organización: <strong>esta ficha institucional</strong></p>
      <Field label="Cargo institucional (opcional)" error={form.formState.errors.positionTitle?.message}>
        <input className={inputClass} maxLength={250} {...form.register('positionTitle')} />
      </Field>
      <Field label="Área o función (opcional)" error={form.formState.errors.area?.message}>
        <input className={inputClass} maxLength={250} {...form.register('area')} />
      </Field>
      <label className="organization-person-current"><input type="checkbox" {...form.register('isCurrent')} /> El vínculo está vigente</label>
      <Field label="Fecha inicial (opcional)" error={form.formState.errors.startDate?.message}>
        <input type="date" className={inputClass} {...form.register('startDate')} />
      </Field>
      <Field label="Fecha final (opcional)" error={form.formState.errors.endDate?.message}>
        <input type="date" className={inputClass} {...form.register('endDate')} />
      </Field>
      <p>Deja vacías las fechas que no conoces. Un vínculo vigente no puede tener fecha final.</p>
      <Field label="Fuente de información (opcional)" error={form.formState.errors.sourceDescription?.message}>
        <input className={inputClass} maxLength={1000} {...form.register('sourceDescription')} />
      </Field>
      <Field label="URL de fuente (opcional)" error={form.formState.errors.sourceUrl?.message}>
        <input className={inputClass} maxLength={2048} {...form.register('sourceUrl')} />
      </Field>
      <Field label="Observaciones (opcional)" error={form.formState.errors.notes?.message}>
        <textarea className={inputClass} maxLength={5000} {...form.register('notes')} />
      </Field>
    </fieldset>}

    <MutationError error={mutation.error} />
    {mutation.error instanceof ApiError && mutation.error.code === 'PERSON_INACTIVE' && selectedPerson &&
      <p><Link className="underline" to={'/people/' + selectedPerson.id} target="_blank" rel="noreferrer">Consultar ficha personal para reactivarla explícitamente</Link></p>}
    <div className="organization-person-actions">
      <button className={buttonClass} disabled={mutation.isPending || form.formState.isSubmitting || cannotConfirmExistingLink || (mode === 'existing' && !selectedPerson)}>
        {mutation.isPending ? 'Guardando…' : mode === 'existing' ? 'Vincular persona' : 'Registrar persona y vincular'}
      </button>
      <button type="button" className={buttonClass} disabled={mutation.isPending} onClick={cancel}>Cancelar</button>
    </div>
  </form>;
}
