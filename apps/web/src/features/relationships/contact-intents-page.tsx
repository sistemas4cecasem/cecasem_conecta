import { useState } from 'react';
import { Link } from 'react-router';
import { useSession, type AuthIdentity } from '../auth/session';
import { buttonClass, Field, inputClass, Pagination, QueryState } from '../directory/directory-ui';
import { INTENT_LABELS, type ContactIntent } from './contracts';
import { intentIdentityKey, useIntents } from './queries';
export function IntentContext({ intent }: { intent: ContactIntent }) {
  const date = (value: string) => new Date(value).toLocaleString('es-BO');
  return <div className="space-y-1"><p>Objetivo: <Link className="underline" to={'/' + (intent.target.kind === 'ORGANIZATION' ? 'organizations/' : 'people/') + intent.target.id}>{intent.target.label}</Link>{!intent.target.isActive && ' (inactivo)'}</p>
    <p>Autor: {intent.author.displayName}{!intent.author.isActive && ' (cuenta inactiva)'}</p><p>Estado: {INTENT_LABELS[intent.state]}</p>
    <p>Creación: {date(intent.createdAt)}</p><p>Última actividad: {date(intent.lastActivityAt)}</p>
    {intent.cancelledBy && <p>Cancelada por {intent.cancelledBy.displayName} · {date(intent.cancelledAt!)}</p>}</div>;
}
export function ContactIntentsPage() {
  const identity = useSession().data;
  if (!identity?.permissions.includes('relationships.intent.read')) return <p role="alert">No tienes permiso para consultar intenciones.</p>;
  return <IntentsList key={intentIdentityKey(identity).join(':')} identity={identity} />;
}
function IntentsList({ identity }: { identity: AuthIdentity }) {
  const [page, setPage] = useState(1), [state, setState] = useState('all');
  const list = useIntents(identity, page, state);
  return <section className="space-y-4"><h1 className="text-2xl font-semibold">Intenciones de contacto</h1>
    {identity.permissions.includes('relationships.intent.create') && <Link className={buttonClass} to="/contact-intents/new">Crear intención</Link>}
    <Field label="Estado de intenciones"><select className={inputClass} value={state} onChange={e => { setState(e.target.value); setPage(1); }}>
      <option value="all">Todas</option><option value="ACTIVE">Activas</option><option value="CONVERTED">Convertidas</option><option value="CANCELLED">Canceladas</option></select></Field>
    <QueryState pending={list.isPending} error={list.isError} retry={list.refetch} />
    {list.data?.total === 0 && <p>No hay intenciones para estos filtros.</p>}
    <ul className="space-y-3">{list.data?.items.map(intent => <li key={intent.id} className="min-w-0 space-y-2 rounded border p-3 break-words">
      <Link className="inline-flex min-h-11 items-center font-semibold underline whitespace-pre-wrap" to={'/contact-intents/' + intent.id}>{intent.purpose}</Link><IntentContext intent={intent} />
    </li>)}</ul>{list.data && <Pagination page={page} total={list.data.total} pageSize={list.data.pageSize} onPage={setPage} />}
  </section>;
}
