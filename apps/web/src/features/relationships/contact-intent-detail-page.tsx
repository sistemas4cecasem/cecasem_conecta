import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useSession, type AuthIdentity } from '../auth/session';
import { buttonClass, MutationError, QueryState } from '../directory/directory-ui';
import { IntentContext } from './contact-intents-page';
import { intentIdentityKey, useIntent, useIntentMutation } from './queries';
export function ContactIntentDetailPage() {
  const identity = useSession().data, { id = '' } = useParams();
  if (!identity?.permissions.includes('relationships.intent.read')) return <p role="alert">No tienes permiso para consultar intenciones.</p>;
  return <IntentDetail key={intentIdentityKey(identity).join(':') + ':' + id} identity={identity} id={id} />;
}
function IntentDetail({ identity, id }: { identity: AuthIdentity; id: string }) {
  const detail = useIntent(identity, id), mutation = useIntentMutation(identity);
  const [confirm, setConfirm] = useState(false);
  const intent = detail.data;
  const allowed = !!intent?.canCancel && identity.permissions.includes('relationships.intent.cancel');
  return <section className="space-y-4"><h1 className="text-2xl font-semibold">Intención de contacto</h1><Link className={buttonClass} to="/contact-intents">Volver al listado</Link>
    <QueryState pending={detail.isPending} error={detail.isError} retry={detail.refetch} />
    {intent && <><p className="whitespace-pre-wrap break-words">{intent.purpose}</p><IntentContext intent={intent} />
      {allowed && !confirm && <button className={buttonClass} onClick={() => setConfirm(true)}>Cancelar intención</button>}
      {allowed && confirm && <section aria-label="Confirmar cancelación" className="space-y-3 rounded border p-3"><p>¿Cancelar esta intención? Se conservarán el propósito, el objetivo y su historial.</p>
        <button className={buttonClass} disabled={mutation.isPending || !!mutation.error} onClick={() => {
          void mutation.mutateAsync({ path: 'contact-intents/' + id + '/cancel', body: { expectedVersion: intent.version } })
            .then(() => setConfirm(false)).catch(() => undefined);
        }}>Confirmar cancelación</button>{' '}<button className={buttonClass} disabled={mutation.isPending} onClick={() => setConfirm(false)}>Volver sin cancelar</button></section>}
      {!allowed && intent.state === 'ACTIVE' && identity.permissions.includes('relationships.intent.cancel') && <p>Solo puedes cancelar intenciones propias, salvo los permisos de Directorio y Administración.</p>}
      <MutationError error={mutation.error} />
      {mutation.error && <button className={buttonClass} onClick={() => { void detail.refetch().then(result => { if (!result.isError) { mutation.reset(); setConfirm(false); } }); }}>Recargar intención y revisar estado</button>}
      {mutation.isSuccess && <p role="status">Intención cancelada.</p>}
    </>}
  </section>;
}
