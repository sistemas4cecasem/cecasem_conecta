import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { AUTH_QUERY_KEY, type AuthIdentity } from '../auth/session';
import { apiRequest } from '../../lib/api/client';
import { fileLimitsSchema, filePageSchema } from './contracts';
export const fileIdentityKey = (identity: AuthIdentity) => ['files', identity.id, identity.role, identity.permissions.filter(value => ['files.read', 'files.upload', 'relationships.process.read', 'communications.read'].includes(value)).sort().join(',')] as const;
export function canReadFiles(identity: AuthIdentity, communication = false) { return identity.permissions.includes('files.read') && identity.permissions.includes('relationships.process.read') && (!communication || identity.permissions.includes('communications.read')); }
export function useAttachments(identity: AuthIdentity, path: string, page: number) {
  const client = useQueryClient();
  return useQuery({ queryKey: [...fileIdentityKey(identity), path, page], enabled: canReadFiles(identity, path.startsWith('communications/')),
    queryFn: async ({ signal }) => {
      assertIdentity(client, identity); const response = await apiRequest(path + '?page=' + page + '&pageSize=25', { signal }); assertIdentity(client, identity); return filePageSchema.parse(response);
    }, retry: false });
}
export function useFileLimits(identity: AuthIdentity) {
  const client = useQueryClient();
  return useQuery({ queryKey: [...fileIdentityKey(identity), 'config'], enabled: canReadFiles(identity), queryFn: async ({ signal }) => {
    assertIdentity(client, identity); const response = await apiRequest('files/config', { signal }); assertIdentity(client, identity); return fileLimitsSchema.parse(response);
  }, retry: false });
}
function assertIdentity(client: QueryClient, identity: AuthIdentity) {
  const current = client.getQueryData<AuthIdentity | null>(AUTH_QUERY_KEY);
  if (!current || fileIdentityKey(current).some((value, index) => value !== fileIdentityKey(identity)[index])) throw new DOMException('La identidad cambió.', 'AbortError');
}
export async function clearForbiddenFiles(client: QueryClient, identity: AuthIdentity | null) {
  const prefix = identity ? fileIdentityKey(identity) : null;
  const predicate = (query: { queryKey: readonly unknown[] }) => query.queryKey[0] === 'files' && (!identity || !canReadFiles(identity) || !prefix || prefix.some((value, index) => query.queryKey[index] !== value));
  await client.cancelQueries({ predicate }); client.removeQueries({ predicate });
}
