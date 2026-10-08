import { useState } from 'react';
import { Link } from 'react-router';
import { useSession, type AuthIdentity } from '../auth/session';
import { ActionLink, Button } from '../../components/ui/actions';
import { PageHeader, FilterBar, Surface } from '../../components/ui/layout';
import { FormField, Select } from '../../components/ui/forms';
import { DataList, DataListItem, Metadata, Pagination } from '../../components/ui/lists';
import { EmptyState, QueryFeedback, StatusBadge } from '../../components/ui/feedback';
import { restrictionIdentityKey, useRestrictions } from './restriction-queries';
import type { ContactRestriction } from './restriction-contracts';
import './relationships-pages.css';
export function RestrictionContext({ restriction, modern = false }: { restriction: ContactRestriction; modern?: boolean }) {
  if (modern) return <>
    <Metadata items={[
      { label: 'Registrada por', value: restriction.registeredBy.displayName + (!restriction.registeredBy.isActive ? ' (cuenta inactiva)' : '') },
      { label: 'Fecha', value: <time dateTime={restriction.createdAt}>{new Date(restriction.createdAt).toLocaleString('es-BO')}</time> },
      ...(restriction.liftedAt ? [{ label: 'Levantada por', value: <>{restriction.liftedBy?.displayName}{restriction.liftedBy && !restriction.liftedBy.isActive && ' (cuenta inactiva)'} · <time dateTime={restriction.liftedAt}>{new Date(restriction.liftedAt).toLocaleString('es-BO')}</time></> }] : [])
    ]} />
    {restriction.liftedAt && <p className="relationships-closure whitespace-pre-wrap break-words">Motivo de levantamiento: {restriction.liftReason}</p>}
  </>;
  return <div className="space-y-1 text-sm"><p>Objetivo: <Link className="underline" to={'/' + (restriction.target.kind === 'ORGANIZATION' ? 'organizations/' : 'people/') + restriction.target.id}>{restriction.target.label}</Link>{!restriction.target.isActive && ' (ficha inactiva)'}</p>
    <p>Estado: {restriction.state === 'ACTIVE' ? 'Activa — no contactar' : 'Levantada'}</p>
    <p>Registrada por: {restriction.registeredBy.displayName}{!restriction.registeredBy.isActive && ' (cuenta inactiva)'} · {new Date(restriction.createdAt).toLocaleString('es-BO')}</p>
    {restriction.liftedAt && <><p>Levantada por: {restriction.liftedBy?.displayName}{restriction.liftedBy && !restriction.liftedBy.isActive && ' (cuenta inactiva)'} · {new Date(restriction.liftedAt).toLocaleString('es-BO')}</p>
      <p className="whitespace-pre-wrap break-words">Motivo de levantamiento: {restriction.liftReason}</p></>}</div>;
}
export function ContactRestrictionsPage() {
  const identity = useSession().data;
  if (!identity?.permissions.includes('relationships.restriction.read')) return <p role="alert">No tienes permiso para consultar restricciones.</p>;
  return <RestrictionsList key={restrictionIdentityKey(identity).join(':')} identity={identity} />;
}
function RestrictionsList({ identity }: { identity: AuthIdentity }) {
  const [page, setPage] = useState(1), [state, setState] = useState('all'), [organizationId, setOrganizationId] = useState(''), [personId, setPersonId] = useState('');
  const list = useRestrictions(identity, { page, state, ...(organizationId ? { organizationId } : {}), ...(personId ? { personId } : {}) });
  return <section className="relationships-page">
    <PageHeader eyebrow="Relaciones" title="Restricciones de no contacto" description="Consulta las solicitudes explícitas de no contacto y sus antecedentes institucionales."
      primaryAction={identity.permissions.includes('relationships.restriction.create') && <ActionLink appearance="action" className="relationships-primary-action" to="/contact-restrictions/new">Registrar restricción</ActionLink>} />
    <FilterBar aria-label="Filtros de restricciones" actions={(organizationId || personId) && <Button onClick={() => { setOrganizationId(''); setPersonId(''); setPage(1); }}>Quitar filtro de objetivo</Button>}>
      <FormField label="Estado de restricciones">{control => <Select {...control} value={state} onChange={event => { setState(event.target.value); setPage(1); }}><option value="all">Todas</option><option value="ACTIVE">Activas</option><option value="LIFTED">Levantadas</option></Select>}</FormField>
    </FilterBar>
    <Surface aria-label="Resultados de restricciones">
    <QueryFeedback pending={list.isPending} error={list.isError} retry={list.refetch} />
    {list.data?.total === 0 && <EmptyState title="No hay restricciones para estos filtros." />}
    <DataList>{list.data?.items.map(row => <DataListItem key={row.id}>
      <div className="relationships-row-heading"><ActionLink appearance="list" to={'/' + (row.target.kind === 'ORGANIZATION' ? 'organizations/' : 'people/') + row.target.id}>{row.target.label}{!row.target.isActive && ' (ficha inactiva)'}</ActionLink>
      <StatusBadge tone={row.state === 'ACTIVE' ? 'warning' : 'neutral'}>{row.state === 'ACTIVE' ? 'Activa — no contactar' : 'Levantada'}</StatusBadge></div>
      <p className="relationships-restriction-reason"><ActionLink to={'/contact-restrictions/' + row.id}>{row.reason}</ActionLink></p><RestrictionContext modern restriction={row} />
      <Button variant="ghost" onClick={() => { setOrganizationId(row.target.kind === 'ORGANIZATION' ? row.target.id : ''); setPersonId(row.target.kind === 'PERSON' ? row.target.id : ''); setPage(1); }}>Ver historial de este objetivo</Button>
    </DataListItem>)}</DataList>
    {list.data && <Pagination page={page} total={list.data.total} onPage={setPage} />}
    </Surface>
  </section>;
}
