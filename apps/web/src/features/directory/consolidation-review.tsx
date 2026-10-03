import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import type { AuthIdentity } from '../auth/session';
import { apiRequest } from '../../lib/api/client';
import { useDirectoryMutation } from './queries';
import { buttonClass, inputClass, MutationError, QueryState } from './directory-ui';
import { dateLabel } from './date-label';
import { consolidationPreviewSchema, duplicateActorLabel, type ConsolidationPreview, type DuplicateCandidate } from './duplicates.contracts';

function ActorPreview({ row, title }: { row: ConsolidationPreview['principal']; title: string }) {
  return <section className="min-w-0 space-y-3 rounded border bg-white p-3"><h4 className="font-semibold">{title}: {row.label}</h4>
    <dl className="space-y-2"><div><dt className="font-semibold">Estado</dt><dd>{row.isActive ? 'Activa' : 'Inactiva'}</dd></div>
      {row.displayName ? <><div><dt className="font-semibold">Nombres</dt><dd>{row.givenNames ?? 'Sin dato'}</dd></div>
        <div><dt className="font-semibold">Apellidos</dt><dd>{row.familyNames ?? 'Sin dato'}</dd></div></> : <>
        <div><dt className="font-semibold">País / sigla / sitio</dt><dd>{row.country ?? 'Sin dato'} · {row.alias ?? 'Sin dato'} · {row.officialWebsite ?? 'Sin dato'}</dd></div>
        <div><dt className="font-semibold">Matriz / sedes</dt><dd>{row.parent?.name ?? 'Sin matriz'} · {row.children?.map(item => item.name).join(', ') || 'Sin sedes'}</dd></div>
        <div><dt className="font-semibold">Categorías</dt><dd>{row.categories?.map(item => item.category.name).join(', ') || 'Sin categorías'}</dd></div></>}
      <div><dt className="font-semibold">Verificación propia</dt><dd>{row.verifications.length ? row.verifications.map(event =>
        <p key={event.id}>{dateLabel(event.verifiedAt)} · {event.actor.givenNames} {event.actor.familyNames} · Versión corroborada {event.objectVersion}.
          {event.objectVersion !== row.version && ' Revisión pendiente por cambios.'}</p>) : 'Nunca verificado'}</dd></div></dl>
    <h5 className="font-semibold">Contactos y evidencias conservadas</h5><ul className="space-y-2">{row.contacts.map(item => <li key={item.id}>
      {item.contactMethod.value} · {item.isActive ? 'Asociación activa' : 'Asociación inactiva'} · {item.contactMethod.condition === 'USABLE' ? 'Utilizable' : 'No utilizable'}.
      <p>Fuente: {item.sourceDescription ?? 'Sin dato'} · {item.sourceUrl ?? 'Sin URL'}.</p><p>Observaciones: {item.notes ?? 'Sin dato'}.</p>
      <p>Verificación contextual: {dateLabel(item.lastVerifiedAt)}.</p></li>)}</ul>
    {!row.contacts.length && <p>Sin contactos.</p>}
    <h5 className="font-semibold">Personas y episodios institucionales</h5><ul className="space-y-2">{row.relations.map(item => <li key={item.id}>
      {item.person.displayName} · {item.organization.name} · {item.positionTitle ?? 'Sin cargo'} · {item.area ?? 'Sin área'}.
      <p>{item.isCurrent ? 'Vigente' : 'Histórico'} · {item.startDate?.slice(0, 10) ?? 'Fecha inicial desconocida'} → {item.endDate?.slice(0, 10) ?? (item.isCurrent ? 'Actualidad' : 'Fecha final desconocida')}.</p>
      <p>Fuente: {item.sourceDescription ?? 'Sin dato'} · {item.notes ?? 'Sin observaciones'}.</p>
      <p>Verificación propia: {dateLabel(item.lastVerifiedAt)}.</p></li>)}</ul>
    {!row.relations.length && <p>Sin vínculos.</p>}
  </section>;
}
interface Confirmation { confirmed: boolean; reconcileCurrentRelations: boolean; keepContext: boolean }
export function ConsolidationReview({ identity, candidate, completed }: { identity: AuthIdentity; candidate: DuplicateCandidate; completed: () => void }) {
  const [principalId, setPrincipalId] = useState('');
  const selection = useForm<{ principalId: string }>({ defaultValues: { principalId: '' } });
  const confirmation = useForm<Confirmation>({ defaultValues: { confirmed: false, reconcileCurrentRelations: false, keepContext: false } });
  const mutation = useDirectoryMutation(identity);
  const preview = useQuery({ queryKey: ['directory', identity.id, 'duplicate-preview', candidate.id, principalId, candidate.version],
    enabled: !!principalId && identity.permissions.includes('directory.duplicates.manage'), retry: false,
    queryFn: async ({ signal }) => consolidationPreviewSchema.parse(await apiRequest('duplicate-candidates/' + candidate.id + '/consolidation-preview?principalId=' + principalId, { signal })) });
  const row = preview.data;
  const confirm = confirmation.handleSubmit(async values => {
    if (!row || row.blockers.length) return;
    try {
      await mutation.mutateAsync({ path: 'duplicate-candidates/' + candidate.id + '/consolidate', method: 'POST', body: {
        principalId: row.principal.id, previewToken: row.previewToken, expectedCandidateVersion: row.candidate.version,
        expectedVersionA: row.candidate.examinedVersionA, expectedVersionB: row.candidate.examinedVersionB,
        confirmed: values.confirmed, reconcileCurrentRelations: values.reconcileCurrentRelations, contactConflictPolicy: 'KEEP_PRINCIPAL_CONTEXT',
      } }); completed();
    } catch { /* El error público se muestra y exige una revisión nueva. */ }
  });
  return <section className="space-y-4 rounded border border-amber-600 p-3" aria-label="Revisión administrativa de consolidación">
    <h3 className="text-lg font-semibold">Revisión administrativa de consolidación</h3>
    <form className="space-y-3" onSubmit={selection.handleSubmit(values => { setPrincipalId(values.principalId); confirmation.reset(); mutation.reset(); })}>
      <label className="block">Registro principal<select className={inputClass} {...selection.register('principalId', { required: 'Elige explícitamente un principal.' })}>
        <option value="">Selecciona el registro que permanecerá como principal</option><option value={candidate.a.id}>{duplicateActorLabel(candidate.a)}</option>
        <option value={candidate.b.id}>{duplicateActorLabel(candidate.b)}</option></select></label>
      {selection.formState.errors.principalId && <p role="alert">{selection.formState.errors.principalId.message}</p>}
      <button className={buttonClass} type="submit" disabled={preview.isFetching || mutation.isPending}>Obtener vista previa</button>
    </form>
    {principalId && <QueryState pending={preview.isPending} error={preview.isError} retry={preview.refetch} />}
    {row && <><div className="grid gap-3 lg:grid-cols-2"><ActorPreview row={row.principal} title="Principal" /><ActorPreview row={row.duplicate} title="Duplicado" /></div>
      <h4 className="font-semibold">Efectos que debes revisar</h4><ul className="list-inside list-disc space-y-2">{row.effects.map(effect => <li key={effect}>{effect}</li>)}</ul>
      <p>Categorías añadidas: {row.categories.map(item => item.name).join(', ') || 'Ninguna'}.</p>
      <ul className="space-y-2">{row.contacts.map(contact => <li key={contact.sourceId}>{contact.value}: {contact.outcome === 'CREATED' ? 'añadir asociación sin verificación' : 'reutilizar asociación existente'}.
        {contact.contextConflict && ' Conflicto de contexto: se conserva el del principal; el otro permanece como evidencia histórica.'}
        {contact.reactivate && ' Se reactivará la asociación del principal.'}</li>)}</ul>
      <ul>{row.relations.map(relation => <li key={relation.sourceId}>{relation.positionTitle ?? 'Vínculo sin cargo'}: {relation.outcome === 'CREATED'
        ? 'crear representación operativa trazada del episodio original, sin heredar su verificación' : 'reutilizar episodio equivalente'}.</li>)}</ul>
      {!!row.blockers.length && <p role="alert">No se puede consolidar esta selección: existe una matriz/sede, hijos o una cadena previa. Conserva estas fichas y revisa la jerarquía.</p>}
      <form className="space-y-3" onSubmit={confirm}>
        <label className="flex min-h-11 items-start gap-2"><input type="checkbox" {...confirmation.register('reconcileCurrentRelations', { required: true })} />Confirmo la reconciliación explícita de contactos activos y episodios vigentes descritos arriba.</label>
        <label className="flex min-h-11 items-start gap-2"><input type="checkbox" {...confirmation.register('keepContext', { required: true })} />Confirmo mantener el contexto del principal en conflictos y las reactivaciones indicadas, conservando la evidencia original.</label>
        <label className="flex min-h-11 items-start gap-2"><input type="checkbox" {...confirmation.register('confirmed', { required: true })} />Confirmo que ambas fichas representan al mismo actor, que el principal elegido es correcto y que revisé los efectos.</label>
        {Object.keys(confirmation.formState.errors).length > 0 && <p role="alert">Revisa y confirma los tres puntos antes de consolidar.</p>}
        <button className={buttonClass} type="submit" disabled={mutation.isPending || preview.isFetching || !!row.blockers.length}>{mutation.isPending ? 'Consolidando…' : 'Confirmar consolidación'}</button>
      </form></>}
    <MutationError error={mutation.error} reload={async () => { await preview.refetch(); confirmation.reset(); mutation.reset(); }} />
  </section>;
}
