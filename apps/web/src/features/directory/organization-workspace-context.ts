import { useOutletContext } from 'react-router';
import type { AuthIdentity } from '../auth/session';
import type { Organization } from './contracts';

export interface OrganizationWorkspaceContext {
  identity: AuthIdentity;
  organization: Organization;
  readOnly: boolean;
  addBranch: () => void;
}

export function useOrganizationWorkspace() {
  return useOutletContext<OrganizationWorkspaceContext>();
}
