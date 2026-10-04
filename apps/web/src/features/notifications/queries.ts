import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient, type InfiniteData } from '@tanstack/react-query';
import type { z } from 'zod';
import { AUTH_QUERY_KEY, type AuthIdentity } from '../auth/session';
import { apiRequest } from '../../lib/api/client';
import { notificationCountSchema, notificationPageSchema, notificationSchema } from './contracts';

export const notificationIdentityKey = (identity: AuthIdentity) => [identity.id, identity.role, [...identity.permissions].sort().join(',')] as const;
function assertIdentity(client: QueryClient, identity: AuthIdentity): void {
  const current = client.getQueryData<AuthIdentity | null>(AUTH_QUERY_KEY);
  if (!current || notificationIdentityKey(identity).some((value, index) => value !== notificationIdentityKey(current)[index]))
    throw new DOMException('La identidad cambió.', 'AbortError');
}
export function useNotificationCount(identity: AuthIdentity) {
  const client = useQueryClient();
  return useQuery({ queryKey: ['notifications', ...notificationIdentityKey(identity), 'count'],
    enabled: identity.permissions.includes('notifications.read'), retry: false, refetchInterval: 30000,
    queryFn: async ({ signal }) => {
      assertIdentity(client, identity);
      const response = await apiRequest('me/notifications/unread-count', { signal });
      assertIdentity(client, identity);
      return notificationCountSchema.parse(response);
    } });
}
export function useNotifications(identity: AuthIdentity, status: string) {
  const client = useQueryClient();
  return useInfiniteQuery<z.infer<typeof notificationPageSchema>, Error, InfiniteData<z.infer<typeof notificationPageSchema>>, readonly unknown[], string | null>({ queryKey: ['notifications', ...notificationIdentityKey(identity), 'list', status],
    enabled: identity.permissions.includes('notifications.read'), retry: false,
    initialPageParam: null as string | null, getNextPageParam: page => page.nextCursor,
    queryFn: async ({ signal, pageParam }) => {
      assertIdentity(client, identity);
      const response = await apiRequest('me/notifications?pageSize=25&status=' + status +
        (pageParam ? '&after=' + encodeURIComponent(pageParam) : ''), { signal });
      assertIdentity(client, identity);
      return notificationPageSchema.parse(response);
    } });
}
export function useReadNotification(identity: AuthIdentity) {
  const client = useQueryClient();
  return useMutation({ retry: false, mutationFn: async (id: string) => {
    assertIdentity(client, identity);
    if (!identity.permissions.includes('notifications.mark_read')) throw new DOMException('Sin permiso.', 'AbortError');
    const response = await apiRequest('me/notifications/' + id + '/read', { method: 'PATCH',
      headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assertIdentity(client, identity);
    return notificationSchema.parse(response);
  }, onSettled: async () => {
    assertIdentity(client, identity);
    await client.invalidateQueries({ queryKey: ['notifications', ...notificationIdentityKey(identity)] });
  } });
}
export async function clearForbiddenNotifications(client: QueryClient, identity: AuthIdentity | null): Promise<void> {
  const prefix = identity ? notificationIdentityKey(identity) : null;
  const predicate = (query: { queryKey: readonly unknown[] }) => query.queryKey[0] === 'notifications' &&
    (!identity?.permissions.includes('notifications.read') || !prefix || prefix.some((value, index) => value !== query.queryKey[index + 1]));
  await client.cancelQueries({ predicate });
  client.removeQueries({ predicate });
}
