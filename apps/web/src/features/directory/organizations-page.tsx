import { useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useSession } from '../auth/session';
import type { AuthIdentity } from '../auth/session';
import { useOrganizations } from './queries';
import { buttonClass, Pagination, QueryState } from './directory-ui';
import { OrganizationFilters } from './organization-filters';
import { OrganizationForm } from './organization-form';
export function OrganizationsPage() {
  const session = useSession(); const identity = session.data;
  const [, setParams] = useSearchParams(); const previousIdentity = useRef<string | undefined>(undefined);
  useEffect(() => { if (previousIdentity.current && identity?.id && previousIdentity.current !== identity.id) setParams({}, { replace: true }); previousIdentity.current = identity?.id; }, [identity?.id, setParams]);
  if (!identity?.permissions.includes('directory.read')) return <p role="alert">No tienes permiso para consultar el directorio.</p>;
  return <OrganizationsList key={identity.id} identity={identity} />;
}
function OrganizationsList({ identity }: { identity: AuthIdentity }) {
  const [params, setParams] = useSearchParams();
  const requestedPage = Number(params.get('page') ?? '1');
  const page = Number.isInteger(requestedPage) && requestedPage > 0 && requestedPage <= 1000000 ? requestedPage : 1;
  const name = params.get('name') ?? '';
  const query = new URLSearchParams(params); query.set('page', String(page));
  if (!query.has('status')) query.set('status', 'active');
  const list = useOrganizations(identity, 'organizations?' + query);
  function change(values: Record<string, string>) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(values)) { if (value.trim()) next.set(key, value); else next.delete(key); }
    setParams(next);
  }
  return <section className="min-w-0 w-full space-y-4 break-words"><h1 className="text-2xl font-semibold">Directorio · Organizaciones</h1>
    <div className="flex flex-wrap gap-4">{identity.permissions.includes('directory.write') && <Link className={buttonClass} to="/organizations/new">Crear organización</Link>}
      <Link className={buttonClass} to="/directory/search">Búsqueda global</Link><Link className={buttonClass} to="/organizations/categories">Categorías</Link><Link className={buttonClass} to="/people">Personas externas</Link></div>
    <label className="block">Filtrar organizaciones por nombre<input className="mt-1 min-h-11 w-full rounded border px-3 py-2" value={name} onChange={event => change({ name: event.target.value, page: '1' })} /></label>
    <OrganizationFilters identity={identity} params={params} change={change} />
    <section aria-label="Resultados de organizaciones" className="space-y-4">
    <QueryState pending={list.isPending} error={list.isError} retry={list.refetch} />
    {list.data?.total === 0 && <p>No hay organizaciones para estos filtros.</p>}
    <ul className="space-y-3">{list.data?.items.map(row => <li key={row.id} className="min-w-0 rounded border p-3 break-words">
      <Link className="inline-flex min-h-11 items-center font-semibold underline" to={'/organizations/' + row.id}>{row.name}</Link>
      <p>{row.country ?? 'País sin registrar'} · {row.isActive ? 'Activa' : 'Inactiva'}</p>
      {row.parent && <p>Matriz: {row.parent.name}</p>}
      <p>{row.categories.map(category => category.name).join(', ') || 'Sin categorías'}</p>
    </li>)}</ul>
    {list.data && <Pagination page={page} total={list.data.total} onPage={value => change({ page: String(value) })} />}
    </section>
  </section>;
}
export function OrganizationCreationPage() {
  const session = useSession(); const navigate = useNavigate();
  if (!session.data?.permissions.includes('directory.write')) return <p role="alert">No tienes permiso para crear organizaciones.</p>;
  return <section className="space-y-4"><h1 className="text-2xl font-semibold">Crear organización</h1>
    <OrganizationForm identity={session.data} saved={row => navigate('/organizations/' + row.id)} cancel={() => navigate('/organizations')} /></section>;
}
