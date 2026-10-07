import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { apiRequest } from '../../lib/api/client';
import type { AuthIdentity } from '../auth/session';
import { useDirectoryMutation } from './queries';
import { dateLabel } from './date-label';
import { buttonClass, Field, inputClass, MutationError, Pagination, QueryState } from './directory-ui';
import { verificationConditionSchema, verificationFormSchema, verificationHistorySchema, verificationLabels, type VerificationCondition } from './verification.contracts';
import { StatusBadge } from '../../components/ui/feedback';
import { Button } from '../../components/ui/actions';
import { FormField, Input } from '../../components/ui/forms';

function VerificationForm({ identity, path, label, initial, done, modern = false }: { identity: AuthIdentity; path: string; label: string; initial: VerificationCondition; done: () => void; modern?: boolean }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [reloadFailed, setReloadFailed] = useState(false);
  const client = useQueryClient();
  const form = useForm({ resolver: zodResolver(verificationFormSchema), defaultValues: { sourceDescription: '', sourceUrl: '', confirmed: false } });
  const mutation = useDirectoryMutation(identity);
  const Control = modern ? Button : 'button';
  return <form className="space-y-3 rounded border p-3" aria-label={'Corroborar ' + label} onSubmit={form.handleSubmit(async values => {
    try { await mutation.mutateAsync({ path: path + '/verify', method: 'POST', body: { expectedVersion: snapshot.version,
      ...(snapshot.contactValueVersion !== null ? { expectedContactValueVersion: snapshot.contactValueVersion } : {}),
      sourceDescription: values.sourceDescription || null, sourceUrl: values.sourceUrl || null } }); done(); } catch { /* El error visible conserva la evidencia. */ }
  })}>
    <p>Está corroborando únicamente: <strong>{label}</strong>.</p>
    {modern ? <>
      <FormField label="Fuente de corroboración (opcional)" error={form.formState.errors.sourceDescription?.message}>{control => <Input {...form.register('sourceDescription')} {...control} />}</FormField>
      <FormField label="URL de corroboración (opcional)" error={form.formState.errors.sourceUrl?.message}>{control => <Input {...form.register('sourceUrl')} {...control} />}</FormField>
    </> : <>
      <Field label="Fuente de corroboración (opcional)" error={form.formState.errors.sourceDescription?.message}><input className={inputClass} {...form.register('sourceDescription')} /></Field>
      <Field label="URL de corroboración (opcional)" error={form.formState.errors.sourceUrl?.message}><input className={inputClass} {...form.register('sourceUrl')} /></Field>
    </>}
    <label className="flex min-h-11 items-center gap-2"><input type="checkbox" {...form.register('confirmed')} />He corroborado la información de este objeto.</label>
    {form.formState.errors.confirmed && <p role="alert">{form.formState.errors.confirmed.message}</p>}
    <MutationError modern={modern} error={mutation.error} reload={async () => {
      try {
        await client.invalidateQueries({ queryKey: ['directory', identity.id] }, { throwOnError: true });
        const fresh = verificationConditionSchema.parse(await apiRequest(path + '/verification'));
        setSnapshot(fresh); form.reset(); mutation.reset(); setReloadFailed(false);
      } catch { setReloadFailed(true); }
    }} />
    {reloadFailed && <p role="alert">No se pudo recargar la información. Reintente antes de corroborar.</p>}
    <div className="flex flex-wrap gap-3"><Control type="submit" className={modern ? undefined : buttonClass} disabled={mutation.isPending}>Confirmar verificación</Control>
      <Control type="button" className={modern ? undefined : buttonClass} disabled={mutation.isPending} onClick={done}>Cancelar verificación</Control></div>
  </form>;
}
export function VerificationPanel({ identity, path, label, contact = false, readOnly = false, modern = false, headingLevel = 2 }: { identity: AuthIdentity; path: string; label: string; contact?: boolean; readOnly?: boolean; modern?: boolean; headingLevel?: 2 | 3 }) {
  const [formSnapshot, setFormSnapshot] = useState<VerificationCondition | null>(null), [historyOpen, setHistoryOpen] = useState(false), [page, setPage] = useState(1);
  const condition = useQuery({ queryKey: ['directory', identity.id, 'verification', path], enabled: identity.permissions.includes('directory.read'), retry: false,
    queryFn: async ({ signal }) => verificationConditionSchema.parse(await apiRequest(path + '/verification', { signal })) });
  const history = useQuery({ queryKey: ['directory', identity.id, 'verifications', path, page], enabled: historyOpen && identity.permissions.includes('directory.history.read'), retry: false,
    queryFn: async ({ signal }) => verificationHistorySchema.parse(await apiRequest(path + '/verifications?page=' + page, { signal })) });
  const canVerify = !readOnly && identity.permissions.includes('directory.verify');
  const Heading = headingLevel === 3 ? 'h3' : 'h2';
  const HistoryHeading = headingLevel === 3 ? 'h4' : 'h3';
  const Control = modern ? Button : 'button';
  return <section className="min-w-0 space-y-3 break-words" aria-label={'Verificación de ' + label}>
    <Heading className={modern?'directory-verification-heading':'text-xl font-semibold'}>Verificación de información</Heading>
    <QueryState pending={condition.isPending} error={condition.isError} retry={condition.refetch} />
    {condition.data && <>
      <p className="font-semibold">{modern ? <StatusBadge tone={condition.data.verificationStatus === 'CURRENT' ? 'success' : condition.data.verificationStatus === 'REVIEW_DUE' ? 'warning' : 'neutral'}>{verificationLabels[condition.data.verificationStatus]}</StatusBadge> : verificationLabels[condition.data.verificationStatus]}</p>
      <p>Última verificación: {condition.data.lastVerifiedAt ? dateLabel(condition.data.lastVerifiedAt) : 'Sin verificación registrada'}</p>
      {condition.data.lastVerifiedBy && <p>Verificó: {condition.data.lastVerifiedBy.givenNames} {condition.data.lastVerifiedBy.familyNames}{!condition.data.lastVerifiedBy.isActive && ' · Usuario actualmente desactivado'}</p>}
      <p>Próxima revisión: {condition.data.nextReviewAt ? dateLabel(condition.data.nextReviewAt) : 'Sin fecha hasta la primera verificación'} · Intervalo: {condition.data.intervalMonths} meses calendario.</p>
      {condition.data.changedSinceVerification && <p>Hubo cambios posteriores a la verificación. Corrobore nuevamente la información.</p>}
      {condition.data.timeReviewDue && <p>Venció el intervalo de revisión desde la última verificación.</p>}
      {contact && <p>La corroboración corresponde solo a este actor y canal. No verifica otras asociaciones del medio compartido ni cambia su condición global.</p>}
      <p>Verificar no modifica ni reactiva la ficha, el vínculo o la asociación.</p>
      {canVerify && !formSnapshot && <Control type="button" className={modern ? 'directory-verify-action' : buttonClass} onClick={() => setFormSnapshot(condition.data)}>Marcar verificado: {label}</Control>}
      {canVerify && formSnapshot && <VerificationForm modern={modern} identity={identity} path={path} label={label} initial={formSnapshot} done={() => setFormSnapshot(null)} />}
    </>}
    {identity.permissions.includes('directory.history.read') && <Control type="button" aria-expanded={modern?historyOpen:undefined} className={modern ? 'directory-verification-history' : buttonClass} onClick={() => setHistoryOpen(!historyOpen)}>{historyOpen ? 'Ocultar' : 'Ver'} historial de verificaciones: {label}</Control>}
    {historyOpen && identity.permissions.includes('directory.history.read') && <div className="space-y-3">
      <HistoryHeading className="font-semibold">Historial de verificaciones</HistoryHeading><QueryState pending={history.isPending} error={history.isError} retry={history.refetch} />
      {history.data?.total === 0 && <p>Aún no hay corroboraciones registradas.</p>}
      <ol className="space-y-3">{history.data?.items.map(event => <li key={event.id} className="min-w-0 rounded border p-3 break-words">
        <p>{dateLabel(event.verifiedAt)} · {event.actor.givenNames} {event.actor.familyNames}{!event.actor.isActive && ' · Usuario actualmente desactivado'}</p>
        <p>Fuente: {event.sourceDescription ?? 'Sin evidencia textual registrada'}</p>
        {event.sourceUrl && <p>URL: <a className="underline" href={event.sourceUrl} target="_blank" rel="noreferrer">{event.sourceUrl}</a></p>}
      </li>)}</ol>
      {history.data && <Pagination page={page} total={history.data.total} onPage={setPage} />}
    </div>}
  </section>;
}
