import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { ActionLink, Button } from '../../components/ui/actions';
import { EmptyState, QueryFeedback, StatusBadge } from '../../components/ui/feedback';
import { Input } from '../../components/ui/forms';
import { PageHeader, Surface } from '../../components/ui/layout';
import { DataList, DataListItem, Pagination } from '../../components/ui/lists';
import { useSession } from '../auth/session';
import type { AuthIdentity } from '../auth/session';
import { useOrganizations } from './queries';
import { OrganizationFilters } from './organization-filters';
import { OrganizationForm } from './organization-form';
import { organizationFilterKeys } from './organization-filter.contracts';
import { verificationLabels } from './verification.contracts';
import './organizations.css';
import './organization-presentation.css';

const statusLabels: Record<string, string> = { active: 'Activas', inactive: 'Inactivas', all: 'Todas' };

function selectedOrganizationFilters(params: URLSearchParams) {
  const selected: { key: string; label: string }[] = [];
  const country = params.get('country')?.trim();
  if (country) selected.push({ key: 'country', label: `País: ${country}` });

  const status = params.get('status')?.trim();
  if (status && status !== 'all') selected.push({ key: 'status', label: `Estado: ${statusLabels[status] ?? status}` });

  const verification = params.get('verificationStatus')?.trim();
  if (verification) selected.push({ key: 'verificationStatus', label: `Verificación: ${verificationLabels[verification as keyof typeof verificationLabels] ?? verification}` });

  const communications = params.get('withCommunications')?.trim();
  if (communications) selected.push({ key: 'withCommunications', label: communications === 'true' ? 'Con comunicaciones históricas' : communications === 'false' ? 'Sin comunicaciones históricas' : `Comunicaciones: ${communications}` });

  if (params.get('categoryId')?.trim()) selected.push({ key: 'categoryId', label: 'Categoría aplicada' });
  return selected;
}

function hasNarrowingFilters(params: URLSearchParams) {
  return !!params.get('name')?.trim() || selectedOrganizationFilters(params).length > 0;
}

function OrganizationIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" focusable="false">
    <path d="M3.75 20.25h16.5M5.25 20.25V6.75l6.75-3 6.75 3v13.5M8.25 9h1.5m4.5 0h1.5m-7.5 3.75h1.5m4.5 0h1.5m-6.75 7.5v-4.5h4.5v4.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

function SearchIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" focusable="false">
    <circle cx="10.8" cy="10.8" r="6.3" /><path d="m15.5 15.5 4.1 4.1" strokeLinecap="round" />
  </svg>;
}

function FiltersIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true" focusable="false">
    <path d="M4 7h6m4 0h6M4 17h2m4 0h10" strokeLinecap="round" />
    <circle cx="12" cy="7" r="2" fill="white" /><circle cx="8" cy="17" r="2" fill="white" />
  </svg>;
}

function DetailIcon() {
  return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" focusable="false">
    <path d="m7.5 4.5 5.5 5.5-5.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

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
  if (!query.get('status')) query.set('status', 'all');
  const list = useOrganizations(identity, 'organizations?' + query);
  const selectedFilters = selectedOrganizationFilters(params);
  const filterParamsKey = JSON.stringify(organizationFilterKeys.map(key => params.get(key) ?? ''));
  const hasFilterSelectionInUrl = organizationFilterKeys.some(key => !!params.get(key)?.trim());
  const [filterPanel, setFilterPanel] = useState(() => ({ key: filterParamsKey, open: hasFilterSelectionInUrl }));
  const filtersOpen = filterPanel.key === filterParamsKey ? filterPanel.open : filterPanel.open || hasFilterSelectionInUrl;
  if (filterPanel.key !== filterParamsKey) setFilterPanel({ key: filterParamsKey, open: filtersOpen });
  const allStatus = !params.get('status') || params.get('status') === 'all';
  const unfilteredAll = !name.trim() && allStatus && organizationFilterKeys.filter(key => key !== 'status').every(key => !params.get(key)?.trim());

  function change(values: Record<string, string>) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(values)) { if (value.trim()) next.set(key, value); else next.delete(key); }
    setParams(next);
  }

  function clearFilters() {
    const next = new URLSearchParams(params);
    for (const key of organizationFilterKeys) next.delete(key);
    next.set('page', '1');
    setParams(next);
  }

  return <section className="organizations-page">
    <PageHeader eyebrow="Directorio" title="Organizaciones" description="Consulta y administra las organizaciones registradas."
      primaryAction={identity.permissions.includes('directory.write') && <ActionLink appearance="action" className="organizations-create" to="/organizations/new">Crear organización</ActionLink>} />

    <div className="organizations-filter-bar">
      <div className="organizations-toolbar">
        <div className="organizations-search" role="search">
          <div className="organizations-search-input">
            <SearchIcon />
            <Input aria-label="Filtrar organizaciones por nombre" type="search" placeholder="Buscar organización por nombre" className="organizations-search-control" value={name}
              onChange={event => change({ name: event.target.value, page: '1' })} />
          </div>
        </div>
        <Button className="organizations-filter-toggle" aria-expanded={filtersOpen} aria-controls="organization-filters-panel"
          aria-label={selectedFilters.length ? `Filtros, ${selectedFilters.length} ${selectedFilters.length === 1 ? 'activo' : 'activos'}` : 'Filtros'}
          onClick={() => setFilterPanel({ key: filterParamsKey, open: !filtersOpen })}>
          <FiltersIcon /><span>Filtros</span>{selectedFilters.length > 0 && <span className="organizations-filter-count" aria-hidden="true">{selectedFilters.length}</span>}
        </Button>
      </div>
      {selectedFilters.length > 0 && <div className="organizations-active-filters" role="group" aria-label="Filtros aplicados">
        <span className="organizations-filter-summary-label">Filtros aplicados:</span>
        {selectedFilters.map(filter => <span className="organization-filter-chip" key={filter.key}>{filter.label}</span>)}
        <Button variant="ghost" className="organizations-clear-filters" onClick={clearFilters}>Limpiar filtros</Button>
      </div>}
      <div id="organization-filters-panel" className="organizations-filter-panel" role="region" aria-label="Filtros avanzados de organizaciones" hidden={!filtersOpen}>
        <OrganizationFilters identity={identity} params={params} change={change} presentation="modern" />
      </div>
    </div>

    <Surface aria-label="Resultados de organizaciones" className="organizations-results">
      {list.data && <p className="organizations-results-summary" aria-live="polite">
        <strong>{list.data.total} {list.data.total === 1 ? 'organización registrada' : 'organizaciones registradas'}</strong>
        {hasNarrowingFilters(params) && <span> · Resultados filtrados</span>}
      </p>}
      <QueryFeedback pending={list.isPending} pendingMessage="Cargando organizaciones…" error={list.isError} retry={list.refetch} />
      {list.data?.total === 0 && <EmptyState title={unfilteredAll ? 'No hay organizaciones registradas.' : 'No hay organizaciones para estos filtros.'}
        description={unfilteredAll ? undefined : 'Revisa la búsqueda y los filtros seleccionados.'} />}
      {!!list.data?.items.length && <DataList className="organizations-list">{list.data.items.map(row => <DataListItem className="organization-list-item" key={row.id}>
        <div className="organization-row">
          <span className="organization-row-icon"><OrganizationIcon /></span>
          <div className="organization-row-content">
            <div className="organization-row-heading">
              <ActionLink appearance="list" className="organization-detail-link" to={'/organizations/' + row.id}>{row.name}<DetailIcon /></ActionLink>
              <StatusBadge tone={row.isActive ? 'success' : 'neutral'}>{row.isActive ? 'Activa' : 'Inactiva'}</StatusBadge>
            </div>
            <dl className="organization-row-metadata">
              <div className="organization-row-country"><dt>País</dt><dd>{row.country ?? 'País sin registrar'}</dd></div>
              <div className="organization-row-categories"><dt>Categorías</dt><dd>{row.categories.length ? <ul aria-label={`Categorías de ${row.name}`}>
                {row.categories.map(category => <li key={category.id}>{category.name}</li>)}
              </ul> : <span>Sin categorías</span>}</dd></div>
              {row.branchOf && <div className="organization-row-branch"><dt>Sede de</dt><dd>{row.branchOf.name}</dd></div>}
            </dl>
          </div>
        </div>
      </DataListItem>)}</DataList>}
      {list.data && list.data.total > 0 && <Pagination page={page} total={list.data.total} pageSize={list.data.pageSize} onPage={value => change({ page: String(value) })} />}
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
