import { useState } from 'react';
import { Link } from 'react-router';
import { useSession, type AuthIdentity } from '../auth/session';
import { buttonClass, Field, inputClass, Pagination, QueryState } from '../directory/directory-ui';
import { restrictionIdentityKey, useRestrictions } from './restriction-queries';
import type { ContactRestriction } from './restriction-contracts';
export function RestrictionContext({ restriction }: { restriction: ContactRestriction }) {
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
  return <section className="space-y-4"><h1 className="text-2xl font-semibold">Restricciones de no contacto</h1>
    {identity.permissions.includes('relationships.restriction.create') && <Link className={buttonClass} to="/contact-restrictions/new">Registrar restricción</Link>}
    <Field label="Estado de restricciones"><select className={inputClass} value={state} onChange={event => { setState(event.target.value); setPage(1); }}><option value="all">Todas</option><option value="ACTIVE">Activas</option><option value="LIFTED">Levantadas</option></select></Field>
    <QueryState pending={list.isPending} error={list.isError} retry={list.refetch} />
    {list.data?.total === 0 && <p>No hay restricciones para estos filtros.</p>}
    {(organizationId || personId) && <button className={buttonClass} onClick={() => { setOrganizationId(''); setPersonId(''); setPage(1); }}>Quitar filtro de objetivo</button>}
    <ul className="space-y-3">{list.data?.items.map(row => <li key={row.id} className="space-y-2 rounded border p-3">
      <Link className="whitespace-pre-wrap break-words underline" to={'/contact-restrictions/' + row.id}>{row.reason}</Link><RestrictionContext restriction={row} />
      <button className={buttonClass} onClick={() => { setOrganizationId(row.target.kind === 'ORGANIZATION' ? row.target.id : ''); setPersonId(row.target.kind === 'PERSON' ? row.target.id : ''); setPage(1); }}>Ver historial de este objetivo</button>
    </li>)}</ul>
    {list.data && <Pagination page={page} total={list.data.total} onPage={setPage} />}
  </section>;
}
