import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { ActionLink } from '../../components/ui/actions';
import { EmptyState, QueryFeedback, StatusBadge } from '../../components/ui/feedback';
import { FormField, Input } from '../../components/ui/forms';
import { FilterBar, PageHeader, Surface } from '../../components/ui/layout';
import { DataList, DataListItem, Metadata, Pagination } from '../../components/ui/lists';
import { useSession } from '../auth/session';
import type { AuthIdentity } from '../auth/session';
import { useOrganizations } from './queries';
import { OrganizationFilters } from './organization-filters';
import { OrganizationForm } from './organization-form';
import { organizationFilterKeys } from './organization-filter.contracts';
import './organizations.css';
import './organization-presentation.css';
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
  const unfilteredAll = params.get('status') === 'all' && !name && organizationFilterKeys.filter(key => key !== 'status').every(key => !params.get(key));
  function change(values: Record<string, string>) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(values)) { if (value.trim()) next.set(key, value); else next.delete(key); }
    setParams(next);
  }
  return <section className="organizations-page">
    <PageHeader eyebrow="Directorio" title="Organizaciones" description="Consulta y administra las organizaciones registradas."
      primaryAction={identity.permissions.includes('directory.write') && <ActionLink appearance="action" className="organizations-create" to="/organizations/new">Crear organización</ActionLink>} />
    <FilterBar aria-label="Búsqueda y filtros de organizaciones">
      <div className="organizations-search"><FormField label="Filtrar organizaciones por nombre">{control =>
        <Input {...control} value={name} onChange={event => change({ name: event.target.value, page: '1' })} />
      }</FormField></div>
      <OrganizationFilters identity={identity} params={params} change={change} presentation="modern" />
    </FilterBar>
    <Surface aria-label="Resultados de organizaciones">
    <header className="ui-section-heading"><h2>Resultados</h2></header>
    {list.data && <p className="ui-description">{list.data.total} organizaciones</p>}
    <QueryFeedback pending={list.isPending} error={list.isError} retry={list.refetch} />
    {list.data?.total === 0 && <EmptyState title={unfilteredAll ? 'No hay organizaciones registradas.' : 'No hay organizaciones para estos filtros.'}
      description={unfilteredAll ? undefined : 'Revisa la búsqueda y los filtros seleccionados.'} />}
    {!!list.data?.items.length && <DataList>{list.data.items.map(row => <DataListItem key={row.id}>
      <div className="organization-row-heading"><ActionLink appearance="list" to={'/organizations/' + row.id}>{row.name}</ActionLink>
        <StatusBadge tone={row.isActive ? 'success' : 'neutral'}>{row.isActive ? 'Activa' : 'Inactiva'}</StatusBadge></div>
      <Metadata items={[
        { label: 'País', value: row.country ?? 'País sin registrar' },
        { label: 'Categorías', value: row.categories.map(category => category.name).join(', ') || 'Sin categorías' },
        ...(row.parent ? [{ label: 'Matriz', value: row.parent.name }] : []),
      ]} />
    </DataListItem>)}</DataList>}
    {list.data && list.data.total > 0 && <Pagination page={page} total={list.data.total} onPage={value => change({ page: String(value) })} />}
    </Surface>
  </section>;
}
export function OrganizationCreationPage() {
  const session = useSession(); const navigate = useNavigate();
  if (!session.data?.permissions.includes('directory.write')) return <p role="alert">No tienes permiso para crear organizaciones.</p>;
  return <section className="organization-form-page">
    <PageHeader eyebrow="Directorio / Organizaciones" title="Crear organización" />
    <Surface className="organization-form-surface"><OrganizationForm identity={session.data} saved={row => navigate('/organizations/' + row.id)} cancel={() => navigate('/organizations')} /></Surface>
  </section>;
}
