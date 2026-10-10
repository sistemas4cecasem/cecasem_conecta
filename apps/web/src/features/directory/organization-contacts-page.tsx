import { Surface } from '../../components/ui/layout';
import { ContactSection } from './contact-section';
import { useOrganizationWorkspace } from './organization-workspace-context';

export function OrganizationContactsPage() {
  const { identity, organization, readOnly } = useOrganizationWorkspace();
  return <Surface className="organization-section-surface"><ContactSection key={organization.id} identity={identity} actorPath={'organizations/' + organization.id}
    readOnly={readOnly} presentation="organization" /></Surface>;
}
