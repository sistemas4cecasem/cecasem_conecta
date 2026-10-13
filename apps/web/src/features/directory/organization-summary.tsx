import { ActionLink, ExternalLink } from '../../components/ui/actions';

import { Surface } from '../../components/ui/layout';
import { Metadata } from '../../components/ui/lists';
import { dateLabel } from './date-label';
import { QueryState } from './directory-ui';
import { useContactAssociations } from './contacts.queries';
import { useOrganizationWorkspace } from './organization-workspace-context';
import { useOrganizations, usePersonRelations } from './queries';

function Metric({ label, value, loading, error, to }: { label: string; value?: number; loading: boolean; error: boolean; to: string }) {
  return <ActionLink appearance="normal" className="organization-summary-metric" to={to}>
    <span>{label}</span><strong>{loading ? 'Cargando…' : error || value === undefined ? 'No disponible' : value.toLocaleString('es-BO')}</strong>
    <span aria-hidden="true">Ver sección →</span>
  </ActionLink>;
}

export function OrganizationSummary() {
  const { identity, organization } = useOrganizationWorkspace();
  const people = usePersonRelations(identity, `organizations/${organization.id}/people?status=all&page=1&pageSize=1`);
  const contacts = useContactAssociations(identity, `organizations/${organization.id}/contacts?page=1&pageSize=1`);
  const branches = useOrganizations(identity, `organizations/${organization.id}/branches?status=all&page=1&pageSize=1`);
  return <div className="organization-summary-layout">
    <Surface heading="Información institucional" className="organization-detail-summary">
      <Metadata layout="grid" items={[
        { label: 'Sigla o nombre alternativo', value: organization.alias ?? 'Sin dato' },
        { label: 'País', value: organization.country ?? 'Sin dato' },
        { label: 'Descripción', value: organization.description ?? 'Sin dato', wide: true },
        { label: 'Sitio web oficial', wide: true, value: organization.officialWebsite
          ? <ExternalLink href={organization.officialWebsite} target="_blank" rel="noreferrer">{organization.officialWebsite}</ExternalLink> : 'Sin dato' },
        ...(organization.branchOf ? [{ label: 'Organización referente', value: <ActionLink to={'/organizations/' + organization.branchOf.id}>{organization.branchOf.name}</ActionLink> }] : []),
        { label: 'Categorías', wide: true, value: organization.categories.map(category => category.name + (category.isActive ? '' : ' (inactiva)')).join(', ') || 'Sin categorías' },
        { label: 'Creación', value: <time dateTime={organization.createdAt}>{dateLabel(organization.createdAt)}</time> },
        { label: 'Última modificación', value: <time dateTime={organization.updatedAt}>{dateLabel(organization.updatedAt)}</time> },
      ]} />
    </Surface>

    <section className="organization-summary-metrics" aria-label="Registros relacionados">
      <Metric label="Vínculos personales" value={people.data?.total} loading={people.isPending} error={people.isError} to="people" />
      <Metric label="Medios de contacto" value={contacts.data?.total} loading={contacts.isPending} error={contacts.isError} to="contacts" />
      <Metric label="Sedes y representaciones" value={branches.data?.total} loading={branches.isPending} error={branches.isError} to="locations" />
      {people.isError && <QueryState pending={false} error failure={people.error} retry={people.refetch} />}
      {contacts.isError && <QueryState pending={false} error failure={contacts.error} retry={contacts.refetch} />}
      {branches.isError && <QueryState pending={false} error failure={branches.error} retry={branches.refetch} />}
    </section>
  </div>;
}
