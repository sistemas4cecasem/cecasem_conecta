import { Surface } from '../../components/ui/layout';
import { DuplicatePanel } from './duplicate-panel';
import { DirectoryHistory } from './directory-history';
import { useOrganizationWorkspace } from './organization-workspace-context';

export function OrganizationControlPage() {
  const { identity, organization } = useOrganizationWorkspace();
  return <div className="organization-control-layout">
    <Surface className="organization-section-surface"><DuplicatePanel key={organization.id} identity={identity} actorPath={'organizations/'+organization.id} hideEmptyPagination /></Surface>
    {identity.permissions.includes('directory.history.read')&&<Surface className="organization-section-surface">
      <DirectoryHistory modern collapsibleDetails key={organization.id} identity={identity} path={'organizations/'+organization.id+'/history'} hideEmptyPagination />
    </Surface>}
  </div>;
}
