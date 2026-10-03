import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useSession } from '../auth/session';
import type { AuthIdentity } from '../auth/session';
import type { Category } from './contracts';
import { useCategories, useOrganizations } from './queries';
import { buttonClass, Field, inputClass, Pagination, QueryState } from './directory-ui';
import { OrganizationForm } from './organization-form';
export function OrganizationsPage() {
  const session = useSession(); const identity = session.data;
  if (!identity?.permissions.includes('directory.read')) return <p role="alert">No tienes permiso para consultar el directorio.</p>;
  return <OrganizationsList key={identity.id} identity={identity} />;
}
type SelectedCategory = Pick<Category, 'id' | 'name' | 'isActive'>;
function CategoryFilter({ identity, selected, onChange }: { identity: AuthIdentity; selected: SelectedCategory | null; onChange: (category: SelectedCategory | null) => void }) {
  const [page, setPage] = useState(1);
  const catalog = useCategories(identity, `categories?status=all&page=${page}`);
  const options = catalog.data?.items ?? [];
  return <section aria-label="Catálogo de categorías para filtrar" className="space-y-2">
    <Field label="Categoría"><select className={inputClass} value={selected?.id ?? ''} disabled={catalog.isPending || catalog.isError}
      onChange={event => onChange(options.find(category => category.id === event.target.value) ?? null)}>
      <option value="">Todas las categorías</option>
      {selected && !options.some(category => category.id === selected.id) && <option value={selected.id}>{selected.name}{selected.isActive ? '' : ' (inactiva)'}</option>}
      {options.map(category => <option key={category.id} value={category.id}>{category.name}{category.isActive ? '' : ' (inactiva)'}</option>)}
    </select></Field>
    {catalog.isPending && <p role="status">Cargando categorías…</p>}
    <QueryState pending={false} error={catalog.isError} retry={catalog.refetch} />
    {catalog.data?.total === 0 && <p>No hay categorías registradas.</p>}
    {catalog.data && catalog.data.total > catalog.data.pageSize && <Pagination page={page} total={catalog.data.total} pageSize={catalog.data.pageSize} onPage={setPage} />}
  </section>;
}
function OrganizationsList({ identity }: { identity: AuthIdentity }) {
  const [page, setPage] = useState(1); const [status, setStatus] = useState('active');
  const [name, setName] = useState('');
  const [category, setCategory] = useState<SelectedCategory | null>(null);
  const list = useOrganizations(identity, `organizations?page=${page}&status=${status}&name=${encodeURIComponent(name)}${category ? '&categoryId=' + encodeURIComponent(category.id) : ''}`);
  return <section className="space-y-4"><h1 className="text-2xl font-semibold">Directorio · Organizaciones</h1>
    <div className="flex flex-wrap gap-4">{identity.permissions.includes('directory.write') && <Link className={buttonClass} to="/organizations/new">Crear organización</Link>}
      <Link className={buttonClass} to="/directory/search">Buscar en el Directorio</Link><Link className={buttonClass} to="/organizations/categories">Categorías</Link><Link className={buttonClass} to="/people">Personas externas</Link></div>
    <div className="grid gap-4 sm:grid-cols-2"><Field label="Filtrar organizaciones por nombre"><input className={inputClass} value={name} onChange={e => { setName(e.target.value); setPage(1); }} /></Field>
      <Field label="Estado"><select className={inputClass} value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>
        <option value="active">Activas</option><option value="inactive">Inactivas</option><option value="all">Todas</option></select></Field></div>
    <CategoryFilter identity={identity} selected={category} onChange={value => { setCategory(value); setPage(1); }} />
    <section aria-label="Resultados de organizaciones" className="space-y-4">
    <QueryState pending={list.isPending} error={list.isError} retry={list.refetch} />
    {list.data?.total === 0 && <p>No hay organizaciones para estos filtros.</p>}
    <ul className="space-y-3">{list.data?.items.map(row => <li key={row.id} className="min-w-0 rounded border p-3 break-words">
      <Link className="inline-flex min-h-11 items-center font-semibold underline" to={'/organizations/' + row.id}>{row.name}</Link>
      <p>{row.country ?? 'País sin registrar'} · {row.isActive ? 'Activa' : 'Inactiva'}</p>
      {row.parent && <p>Matriz: {row.parent.name}</p>}
      <p>{row.categories.map(category => category.name).join(', ') || 'Sin categorías'}</p>
    </li>)}</ul>
    {list.data && <Pagination page={page} total={list.data.total} onPage={setPage} />}
    </section>
  </section>;
}
export function OrganizationCreationPage() {
  const session = useSession(); const navigate = useNavigate();
  if (!session.data?.permissions.includes('directory.write')) return <p role="alert">No tienes permiso para crear organizaciones.</p>;
  return <section className="space-y-4"><h1 className="text-2xl font-semibold">Crear organización</h1>
    <OrganizationForm identity={session.data} saved={row => navigate('/organizations/' + row.id)} cancel={() => navigate('/organizations')} /></section>;
}
