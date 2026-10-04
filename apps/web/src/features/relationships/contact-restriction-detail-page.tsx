import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { Link, useParams } from 'react-router';
import { useSession, type AuthIdentity } from '../auth/session';
import { buttonClass, Field, inputClass, MutationError, QueryState } from '../directory/directory-ui';
import { restrictionReasonSchema } from './restriction-contracts';
import { restrictionIdentityKey, useRestriction, useRestrictionMutation } from './restriction-queries';
import { RestrictionContext } from './contact-restrictions-page';
export function ContactRestrictionDetailPage() {
  const identity = useSession().data, { id = '' } = useParams();
  if (!identity?.permissions.includes('relationships.restriction.read')) return <p role="alert">No tienes permiso para consultar restricciones.</p>;
  return <RestrictionDetail key={restrictionIdentityKey(identity).join(':') + ':' + id} identity={identity} id={id} />;
}
function RestrictionDetail({ identity, id }: { identity: AuthIdentity; id: string }) {
  const detail = useRestriction(identity, id), mutation = useRestrictionMutation(identity);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const form = useForm<z.infer<typeof restrictionReasonSchema>>({ resolver: zodResolver(restrictionReasonSchema), defaultValues: { reason: '' } });
  const row = detail.data, canLift = row?.state === 'ACTIVE' && row.canLift && identity.permissions.includes('relationships.restriction.lift');
  return <section className="space-y-4"><h1 className="text-2xl font-semibold">Restricción de no contacto</h1><Link className={buttonClass} to="/contact-restrictions">Volver al listado</Link>
    <QueryState pending={detail.isPending} error={detail.isError} retry={detail.refetch} />
    {row && <>{row.state === 'ACTIVE' && <p role="alert" className="font-bold text-red-900">RESTRICCIÓN ACTIVA — NO CONTACTAR</p>}
      <p className="whitespace-pre-wrap break-words">{row.reason}</p><RestrictionContext restriction={row} />
      {canLift && <form className="space-y-3" onSubmit={form.handleSubmit(values => setConfirmation(values.reason))}>
        <Field label="Motivo de levantamiento" error={form.formState.errors.reason?.message}><textarea className={inputClass} rows={4} maxLength={5000} {...form.register('reason', { onChange: () => setConfirmation(null) })} /></Field>
        <button className={buttonClass} disabled={mutation.isPending || !!mutation.error}>Levantar restricción</button></form>}
      {canLift && confirmation && <section aria-label="Confirmar levantamiento" className="space-y-3 rounded border p-3"><p>¿Levantar esta restricción? Se conservará su historial y podrán iniciarse nuevos acercamientos.</p><p className="whitespace-pre-wrap break-words">{confirmation}</p>
        <button className={buttonClass} disabled={mutation.isPending || !!mutation.error} onClick={() => { void mutation.mutateAsync({ path: 'contact-restrictions/' + id + '/lift', body: { reason: confirmation, expectedVersion: row.version } }).then(() => { setConfirmation(null); form.reset(); }).catch(() => undefined); }}>Confirmar levantamiento</button>{' '}
        <button className={buttonClass} disabled={mutation.isPending} onClick={() => setConfirmation(null)}>Volver sin levantar</button></section>}
      <MutationError error={mutation.error} />
      {mutation.error && <button className={buttonClass} onClick={() => { void detail.refetch().then(result => { if (!result.isError) { mutation.reset(); setConfirmation(null); } }); }}>Recargar restricción y revisar estado</button>}
      {mutation.isSuccess && <p role="status">Restricción levantada. Su historial permanece disponible.</p>}
    </>}
  </section>;
}
