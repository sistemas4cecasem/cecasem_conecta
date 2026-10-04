import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useSession, type AuthIdentity } from '../auth/session';
import { buttonClass, MutationError, QueryState } from '../directory/directory-ui';
import { IntentContext } from './contact-intents-page';
import { conversionIdentityMatches, intentIdentityKey, useIntent, useIntentConversion, useIntentMutation } from './queries';
import { useTargetRestriction } from './restriction-queries';
import { ContactRestrictionNotice } from './contact-restriction-notice';
export function ContactIntentDetailPage() {
  const identity = useSession().data, { id = '' } = useParams();
  if (!identity?.permissions.includes('relationships.intent.read')) return <p role="alert">No tienes permiso para consultar intenciones.</p>;
  return <IntentDetail key={intentIdentityKey(identity).join(':') + ':' + id} identity={identity} id={id} />;
}
function IntentDetail({ identity, id }: { identity: AuthIdentity; id: string }) {
  const detail = useIntent(identity, id), mutation = useIntentMutation(identity);
  const conversion = useIntentConversion(identity), navigate = useNavigate(), client = useQueryClient();
  const [confirm, setConfirm] = useState<'cancel' | 'convert' | null>(null);
  const intent = detail.data;
  const restriction = useTargetRestriction(identity, intent?.target ?? null);
  const allowed = !!intent?.canCancel && identity.permissions.includes('relationships.intent.cancel');
  const canConvert = intent?.state === 'ACTIVE' && intent.canConvert && identity.permissions.includes('relationships.intent.convert') && !restriction.data?.items.length;
  const pending = mutation.isPending || conversion.isPending, error = mutation.error ?? conversion.error;
  return <section className="space-y-4"><h1 className="text-2xl font-semibold">Intención de contacto</h1><Link className={buttonClass} to="/contact-intents">Volver al listado</Link>
    <QueryState pending={detail.isPending} error={detail.isError} retry={detail.refetch} />
    {intent && <><p className="whitespace-pre-wrap break-words">{intent.purpose}</p><IntentContext intent={intent} />
      <ContactRestrictionNotice restriction={restriction.data?.items[0]} />
      {intent.processId && identity.permissions.includes('relationships.process.read') && <Link className={buttonClass} to={'/relationship-processes/' + intent.processId}>Ver proceso de relación</Link>}
      {canConvert && !confirm && <button className={buttonClass} disabled={identity.permissions.includes('relationships.restriction.read') && restriction.isPending} onClick={() => setConfirm('convert')}>Convertir en proceso</button>}
      {canConvert && confirm === 'convert' && <section aria-label="Confirmar conversión" className="space-y-3 rounded border p-3">
        <p>Se creará un proceso en preparación con este propósito y objetivo. Tú serás su creador y participante inicial; se conservará la autoría de la intención.</p>
        <button className={buttonClass} disabled={pending || !!error} onClick={() => {
          void conversion.mutateAsync({ id, expectedVersion: intent.version }).then(result => {
            if (conversionIdentityMatches(client, identity)) navigate('/relationship-processes/' + result.process.id);
          }).catch(() => undefined);
        }}>Confirmar conversión</button>{' '}<button className={buttonClass} disabled={pending} onClick={() => setConfirm(null)}>Volver sin convertir</button></section>}
      {allowed && !confirm && <button className={buttonClass} onClick={() => setConfirm('cancel')}>Cancelar intención</button>}
      {allowed && confirm === 'cancel' && <section aria-label="Confirmar cancelación" className="space-y-3 rounded border p-3"><p>¿Cancelar esta intención? Se conservarán el propósito, el objetivo y su historial.</p>
        <button className={buttonClass} disabled={pending || !!error} onClick={() => {
          void mutation.mutateAsync({ path: 'contact-intents/' + id + '/cancel', body: { expectedVersion: intent.version } })
            .then(() => setConfirm(null)).catch(() => undefined);
        }}>Confirmar cancelación</button>{' '}<button className={buttonClass} disabled={pending} onClick={() => setConfirm(null)}>Volver sin cancelar</button></section>}
      {!allowed && intent.state === 'ACTIVE' && identity.permissions.includes('relationships.intent.cancel') && <p>Solo puedes cancelar intenciones propias, salvo los permisos de Directorio y Administración.</p>}
      <MutationError error={error} />
      {error && <button className={buttonClass} onClick={() => { void detail.refetch().then(result => { if (!result.isError) { mutation.reset(); conversion.reset(); setConfirm(null); } }); }}>Recargar intención y revisar estado</button>}
      {mutation.isSuccess && <p role="status">Intención cancelada.</p>}
    </>}
  </section>;
}
