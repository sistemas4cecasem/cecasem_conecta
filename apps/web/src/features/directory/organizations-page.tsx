import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useSession } from '../auth/session';
import { useOrganizations } from './queries';
import { buttonClass, Field, inputClass, Pagination, QueryState } from './directory-ui';
import { OrganizationForm } from './organization-form';
export function OrganizationsPage() {
  const session = useSession(); const identity = session.data;
  const [page, setPage] = useState(1); const [status, setStatus] = useState('active');
  const [name, setName] = useState('');
  const list = useOrganizations(identity, `organizations?page=${page}&status=${status}&name=${encodeURIComponent(name)}`);
  if (!identity?.permissions.includes('directory.read')) return <p role="alert">No tienes permiso para consultar el directorio.</p>;
  return <section className="space-y-4"><h1 className="text-2xl font-semibold">Directorio · Organizaciones</h1>
    <div className="flex flex-wrap gap-4">{identity.permissions.includes('directory.write') && <Link className={buttonClass} to="/organizations/new">Crear organización</Link>}
      <Link className={buttonClass} to="/organizations/categories">Categorías</Link></div>
    <div className="grid gap-4 sm:grid-cols-2"><Field label="Filtrar organizaciones por nombre"><input className={inputClass} value={name} onChange={e => { setName(e.target.value); setPage(1); }} /></Field>
      <Field label="Estado"><select className={inputClass} value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>
        <option value="active">Activas</option><option value="inactive">Inactivas</option><option value="all">Todas</option></select></Field></div>
    <QueryState pending={list.isPending} error={list.isError} retry={list.refetch} />
    {list.data?.total === 0 && <p>No hay organizaciones para estos filtros.</p>}
    <ul className="space-y-3">{list.data?.items.map(row => <li key={row.id} className="min-w-0 rounded border p-3 break-words">
      <Link className="inline-flex min-h-11 items-center font-semibold underline" to={'/organizations/' + row.id}>{row.name}</Link>
      <p>{row.country ?? 'País sin registrar'} · {row.isActive ? 'Activa' : 'Inactiva'}</p>
      {row.parent && <p>Matriz: {row.parent.name}</p>}
      <p>{row.categories.map(category => category.name).join(', ') || 'Sin categorías'}</p>
    </li>)}</ul>
    {list.data && <Pagination page={page} total={list.data.total} onPage={setPage} />}
  </section>;
}
export function OrganizationCreationPage() {
  const session = useSession(); const navigate = useNavigate();
  if (!session.data?.permissions.includes('directory.write')) return <p role="alert">No tienes permiso para crear organizaciones.</p>;
  return <section className="space-y-4"><h1 className="text-2xl font-semibold">Crear organización</h1>
    <OrganizationForm identity={session.data} saved={row => navigate('/organizations/' + row.id)} cancel={() => navigate('/organizations')} /></section>;
}
