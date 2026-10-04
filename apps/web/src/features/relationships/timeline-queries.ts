import { useInfiniteQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api/client';
import { AUTH_QUERY_KEY, type AuthIdentity } from '../auth/session';
import { timelineItemSchema, timelinePageSchema } from './timeline-contracts';
const permissions = ['relationships.process.read', 'communications.read', 'relationships.note.create'];
export const canReadTimeline = (identity: AuthIdentity) => ['relationships.process.read', 'communications.read'].every(permission => identity.permissions.includes(permission));
export const timelineIdentityKey = (identity: AuthIdentity) => ['relationship-timeline', identity.id, identity.role, permissions.filter(permission => identity.permissions.includes(permission)).join(',')] as const;
export function useTimeline(identity: AuthIdentity, processId: string) {
  return useInfiniteQuery({ queryKey: [...timelineIdentityKey(identity), processId], enabled: !!processId && canReadTimeline(identity), initialPageParam: null as string | null,
    queryFn: async ({ pageParam, signal }) => {
      const query = new URLSearchParams({ pageSize: '25', ...(pageParam ? { after: pageParam } : {}) });
      return timelinePageSchema.parse(await apiRequest('relationship-processes/' + processId + '/timeline?' + query, { signal }));
    }, getNextPageParam: page => page.nextCursor, retry: false });
}
export function useInternalNote(identity: AuthIdentity, processId: string) {
  const client = useQueryClient();
  return useMutation({ mutationFn: async (body: string) => timelineItemSchema.parse(await apiRequest('relationship-processes/' + processId + '/notes',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body }) })), retry: false,
    onSuccess: async () => {
      const current = client.getQueryData<AuthIdentity | null>(AUTH_QUERY_KEY);
      if (!current || timelineIdentityKey(current).some((value, index) => timelineIdentityKey(identity)[index] !== value)) return;
      await client.invalidateQueries({ queryKey: [...timelineIdentityKey(identity), processId] });
    } });
}
export async function clearForbiddenTimeline(client: QueryClient, identity: AuthIdentity | null) {
  const prefix = identity ? timelineIdentityKey(identity) : null;
  const predicate = (query: { queryKey: readonly unknown[] }) => query.queryKey[0] === 'relationship-timeline' &&
    (!identity || !canReadTimeline(identity) || !prefix || prefix.some((value, index) => query.queryKey[index] !== value));
  await client.cancelQueries({ predicate }); client.removeQueries({ predicate });
}
