import { ActionLink, ExternalLink } from '../../components/ui/actions';

import { Surface } from '../../components/ui/layout';
import { Metadata } from '../../components/ui/lists';
import { dateLabel } from './date-label';
import { QueryState } from './directory-ui';
import { useContactAssociations } from './contacts.queries';
import { useOrganizationWorkspace } from './organization-workspace-context';
import { useOrganizations, usePersonRelations } from './queries';

function Metric({ label, value, loading, error }: { label: string; value?: number; loading: boolean; error: boolean }) {
  return <dl className="organization-summary-metric">
    <dt>{label}</dt><dd>{loading ? 'Cargando…' : error || value === undefined ? 'No disponible' : value.toLocaleString('es-BO')}</dd>
  </dl>;
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
        { label: 'Áreas de interés', wide: true, value: organization.interestAreas.length ? <ul className="organization-interest-areas" aria-label="Áreas de interés de la organización">
          {organization.interestAreas.map(area => <li key={area}>{area}</li>)}
        </ul> : 'Sin áreas de interés' },
        { label: 'Creación', value: <time dateTime={organization.createdAt}>{dateLabel(organization.createdAt)}</time> },
        { label: 'Última modificación', value: <time dateTime={organization.updatedAt}>{dateLabel(organization.updatedAt)}</time> },
      ]} />
    </Surface>

    <section className="organization-summary-metrics" aria-label="Registros relacionados">
      <Metric label="Empleados identificados" value={people.data?.total} loading={people.isPending} error={people.isError} />
      <Metric label="Medios de contacto" value={contacts.data?.total} loading={contacts.isPending} error={contacts.isError} />
      <Metric label="Sedes" value={branches.data?.total} loading={branches.isPending} error={branches.isError} />
      {people.isError && <QueryState pending={false} error failure={people.error} retry={people.refetch} />}
      {contacts.isError && <QueryState pending={false} error failure={contacts.error} retry={contacts.refetch} />}
      {branches.isError && <QueryState pending={false} error failure={branches.error} retry={branches.refetch} />}
    </section>
  </div>;
}
