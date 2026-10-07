import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useSession, type AuthIdentity } from '../auth/session';
import { buttonClass, Field, inputClass, Pagination, QueryState } from '../directory/directory-ui';
import { PROCESS_RESULT_LABELS, PROCESS_STATE_LABELS, type RelationshipProcess } from './process-contracts';
import { processIdentityKey, useProcesses } from './process-queries';
export function ProcessContext({ process }: { process: RelationshipProcess }) {
  const date = (value: string) => new Date(value).toLocaleString('es-BO');
  return <div className="space-y-1"><p>Actor principal: <Link className="underline" to={'/' + (process.target.kind === 'ORGANIZATION' ? 'organizations/' : 'people/') + process.target.id}>{process.target.label}</Link>{!process.target.isActive && ' (inactivo)'}</p>
    <p>Creador: {process.createdBy.displayName}{!process.createdBy.isActive && ' (cuenta inactiva)'}</p><p>Estado: {PROCESS_STATE_LABELS[process.state]}</p>
    <p>Creación: {date(process.createdAt)}</p><p>Última actividad formal: {date(process.lastActivityAt)}</p>
    {process.currentResult && <div><p>Resultado: {PROCESS_RESULT_LABELS[process.currentResult]}</p><p>Cerrado por {process.closedBy?.displayName} · {date(process.closedAt!)}</p>{process.closureObservation && <p className="whitespace-pre-wrap break-words">{process.closureObservation}</p>}</div>}
    {process.sourceIntentId && <Link className="underline" to={'/contact-intents/' + process.sourceIntentId}>Consultar intención de origen</Link>}</div>;
}
export function RelationshipProcessesPage() {
  const identity = useSession().data;
  if (!identity?.permissions.includes('relationships.process.read')) return <p role="alert">No tienes permiso para consultar procesos.</p>;
  return <ProcessesList key={processIdentityKey(identity).join(':')} identity={identity} />;
}
function ProcessesList({ identity }: { identity: AuthIdentity }) {
  const [params, setParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const validStates = ['PREPARATION', 'IN_PROGRESS', 'WAITING_RESPONSE', 'NEGOTIATION', 'CLOSED'];
  const requestedState = params.get('state') ?? 'all';
  const state = requestedState === 'all' || validStates.includes(requestedState) ? requestedState : 'all';
  const list = useProcesses(identity, page, state);
  return <section className="min-w-0 w-full space-y-4"><h1 className="text-2xl font-semibold">Procesos de relación</h1>
    {identity.permissions.includes('relationships.process.create') && <Link className={buttonClass} to="/relationship-processes/new">Crear proceso</Link>}
    <Field label="Estado de procesos"><select className={inputClass} value={state} onChange={e => { const next = new URLSearchParams(params); if (e.target.value === 'all') next.delete('state'); else next.set('state', e.target.value); next.delete('page'); setParams(next); setPage(1); }}><option value="all">Todos</option>
      {Object.entries(PROCESS_STATE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
    <QueryState pending={list.isPending} error={list.isError} retry={list.refetch} />
    {list.data?.total === 0 && <p>No hay procesos para estos filtros.</p>}
    <ul className="space-y-3">{list.data?.items.map(process => <li key={process.id} className="min-w-0 space-y-2 rounded border p-3 break-words">
      <Link className="inline-flex min-h-11 items-center font-semibold underline whitespace-pre-wrap" to={'/relationship-processes/' + process.id}>{process.purpose}</Link><ProcessContext process={process} />
    </li>)}</ul>{list.data && <Pagination page={page} total={list.data.total} pageSize={list.data.pageSize} onPage={setPage} />}
  </section>;
}
