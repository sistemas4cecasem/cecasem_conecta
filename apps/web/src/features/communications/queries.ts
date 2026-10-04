import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api/client';
import { AUTH_QUERY_KEY, type AuthIdentity } from '../auth/session';
import { accountsSchema, communicationSchema, communicationsPageSchema, type SentBody, type ReceivedBody } from './contracts';
import { amendmentSchema, amendmentsPageSchema } from './amendment-contracts';
export function communicationIdentityKey(identity: AuthIdentity) {
  return ['communications', identity.id, identity.role, identity.permissions.filter(permission => permission.startsWith('communications.') || permission.startsWith('referrals.') || permission === 'relationships.process.read').sort().join(',')] as const;
}
export function communicationIdentityMatches(client: QueryClient, identity: AuthIdentity): boolean {
  const current = client.getQueryData<AuthIdentity | null>(AUTH_QUERY_KEY);
  return !!current && communicationIdentityKey(current).every((value, index) => value === communicationIdentityKey(identity)[index]);
}
export function useAvailableAccounts(identity: AuthIdentity) {
  return useQuery({ queryKey: [...communicationIdentityKey(identity), 'accounts'], enabled: identity.permissions.includes('communications.sent.create') && identity.permissions.includes('relationships.process.read'),
    queryFn: async ({ signal }) => accountsSchema.parse(await apiRequest('me/email-accounts', { signal })), retry: false });
}
export function useCommunication(identity: AuthIdentity, id: string) {
  return useQuery({ queryKey: [...communicationIdentityKey(identity), 'detail', id], enabled: !!id && identity.permissions.includes('communications.read') && identity.permissions.includes('relationships.process.read'),
    queryFn: async ({ signal }) => communicationSchema.parse(await apiRequest('communications/' + id, { signal })), retry: false });
}
export function useCommunications(identity: AuthIdentity, processId: string, page: number) {
  return useQuery({ queryKey: [...communicationIdentityKey(identity), 'list', processId, page], enabled: identity.permissions.includes('communications.read') && identity.permissions.includes('relationships.process.read'),
    queryFn: async ({ signal }) => communicationsPageSchema.parse(await apiRequest('relationship-processes/' + processId + '/communications?page=' + page, { signal })), retry: false });
}
export function useAmendments(identity: AuthIdentity, id: string, page: number) {
  return useQuery({ queryKey: [...communicationIdentityKey(identity), 'amendments', id, page], enabled: identity.permissions.includes('communications.read') && identity.permissions.includes('relationships.process.read'),
    queryFn: async ({ signal }) => amendmentsPageSchema.parse(await apiRequest('communications/' + id + '/amendments?page=' + page, { signal })), retry: false });
}
export function useCommunicationAmendment(identity: AuthIdentity, id: string) {
  const client = useQueryClient();
  return useMutation({ mutationFn: async ({ type, content, requestKey }: { type: 'CORRECTION' | 'ANNOTATION' | 'INVALIDATION'; content: string; requestKey: string }) => amendmentSchema.parse(await apiRequest('communications/' + id + (type === 'INVALIDATION' ? '/invalidate' : '/amendments'),
    { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': requestKey }, body: JSON.stringify(type === 'INVALIDATION' ? { reason: content } : { type, content }) })), retry: false,
    onSuccess: async () => { if (!communicationIdentityMatches(client, identity)) return;
      await Promise.all(['communications', 'relationship-context', 'relationship-timeline', 'relationship-processes'].map(prefix => client.invalidateQueries({ queryKey: [prefix, identity.id] })));
    } });
}
export function useSentCommunication(identity: AuthIdentity) {
  const client = useQueryClient();
  return useMutation({ mutationFn: async ({ processId, body, requestKey }: { processId: string; body: SentBody; requestKey: string }) => communicationSchema.parse(await apiRequest('relationship-processes/' + processId + '/communications/sent',
    { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': requestKey }, body: JSON.stringify(body) })), retry: false,
    onSuccess: async row => {
      if (!communicationIdentityMatches(client, identity)) return;
      client.setQueryData([...communicationIdentityKey(identity), 'detail', row.id], row);
      await Promise.all(['communications', 'relationship-processes', 'relationship-context', 'relationship-timeline'].map(prefix => client.invalidateQueries({ queryKey: [prefix, identity.id] })));
    } });
}
export function useReceivedCommunication(identity: AuthIdentity) {
  const client = useQueryClient();
  return useMutation({ mutationFn: async ({ processId, body, requestKey }: { processId: string; body: ReceivedBody; requestKey: string }) => communicationSchema.parse(await apiRequest('relationship-processes/' + processId + '/communications/received',
    { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': requestKey }, body: JSON.stringify(body) })), retry: false,
    onSuccess: async row => {
      if (!communicationIdentityMatches(client, identity)) return;
      client.setQueryData([...communicationIdentityKey(identity), 'detail', row.id], row);
      await Promise.all(['communications', 'relationship-processes', 'relationship-context', 'relationship-timeline'].map(prefix => client.invalidateQueries({ queryKey: [prefix, identity.id] })));
    } });
}
export async function clearForbiddenCommunications(client: QueryClient, identity: AuthIdentity | null) {
  const prefix = identity ? communicationIdentityKey(identity) : null;
  const predicate = (query: { queryKey: readonly unknown[] }) => query.queryKey[0] === 'communications' &&
    (!identity?.permissions.includes('relationships.process.read') || !prefix || prefix.some((value, index) => query.queryKey[index] !== value)
      || !identity.permissions.includes(query.queryKey[4] === 'accounts' ? 'communications.sent.create' : 'communications.read'));
  await client.cancelQueries({ predicate }); client.removeQueries({ predicate });
}
