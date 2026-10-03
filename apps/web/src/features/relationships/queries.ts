import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api/client';
import { AUTH_QUERY_KEY, type AuthIdentity } from '../auth/session';
import { intentSchema, intentsPageSchema } from './contracts';
export function intentIdentityKey(identity: AuthIdentity) {
  return ['relationships', identity.id, identity.role, identity.permissions.filter(p => p.startsWith('relationships.intent.')).sort().join(',')] as const;
}
export function useIntents(identity: AuthIdentity, page: number, state: string) {
  const path = 'contact-intents?' + new URLSearchParams({ page: String(page), state });
  return useQuery({ queryKey: [...intentIdentityKey(identity), 'intents', path], enabled: identity.permissions.includes('relationships.intent.read'),
    queryFn: async ({ signal }) => intentsPageSchema.parse(await apiRequest(path, { signal })), retry: false });
}
export function useIntent(identity: AuthIdentity, id: string) {
  return useQuery({ queryKey: [...intentIdentityKey(identity), 'intent', id], enabled: identity.permissions.includes('relationships.intent.read'),
    queryFn: async ({ signal }) => intentSchema.parse(await apiRequest('contact-intents/' + id, { signal })), retry: false });
}
export function useIntentMutation(identity: AuthIdentity) {
  const client = useQueryClient();
  return useMutation({ mutationFn: async ({ path, body }: { path: string; body: object }) => intentSchema.parse(await apiRequest(path,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })), retry: false,
    onSuccess: async row => {
      const current = client.getQueryData<AuthIdentity | null>(AUTH_QUERY_KEY);
      // Una respuesta tardía no repuebla caché de una sesión/rol ya retirados.
      if (!current || intentIdentityKey(current).some((value, index) => intentIdentityKey(identity)[index] !== value)) return;
      client.setQueryData([...intentIdentityKey(identity), 'intent', row.id], row);
      await client.invalidateQueries({ queryKey: ['relationships', identity.id] });
    } });
}
export async function clearForbiddenIntents(client: QueryClient, identity: AuthIdentity | null) {
  const prefix = identity ? intentIdentityKey(identity) : null;
  const predicate = (query: { queryKey: readonly unknown[] }) => query.queryKey[0] === 'relationships' &&
    (!identity?.permissions.includes('relationships.intent.read') || !prefix || prefix.some((value, index) => query.queryKey[index] !== value));
  await client.cancelQueries({ predicate });
  client.removeQueries({ predicate });
}
