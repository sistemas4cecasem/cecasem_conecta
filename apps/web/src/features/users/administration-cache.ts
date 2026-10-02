import type { Query, QueryClient } from '@tanstack/react-query';
import type { AuthIdentity } from '../auth/session';
import { hasPermission } from '../auth/permissions';

export function forbiddenAdministrationQuery(query: Pick<Query, 'queryKey'>, identity: AuthIdentity | null): boolean {
  const key = query.queryKey;
  if (key[0] !== 'users' && key[0] !== 'email-accounts') return false;
  if (!identity || key[1] !== identity.id) return true;
  if (key[0] === 'email-accounts' || key.at(-1) === 'email-accounts') return !hasPermission(identity.permissions, 'users.mailboxes.manage');
  return !hasPermission(identity.permissions, 'users.read') ||
    (key[2] !== 'active' && !hasPermission(identity.permissions, 'users.deactivated.read'));
}

export async function clearForbiddenAdministration(client: QueryClient, identity: AuthIdentity | null) {
  const predicate = (query: Query) => forbiddenAdministrationQuery(query, identity);
  await client.cancelQueries({ predicate });
  client.removeQueries({ predicate });
}
