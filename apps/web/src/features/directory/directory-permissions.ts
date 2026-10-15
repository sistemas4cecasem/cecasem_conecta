import type { AuthIdentity } from '../auth/session';

export function canReadDirectoryHistory(identity: AuthIdentity | null | undefined): boolean {
  return identity?.role === 'ADMINISTRATOR' && identity.permissions.includes('directory.history.read');
}
