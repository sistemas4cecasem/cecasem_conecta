import { canReadDirectoryHistory } from './directory-permissions';
import { Surface } from '../../components/ui/layout';
import { DirectoryHistory } from './directory-history';
import { useOrganizationWorkspace } from './organization-workspace-context';

export function OrganizationControlPage() {
  const { identity, organization } = useOrganizationWorkspace();
  if (!canReadDirectoryHistory(identity)) return <p role="alert">No tienes permiso para consultar el historial de modificaciones.</p>;
  return <div className="organization-control-layout">
    {canReadDirectoryHistory(identity)&&<Surface className="organization-section-surface">
      <DirectoryHistory modern collapsibleDetails key={organization.id} identity={identity} path={'organizations/'+organization.id+'/history'} hideEmptyPagination />
    </Surface>}
  </div>;
}
