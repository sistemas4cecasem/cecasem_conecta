import { ActionLink, Button } from '../../components/ui/actions';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { useParams } from 'react-router';
import { useSession, type AuthIdentity } from '../auth/session';
import { buttonClass, Field, inputClass, MutationError, QueryState } from '../directory/directory-ui';
import { restrictionReasonSchema } from './restriction-contracts';
import { restrictionIdentityKey, useRestriction, useRestrictionMutation } from './restriction-queries';
import { RestrictionContext } from './contact-restrictions-page';
import { PageHeader, Surface } from '../../components/ui/layout';
import { Alert, ConfirmationPanel } from '../../components/ui/feedback';
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
  return <section className="ui-detail-page"><PageHeader eyebrow="Relaciones / Restricciones" title="Restricción de no contacto" back={<ActionLink appearance="back" to="/contact-restrictions">Volver al listado</ActionLink>} />
    <QueryState pending={detail.isPending} error={detail.isError} retry={detail.refetch} />
    {row && <>{row.state === 'ACTIVE' && <Alert role="alert" tone="danger" title="RESTRICCIÓN ACTIVA — NO CONTACTAR" />}
      <Surface heading="Motivo y contexto"><p className="whitespace-pre-wrap break-words">{row.reason}</p><RestrictionContext restriction={row} /></Surface>
      {canLift && <form className="ui-editor-form" onSubmit={form.handleSubmit(values => setConfirmation(values.reason))}>
        <Field label="Motivo de levantamiento" error={form.formState.errors.reason?.message}><textarea className={inputClass} rows={4} maxLength={5000} {...form.register('reason', { onChange: () => setConfirmation(null) })} /></Field>
        <Button type="submit" variant="danger" disabled={mutation.isPending || !!mutation.error}>Levantar restricción</Button></form>}
      {canLift && confirmation && <ConfirmationPanel tone="danger" aria-label="Confirmar levantamiento" title="Confirmar levantamiento"><p>¿Levantar esta restricción? Se conservará su historial y podrán iniciarse nuevos acercamientos.</p><p className="whitespace-pre-wrap break-words">{confirmation}</p>
        <Button variant="danger" pending={mutation.isPending} disabled={mutation.isPending || !!mutation.error} onClick={() => { void mutation.mutateAsync({ path: 'contact-restrictions/' + id + '/lift', body: { reason: confirmation, expectedVersion: row.version } }).then(() => { setConfirmation(null); form.reset(); }).catch(() => undefined); }}>Confirmar levantamiento</Button>{' '}
        <button className={buttonClass} disabled={mutation.isPending} onClick={() => setConfirmation(null)}>Volver sin levantar</button></ConfirmationPanel>}
      <MutationError error={mutation.error} />
      {mutation.error && <button className={buttonClass} onClick={() => { void detail.refetch().then(result => { if (!result.isError) { mutation.reset(); setConfirmation(null); } }); }}>Recargar restricción y revisar estado</button>}
      {mutation.isSuccess && <p role="status">Restricción levantada. Su historial permanece disponible.</p>}
    </>}
  </section>;
}
