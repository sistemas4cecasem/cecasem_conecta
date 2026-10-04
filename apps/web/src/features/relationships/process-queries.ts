import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api/client';
import { AUTH_QUERY_KEY, type AuthIdentity } from '../auth/session';
import { processDetailSchema, processEventsPageSchema, processesPageSchema } from './process-contracts';
export function processIdentityKey(identity: AuthIdentity) {
  return ['relationship-processes', identity.id, identity.role, identity.permissions.filter(p => p.startsWith('relationships.process.')).sort().join(',')] as const;
}
export function useProcesses(identity: AuthIdentity, page: number, state: string) {
  const path = 'relationship-processes?' + new URLSearchParams({ page: String(page), state });
  return useQuery({ queryKey: [...processIdentityKey(identity), 'list', path], enabled: identity.permissions.includes('relationships.process.read'),
    queryFn: async ({ signal }) => processesPageSchema.parse(await apiRequest(path, { signal })), retry: false });
}
export function useProcess(identity: AuthIdentity, id: string) {
  return useQuery({ queryKey: [...processIdentityKey(identity), 'detail', id], enabled: !!id && identity.permissions.includes('relationships.process.read'),
    queryFn: async ({ signal }) => processDetailSchema.parse(await apiRequest('relationship-processes/' + id, { signal })), retry: false });
}
export function useProcessEvents(identity: AuthIdentity, id: string, page: number) {
  return useQuery({ queryKey: [...processIdentityKey(identity), 'events', id, page], enabled: page > 1 && identity.permissions.includes('relationships.process.read'),
    queryFn: async ({ signal }) => processEventsPageSchema.parse(await apiRequest('relationship-processes/' + id + '/events?page=' + page, { signal })), retry: false });
}
export function useProcessMutation(identity: AuthIdentity) {
  const client = useQueryClient();
  return useMutation({ mutationFn: async ({ path, body }: { path: string; body: object }) => processDetailSchema.parse(await apiRequest(path,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })), retry: false,
    onSuccess: async row => {
      const current = client.getQueryData<AuthIdentity | null>(AUTH_QUERY_KEY);
      if (!current || processIdentityKey(current).some((value, index) => processIdentityKey(identity)[index] !== value)) return;
      client.setQueryData([...processIdentityKey(identity), 'detail', row.id], row);
      await client.invalidateQueries({ queryKey: ['relationship-processes', identity.id] });
      await client.invalidateQueries({ queryKey: ['relationship-context', identity.id] });
      await client.invalidateQueries({ queryKey: ['relationship-timeline', identity.id] });
    } });
}
export async function clearForbiddenProcesses(client: QueryClient, identity: AuthIdentity | null) {
  const prefix = identity ? processIdentityKey(identity) : null;
  const predicate = (query: { queryKey: readonly unknown[] }) => query.queryKey[0] === 'relationship-processes' &&
    (!identity?.permissions.includes('relationships.process.read') || !prefix || prefix.some((value, index) => query.queryKey[index] !== value));
  await client.cancelQueries({ predicate });
  client.removeQueries({ predicate });
}
