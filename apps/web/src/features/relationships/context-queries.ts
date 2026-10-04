import { useQuery, type QueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api/client';
import type { AuthIdentity } from '../auth/session';
import type { PickedDirectoryTarget } from '../directory/target-picker';
import { relationshipContextSchema } from './context-contracts';
const contextPermissions = ['directory.read', 'relationships.intent.read', 'relationships.process.read', 'relationships.restriction.read', 'communications.read'];
export const canReadRelationshipContext = (identity: AuthIdentity) => contextPermissions.every(permission => identity.permissions.includes(permission));
export function contextIdentityKey(identity: AuthIdentity) {
  return ['relationship-context', identity.id, identity.role, contextPermissions.filter(permission => identity.permissions.includes(permission)).join(',')] as const;
}
export function useRelationshipContext(identity: AuthIdentity, target: PickedDirectoryTarget | null) {
  const parameters = new URLSearchParams(target ? { [target.kind === 'ORGANIZATION' ? 'organizationId' : 'personId']: target.id } : {});
  return useQuery({ queryKey: [...contextIdentityKey(identity), target?.kind, target?.id], enabled: !!target && canReadRelationshipContext(identity),
    queryFn: async ({ signal }) => relationshipContextSchema.parse(await apiRequest('relationship-context?' + parameters, { signal })), retry: false });
}
export async function clearForbiddenContext(client: QueryClient, identity: AuthIdentity | null) {
  const prefix = identity ? contextIdentityKey(identity) : null;
  const predicate = (query: { queryKey: readonly unknown[] }) => query.queryKey[0] === 'relationship-context' &&
    (!identity || !canReadRelationshipContext(identity) || !prefix || prefix.some((value, index) => query.queryKey[index] !== value));
  await client.cancelQueries({ predicate }); client.removeQueries({ predicate });
}
