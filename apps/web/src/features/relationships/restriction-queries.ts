import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api/client';
import { AUTH_QUERY_KEY, type AuthIdentity } from '../auth/session';
import type { PickedDirectoryTarget } from '../directory/target-picker';
import { restrictionSchema, restrictionsPageSchema } from './restriction-contracts';
export function restrictionIdentityKey(identity: AuthIdentity) {
  return ['contact-restrictions', identity.id, identity.role, identity.permissions.filter(p => p.startsWith('relationships.restriction.')).sort().join(',')] as const;
}
export function useRestrictions(identity: AuthIdentity, query: { page: number; state: string; organizationId?: string; personId?: string }, enabled = true) {
  const parameters = new URLSearchParams({ page: String(query.page), state: query.state, ...(query.organizationId ? { organizationId: query.organizationId } : {}), ...(query.personId ? { personId: query.personId } : {}) });
  const path = 'contact-restrictions?' + parameters;
  return useQuery({ queryKey: [...restrictionIdentityKey(identity), 'list', path], enabled: enabled && identity.permissions.includes('relationships.restriction.read'),
    queryFn: async ({ signal }) => restrictionsPageSchema.parse(await apiRequest(path, { signal })), retry: false });
}
export function useTargetRestriction(identity: AuthIdentity, target: PickedDirectoryTarget | null) {
  return useRestrictions(identity, { page: 1, state: 'ACTIVE', ...(target ? target.kind === 'ORGANIZATION' ? { organizationId: target.id } : { personId: target.id } : {}) }, !!target);
}
export function useRestriction(identity: AuthIdentity, id: string) {
  return useQuery({ queryKey: [...restrictionIdentityKey(identity), 'detail', id], enabled: identity.permissions.includes('relationships.restriction.read'),
    queryFn: async ({ signal }) => restrictionSchema.parse(await apiRequest('contact-restrictions/' + id, { signal })), retry: false });
}
export function useRestrictionMutation(identity: AuthIdentity) {
  const client = useQueryClient();
  return useMutation({ mutationFn: async ({ path, body }: { path: string; body: object }) => restrictionSchema.parse(await apiRequest(path,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })), retry: false,
    onSuccess: async row => {
      if (!restrictionIdentityMatches(client, identity)) return;
      client.setQueryData([...restrictionIdentityKey(identity), 'detail', row.id], row);
      await Promise.all(['contact-restrictions', 'relationships', 'relationship-processes', 'relationship-context'].map(prefix => client.invalidateQueries({ queryKey: [prefix, identity.id] })));
    } });
}
export function restrictionIdentityMatches(client: QueryClient, identity: AuthIdentity): boolean {
  const current = client.getQueryData<AuthIdentity | null>(AUTH_QUERY_KEY);
  return !!current && restrictionIdentityKey(current).every((value, index) => value === restrictionIdentityKey(identity)[index]);
}
export async function clearForbiddenRestrictions(client: QueryClient, identity: AuthIdentity | null) {
  const prefix = identity ? restrictionIdentityKey(identity) : null;
  const predicate = (query: { queryKey: readonly unknown[] }) => query.queryKey[0] === 'contact-restrictions' &&
    (!identity?.permissions.includes('relationships.restriction.read') || !prefix || prefix.some((value, index) => query.queryKey[index] !== value));
  await client.cancelQueries({ predicate }); client.removeQueries({ predicate });
}
