import { queryOptions, useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { ApiError, apiRequest } from '../../lib/api/client';

export const AUTH_QUERY_KEY = ['auth', 'me'] as const;
export const identitySchema = z.object({ id: z.string(), givenNames: z.string(), familyNames: z.string(),
  username: z.string(), email: z.string(), role: z.enum(['ADMINISTRATOR', 'BOARD', 'RESEARCH', 'PLANNING']),
  permissions: z.array(z.string()) });
export type AuthIdentity = z.infer<typeof identitySchema>;

export const sessionQueryOptions = queryOptions({
  queryKey: AUTH_QUERY_KEY,
  queryFn: async ({ signal }): Promise<AuthIdentity | null> => {
    try { return identitySchema.parse(await apiRequest('auth/me', { signal })); }
    catch (error) {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    }
  },
  retry: false,
  staleTime: 0,
});
export const useSession = () => useQuery(sessionQueryOptions);
