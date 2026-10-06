import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api/client';
import type { AuthIdentity } from '../auth/session';
import { categorySchema, historyPageSchema, organizationSchema, pageSchema, personSchema, relationSchema } from './contracts';
import { searchPermissionKey } from './search.contracts';
import { invalidateDashboard } from '../home/dashboard-queries';

// Cada query tiene la identidad y el tipo del contrato en su clave.
export function useOrganizations(identity: AuthIdentity | null | undefined, path: string) {
  return useQuery({ queryKey: ['directory', identity?.id, 'organizations', path, identity?.role, identity ? searchPermissionKey(identity) : ''], enabled: !!identity?.permissions.includes('directory.read'),
    queryFn: async ({ signal }) => pageSchema(organizationSchema).parse(await apiRequest(path, { signal })), retry: false });
}
export function useOrganization(identity: AuthIdentity | null | undefined, id: string) {
  return useQuery({ queryKey: ['directory', identity?.id, 'organization', id], enabled: !!identity?.permissions.includes('directory.read'),
    queryFn: async ({ signal }) => organizationSchema.parse(await apiRequest('organizations/' + id, { signal })), retry: false });
}
export function useCategories(identity: AuthIdentity | null | undefined, path: string) {
  return useQuery({ queryKey: ['directory', identity?.id, 'categories', path], enabled: !!identity?.permissions.includes('directory.read'),
    queryFn: async ({ signal }) => pageSchema(categorySchema).parse(await apiRequest(path, { signal })), retry: false });
}
export function useHistory(identity: AuthIdentity | null | undefined, path: string) {
  return useQuery({ queryKey: ['directory', identity?.id, 'history', path], enabled: !!identity?.permissions.includes('directory.history.read'),
    queryFn: async ({ signal }) => historyPageSchema.parse(await apiRequest(path, { signal })), retry: false });
}
export function usePeople(identity:AuthIdentity|null|undefined,path:string) {
  return useQuery({queryKey:['directory',identity?.id,'people',path],enabled:!!identity?.permissions.includes('directory.read'),
    queryFn:async({signal})=>pageSchema(personSchema).parse(await apiRequest(path,{signal})),retry:false});
}
export function usePerson(identity:AuthIdentity|null|undefined,id:string) {
  return useQuery({queryKey:['directory',identity?.id,'person',id],enabled:!!identity?.permissions.includes('directory.read'),
    queryFn:async({signal})=>personSchema.parse(await apiRequest('people/'+id,{signal})),retry:false});
}
export function usePersonRelations(identity:AuthIdentity|null|undefined,path:string) {
  return useQuery({queryKey:['directory',identity?.id,'relations',path],enabled:!!identity?.permissions.includes('directory.read'),
    queryFn:async({signal})=>pageSchema(relationSchema).parse(await apiRequest(path,{signal})),retry:false});
}
export function useDirectoryMutation(identity: AuthIdentity | null | undefined) {
  const client = useQueryClient();
  return useMutation({ mutationFn: async ({ path, method, body }: { path: string; method: 'POST' | 'PUT' | 'PATCH'; body: object }) =>
    apiRequest(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), retry: false,
    onSuccess: async () => { await client.invalidateQueries({ queryKey: ['directory', identity?.id] }); await client.invalidateQueries({ queryKey: ['relationship-context', identity?.id] }); if (identity) await invalidateDashboard(client, identity); } });
}
export async function clearForbiddenDirectory(client: QueryClient, identity: AuthIdentity | null): Promise<void> {
  const predicate = (query: { queryKey: readonly unknown[] }) => query.queryKey[0] === 'directory' &&
    (!identity || query.queryKey[1] !== identity.id || (['search', 'organizations'].includes(String(query.queryKey[2])) && (query.queryKey[4] !== identity.role || query.queryKey[5] !== searchPermissionKey(identity))) || !identity.permissions.includes(query.queryKey[2] === 'duplicate-preview' ? 'directory.duplicates.manage'
      : ['history', 'verifications'].includes(String(query.queryKey[2])) ? 'directory.history.read' : 'directory.read'));
  await client.cancelQueries({ predicate });
  client.removeQueries({ predicate });
}
