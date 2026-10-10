import { Surface } from '../../components/ui/layout';
import { PersonRelations } from './person-relations';
import { useOrganizationWorkspace } from './organization-workspace-context';

export function OrganizationPeoplePage() {
  const { identity, organization, readOnly } = useOrganizationWorkspace();
  return <Surface className="organization-section-surface"><PersonRelations key={organization.id} identity={identity} organizationId={organization.id}
    readOnly={readOnly} presentation="organization" /></Surface>;
}
