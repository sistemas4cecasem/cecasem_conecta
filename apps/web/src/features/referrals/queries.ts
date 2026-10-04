import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api/client';
import { AUTH_QUERY_KEY, type AuthIdentity } from '../auth/session';
import { communicationIdentityKey, communicationIdentityMatches } from '../communications/queries';
import { referralSchema, referralsPageSchema, type referralBody } from './contracts';
export function useReferrals(identity: AuthIdentity, id: string, page: number) {
  const client = useQueryClient();
  return useQuery({ queryKey: [...communicationIdentityKey(identity), 'referrals', identity.permissions.includes('referrals.read'), id, page],
    enabled: identity.permissions.includes('referrals.read'), retry: false,
    queryFn: async ({ signal }) => {
      const data = referralsPageSchema.parse(await apiRequest('communications/' + id + '/referrals?page=' + page, { signal }));
      if (!communicationIdentityMatches(client, identity) || !client.getQueryData<AuthIdentity>(AUTH_QUERY_KEY)?.permissions.includes('referrals.read')) throw new Error('La sesión cambió.');
      return data;
    } });
}
export function useCreateReferral(identity: AuthIdentity, id: string) {
  const client = useQueryClient();
  return useMutation({ retry: false, mutationFn: async ({ body, key }: { body: ReturnType<typeof referralBody>; key: string }) => {
    if (!communicationIdentityMatches(client, identity) || !client.getQueryData<AuthIdentity>(AUTH_QUERY_KEY)?.permissions.includes('referrals.create')) throw new Error('La sesión cambió.');
    return referralSchema.parse(await apiRequest('communications/' + id + '/referrals', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify(body) }));
  }, onSuccess: async () => {
    if (!communicationIdentityMatches(client, identity)) return;
    await Promise.all(['communications', 'relationship-timeline'].map(prefix => client.invalidateQueries({ queryKey: [prefix, identity.id] })));
  } });
}
