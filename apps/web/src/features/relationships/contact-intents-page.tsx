import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useSession, type AuthIdentity } from '../auth/session';
import { ActionLink } from '../../components/ui/actions';
import { PageHeader, FilterBar, Surface } from '../../components/ui/layout';
import { FormField, Select } from '../../components/ui/forms';
import { DataList, DataListItem, Metadata, Pagination } from '../../components/ui/lists';
import { EmptyState, QueryFeedback, StatusBadge } from '../../components/ui/feedback';
import { INTENT_LABELS, type ContactIntent } from './contracts';
import { intentIdentityKey, useIntents } from './queries';
import './relationships-pages.css';
export function IntentContext({ intent, modern = false }: { intent: ContactIntent; modern?: boolean }) {
  const date = (value: string) => new Date(value).toLocaleString('es-BO');
  if (modern) return <Metadata items={[
    { label: 'Objetivo', value: <ActionLink to={'/' + (intent.target.kind === 'ORGANIZATION' ? 'organizations/' : 'people/') + intent.target.id}>{intent.target.label}{!intent.target.isActive && ' (inactivo)'}</ActionLink> },
    { label: 'Autor', value: intent.author.displayName + (!intent.author.isActive ? ' (cuenta inactiva)' : '') },
    { label: 'Creación', value: <time dateTime={intent.createdAt}>{date(intent.createdAt)}</time> },
    { label: 'Última actividad', value: <time dateTime={intent.lastActivityAt}>{date(intent.lastActivityAt)}</time> },
    ...(intent.cancelledBy ? [{ label: 'Cancelada por', value: <>{intent.cancelledBy.displayName} · <time dateTime={intent.cancelledAt!}>{date(intent.cancelledAt!)}</time></> }] : [])
  ]} />;
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
  const [page, setPage] = useState(1), [params, setParams] = useSearchParams();
  const requestedState = params.get('state') ?? 'all';
  const state = ['all', 'ACTIVE', 'CONVERTED', 'CANCELLED', 'CLOSED'].includes(requestedState) ? requestedState : 'all';
  const list = useIntents(identity, page, state);
  return <section className="relationships-page">
    <PageHeader eyebrow="Relaciones" title="Intenciones de contacto" description="Consulta los acercamientos previstos, sus objetivos y su actividad."
      primaryAction={identity.permissions.includes('relationships.intent.create') && <ActionLink appearance="action" className="relationships-primary-action" to="/contact-intents/new">Crear intención</ActionLink>} />
    <FilterBar aria-label="Filtros de intenciones"><FormField label="Estado de intenciones">{control => <Select {...control} value={state} onChange={e => { const next = new URLSearchParams(params); if (e.target.value === 'all') next.delete('state'); else next.set('state', e.target.value); next.delete('page'); setParams(next); setPage(1); }}>
      <option value="all">Todas</option><option value="ACTIVE">Activas</option><option value="CONVERTED">Convertidas</option><option value="CANCELLED">Canceladas</option></Select>}</FormField></FilterBar>
    <Surface aria-label="Resultados de intenciones">
    <QueryFeedback pending={list.isPending} error={list.isError} retry={list.refetch} />
    {list.data?.total === 0 && <EmptyState title="No hay intenciones para estos filtros." />}
    <DataList>{list.data?.items.map(intent => <DataListItem key={intent.id}>
      <div className="relationships-row-heading"><ActionLink appearance="list" to={'/contact-intents/' + intent.id}>{intent.purpose}</ActionLink>
      <StatusBadge tone={intent.state === 'ACTIVE' ? 'info' : 'neutral'}>{INTENT_LABELS[intent.state]}</StatusBadge></div><IntentContext modern intent={intent} />
    </DataListItem>)}</DataList>{list.data && <Pagination page={page} total={list.data.total} pageSize={list.data.pageSize} onPage={setPage} />}
    </Surface>
  </section>;
}
