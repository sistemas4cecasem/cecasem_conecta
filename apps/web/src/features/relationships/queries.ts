import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api/client';
import { AUTH_QUERY_KEY, type AuthIdentity } from '../auth/session';
import { intentSchema, intentsPageSchema } from './contracts';
import { z } from 'zod';
import { processDetailSchema } from './process-contracts';
import { processIdentityKey } from './process-queries';
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
      await client.invalidateQueries({ queryKey: ['relationship-context', identity.id] });
    } });
}
export async function clearForbiddenIntents(client: QueryClient, identity: AuthIdentity | null) {
  const prefix = identity ? intentIdentityKey(identity) : null;
  const predicate = (query: { queryKey: readonly unknown[] }) => query.queryKey[0] === 'relationships' &&
    (!identity?.permissions.includes('relationships.intent.read') || !prefix || prefix.some((value, index) => query.queryKey[index] !== value));
  await client.cancelQueries({ predicate });
  client.removeQueries({ predicate });
}
const conversionSchema = z.object({ intent: intentSchema, process: processDetailSchema });
export function conversionIdentityMatches(client: QueryClient, identity: AuthIdentity): boolean {
  const current = client.getQueryData<AuthIdentity | null>(AUTH_QUERY_KEY);
  return !!current?.permissions.includes('relationships.process.read') &&
    intentIdentityKey(current).every((value, index) => value === intentIdentityKey(identity)[index]) &&
    processIdentityKey(current).every((value, index) => value === processIdentityKey(identity)[index]);
}
export function useIntentConversion(identity: AuthIdentity) {
  const client = useQueryClient();
  return useMutation({ mutationFn: async ({ id, expectedVersion }: { id: string; expectedVersion: number }) => conversionSchema.parse(
    await apiRequest('contact-intents/' + id + '/convert', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedVersion }) })), retry: false,
    onSuccess: async result => {
      if (!conversionIdentityMatches(client, identity)) return;
      client.setQueryData([...intentIdentityKey(identity), 'intent', result.intent.id], result.intent);
      client.setQueryData([...processIdentityKey(identity), 'detail', result.process.id], result.process);
      await Promise.all([client.invalidateQueries({ queryKey: ['relationships', identity.id] }),
        client.invalidateQueries({ queryKey: ['relationship-processes', identity.id] }), client.invalidateQueries({ queryKey: ['relationship-context', identity.id] })]);
    } });
}
