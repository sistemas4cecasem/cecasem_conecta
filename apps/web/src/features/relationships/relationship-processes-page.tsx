import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useSession, type AuthIdentity } from '../auth/session';
import { ActionLink } from '../../components/ui/actions';
import { PageHeader, FilterBar, Surface } from '../../components/ui/layout';
import { FormField, Select } from '../../components/ui/forms';
import { DataList, DataListItem, Metadata, Pagination } from '../../components/ui/lists';
import { EmptyState, QueryFeedback, StatusBadge } from '../../components/ui/feedback';
import { PROCESS_RESULT_LABELS, PROCESS_STATE_LABELS, type RelationshipProcess } from './process-contracts';
import { processIdentityKey, useProcesses } from './process-queries';
import './relationships-pages.css';
export function ProcessContext({ process, modern = false }: { process: RelationshipProcess; modern?: boolean }) {
  const date = (value: string) => new Date(value).toLocaleString('es-BO');
  if (modern) return <>
    <Metadata items={[
      { label: 'Actor principal', value: <ActionLink to={'/' + (process.target.kind === 'ORGANIZATION' ? 'organizations/' : 'people/') + process.target.id}>{process.target.label}{!process.target.isActive && ' (inactivo)'}</ActionLink> },
      { label: 'Creador', value: process.createdBy.displayName + (!process.createdBy.isActive ? ' (cuenta inactiva)' : '') },
      { label: 'Creación', value: <time dateTime={process.createdAt}>{date(process.createdAt)}</time> },
      { label: 'Última actividad formal', value: <time dateTime={process.lastActivityAt}>{date(process.lastActivityAt)}</time> }
    ]} />
    {process.currentResult && <div className="relationships-closure"><p>Resultado: {PROCESS_RESULT_LABELS[process.currentResult]}</p><p>Cerrado por {process.closedBy?.displayName} · <time dateTime={process.closedAt!}>{date(process.closedAt!)}</time></p>{process.closureObservation && <p className="whitespace-pre-wrap break-words">{process.closureObservation}</p>}</div>}
    {process.sourceIntentId && <ActionLink appearance="context" to={'/contact-intents/' + process.sourceIntentId}>Consultar intención de origen</ActionLink>}
  </>;
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
  return <section className="relationships-page">
    <PageHeader eyebrow="Relaciones" title="Procesos de relación" description="Consulta los objetivos institucionales en curso y sus antecedentes."
      primaryAction={identity.permissions.includes('relationships.process.create') && <ActionLink appearance="action" className="relationships-primary-action" to="/relationship-processes/new">Crear proceso</ActionLink>} />
    <FilterBar aria-label="Filtros de procesos"><FormField label="Estado de procesos">{control => <Select {...control} value={state} onChange={e => { const next = new URLSearchParams(params); if (e.target.value === 'all') next.delete('state'); else next.set('state', e.target.value); next.delete('page'); setParams(next); setPage(1); }}><option value="all">Todos</option>
      {Object.entries(PROCESS_STATE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>}</FormField></FilterBar>
    <Surface aria-label="Resultados de procesos">
    <QueryFeedback pending={list.isPending} error={list.isError} retry={list.refetch} />
    {list.data?.total === 0 && <EmptyState title="No hay procesos para estos filtros." />}
    <DataList>{list.data?.items.map(process => <DataListItem key={process.id}>
      <div className="relationships-row-heading"><ActionLink appearance="list" to={'/relationship-processes/' + process.id}>{process.purpose}</ActionLink>
      <StatusBadge tone={process.state === 'WAITING_RESPONSE' ? 'warning' : process.state === 'CLOSED' ? 'neutral' : 'info'}>{PROCESS_STATE_LABELS[process.state]}</StatusBadge></div><ProcessContext modern process={process} />
    </DataListItem>)}</DataList>{list.data && <Pagination page={page} total={list.data.total} pageSize={list.data.pageSize} onPage={setPage} />}
    </Surface>
  </section>;
}
