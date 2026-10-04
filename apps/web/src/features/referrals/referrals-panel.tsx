import { useState } from 'react';
import { Link } from 'react-router';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { AuthIdentity } from '../auth/session';
import type { Communication } from '../communications/contracts';
import { DirectoryTargetPicker, type PickedDirectoryTarget } from '../directory/target-picker';
import { useContactAssociations } from '../directory/contacts.queries';
import { buttonClass, Field, inputClass, MutationError, Pagination, QueryState } from '../directory/directory-ui';
import { mediumLabels, mediumTypes, referralBody, referralFormSchema, type Referral, type ReferralForm } from './contracts';
import { useCreateReferral, useReferrals } from './queries';
export function ReferralContent({ row }: { row: Referral }) {
  return <div className="min-w-0 space-y-2 break-words">
    <p>Registrado por {row.createdBy.displayName}{!row.createdBy.isActive && ' (cuenta inactiva)'} · {new Date(row.createdAt).toLocaleString('es-BO')}</p>
    {row.recommendedName && <p>Nombre mencionado: {row.recommendedName}</p>}
    {row.recommendedRole && <p>Cargo o función mencionada: {row.recommendedRole}</p>}
    {row.organizationNameSnapshot && <p>Organización mencionada: {row.organizationNameSnapshot}</p>}
    {row.mediumType && <p>{mediumLabels[row.mediumType]} recomendado: {row.mediumValue}</p>}
    {row.notes && <p className="whitespace-pre-wrap">Observación: {row.notes}</p>}
    <div className="flex flex-wrap gap-3">
      {row.person && <Link className={buttonClass} to={'/people/' + row.person.currentId}>Ficha de persona: {row.person.label}{!row.person.isActive && ' (inactiva)'}{row.person.currentId !== row.person.id && ' (consolidada)'}</Link>}
      {row.organization && <Link className={buttonClass} to={'/organizations/' + row.organization.currentId}>Ficha de organización: {row.organization.label}{!row.organization.isActive && ' (inactiva)'}{row.organization.currentId !== row.organization.id && ' (consolidada)'}</Link>}
      {row.contactMethod && <Link className={buttonClass} to={'/contact-methods/' + row.contactMethod.id}>Ficha del medio{row.contactMethod.condition === 'UNUSABLE' && ' (no utilizable actualmente)'}</Link>}
    </div>
    <p>Origen: {row.source.subject}{row.source.validity === 'INVALIDATED' && ' · Comunicación invalidada posteriormente'}</p>
    <p className="text-sm">Los datos mencionados conservan la recomendación original; las fichas vinculadas muestran el Directorio actual.</p>
  </div>;
}
const emptyForm: ReferralForm = { recommendedName: '', recommendedRole: '', organizationNameSnapshot: '', mediumType: '', mediumValue: '', notes: '', personId: null, organizationId: null, contactMethodId: null };
function ReferralFormView({ identity, row, close }: { identity: AuthIdentity; row: Communication; close: () => void }) {
  const form = useForm<ReferralForm>({ resolver: zodResolver(referralFormSchema), defaultValues: emptyForm });
  const linkedContactId = useWatch({ control: form.control, name: 'contactMethodId' });
  const mutation = useCreateReferral(identity, row.id), [person, setPerson] = useState<PickedDirectoryTarget | null>(null), [organization, setOrganization] = useState<PickedDirectoryTarget | null>(null);
  const [attempt, setAttempt] = useState<{ body: string; key: string } | null>(null), [contactPage, setContactPage] = useState(1);
  const contactsPath = person ? 'people/' + person.id : organization ? 'organizations/' + organization.id : null;
  const contacts = useContactAssociations(identity, contactsPath ? contactsPath + '/contacts?page=' + contactPage : undefined);
  return <form aria-label="Registrar contacto recomendado" className="min-w-0 space-y-4 rounded border p-4" onSubmit={form.handleSubmit(async values => {
    if (mutation.isPending) return;
    const body = referralBody(values), serialized = JSON.stringify(body), next = attempt?.body === serialized ? attempt : { body: serialized, key: crypto.randomUUID() };
    setAttempt(next);
    try { await mutation.mutateAsync({ body, key: next.key }); close(); } catch { /* Conserva datos y clave para reintentar el mismo comando. */ }
  })}>
    <h3 className="font-semibold">Registrar contacto recomendado</h3>
    <p>Registra únicamente lo mencionado en esta comunicación. Puedes conservar una recomendación incompleta sin crear una persona.</p>
    <fieldset disabled={mutation.isPending} className="min-w-0 space-y-4"><legend className="font-semibold">Datos históricos mencionados</legend>
      {([['recommendedName', 'Nombre recomendado'], ['recommendedRole', 'Cargo o función mencionada'], ['organizationNameSnapshot', 'Organización mencionada']] as const).map(([name, label]) =>
        <Field key={name} label={label} error={form.formState.errors[name]?.message}><input aria-label={label} className={inputClass} maxLength={300} {...form.register(name)} /></Field>)}
      <Field label="Tipo de medio recomendado"><select className={inputClass} {...form.register('mediumType')} onChange={event => { void form.register('mediumType').onChange(event); form.setValue('contactMethodId', null); }}><option value="">Sin medio mencionado</option>{mediumTypes.map(type => <option key={type} value={type}>{mediumLabels[type]}</option>)}</select></Field>
      <Field label="Valor del medio recomendado" error={form.formState.errors.mediumValue?.message}><input aria-label="Valor del medio recomendado" className={inputClass} maxLength={2048} {...form.register('mediumValue')} onChange={event => { void form.register('mediumValue').onChange(event); form.setValue('contactMethodId', null); }} /></Field>
      <Field label="Observación" error={form.formState.errors.notes?.message}><textarea aria-label="Observación" className={inputClass} maxLength={5000} {...form.register('notes')} /></Field>
    </fieldset>
    <fieldset disabled={mutation.isPending} className="min-w-0 space-y-4"><legend className="font-semibold">Fichas existentes opcionales</legend>
      <DirectoryTargetPicker identity={identity} referralKind="PERSON" selected={person} onSelect={target => { setPerson(target); form.setValue('personId', target?.id ?? null); form.setValue('contactMethodId', null); setContactPage(1); }} />
      <DirectoryTargetPicker identity={identity} referralKind="ORGANIZATION" selected={organization} onSelect={target => { setOrganization(target); form.setValue('organizationId', target?.id ?? null); form.setValue('contactMethodId', null); setContactPage(1); }} />
      <p>Si necesitas crear una ficha, usa el flujo normal del Directorio y luego selecciónala aquí.</p>
      {contactsPath && <section aria-label="Vincular medio existente" className="space-y-2"><p>Selecciona un medio de la ficha solo si fue el recomendado. Su valor se copiará al dato histórico.</p>
        <QueryState pending={contacts.isPending} error={contacts.isError} retry={contacts.refetch} />
        {contacts.data?.items.filter(item => item.isActive && item.contactMethod.condition === 'USABLE').map(item => <button type="button" className={buttonClass} key={item.id} onClick={() => { form.setValue('contactMethodId', item.contactMethod.id); form.setValue('mediumType', item.contactMethod.type); form.setValue('mediumValue', item.contactMethod.value); }}>Usar medio mencionado: {item.contactMethod.value}</button>)}
        {linkedContactId && <p>Medio vinculado. <button type="button" className={buttonClass} onClick={() => form.setValue('contactMethodId', null)}>Quitar vínculo del medio</button></p>}
        {contacts.data && <Pagination page={contactPage} total={contacts.data.total} onPage={setContactPage} />}
      </section>}
    </fieldset>
    <div className="flex flex-wrap gap-2"><button className={buttonClass} disabled={mutation.isPending}>{mutation.isPending ? 'Registrando…' : 'Guardar contacto recomendado'}</button><button type="button" className={buttonClass} disabled={mutation.isPending} onClick={close}>Cancelar</button></div>
    <MutationError error={mutation.error} />
  </form>;
}
export function ReferralsPanel({ identity, row }: { identity: AuthIdentity; row: Communication }) {
  const [page, setPage] = useState(1), [creating, setCreating] = useState(false), query = useReferrals(identity, row.id, page);
  const canCreate = row.validity === 'VALID' && identity.permissions.includes('referrals.create');
  return <section aria-label="Contactos recomendados" className="min-w-0 space-y-3"><h2 className="text-xl font-semibold">Contactos recomendados</h2>
    <QueryState pending={query.isPending} error={query.isError} retry={query.refetch} />
    {query.data?.total === 0 && <p>Sin contactos recomendados registrados en esta comunicación.</p>}
    <ol className="space-y-3">{query.data?.items.map(item => <li key={item.id} className="min-w-0 rounded border border-violet-500 p-3"><ReferralContent row={item} /></li>)}</ol>
    {query.data && <Pagination page={page} total={query.data.total} pageSize={query.data.pageSize} onPage={setPage} />}
    {row.validity === 'INVALIDATED' && <p>La comunicación está invalidada. Se conservan sus recomendaciones anteriores.</p>}
    {canCreate && !creating && <button className={buttonClass} onClick={() => setCreating(true)}>Registrar contacto recomendado</button>}
    {canCreate && creating && <ReferralFormView identity={identity} row={row} close={() => { setCreating(false); setPage(1); }} />}
  </section>;
}
