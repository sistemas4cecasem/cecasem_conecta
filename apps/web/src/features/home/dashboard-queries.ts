import { useQuery } from '@tanstack/react-query';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api/client';
import { AUTH_QUERY_KEY, type AuthIdentity } from '../auth/session';
import { dashboardSchema } from './dashboard-contract';

export const dashboardIdentityKey = (identity: AuthIdentity) => ['dashboard', identity.id, identity.role, [...identity.permissions].sort().join(',')] as const;

function assertCurrentIdentity(client: QueryClient, identity: AuthIdentity) {
  const current = client.getQueryData<AuthIdentity | null>(AUTH_QUERY_KEY);
  if (!current || dashboardIdentityKey(current).some((value, index) => value !== dashboardIdentityKey(identity)[index]))
    throw new DOMException('La sesión cambió.', 'AbortError');
}

export function useDashboard(identity: AuthIdentity) {
  const client = useQueryClient();
  return useQuery({ queryKey: dashboardIdentityKey(identity), enabled: identity.permissions.includes('relationships.process.read'), staleTime: 60_000,
    refetchOnWindowFocus: true, retry: false, queryFn: async ({ signal }) => {
      assertCurrentIdentity(client, identity);
      const data = await apiRequest('dashboard', { signal });
      assertCurrentIdentity(client, identity);
      return dashboardSchema.parse(data);
    } });
}

export function invalidateDashboard(client: QueryClient, identity: AuthIdentity) {
  return client.invalidateQueries({ queryKey: ['dashboard', identity.id] });
}

export async function clearForbiddenDashboard(client: QueryClient, identity: AuthIdentity | null) {
  const prefix = identity ? dashboardIdentityKey(identity) : null;
  const predicate = (query: { queryKey: readonly unknown[] }) => query.queryKey[0] === 'dashboard' &&
    (!identity?.permissions.includes('relationships.process.read') || !prefix || prefix.some((value, index) => value !== query.queryKey[index]));
  await client.cancelQueries({ predicate });
  client.removeQueries({ predicate });
}
