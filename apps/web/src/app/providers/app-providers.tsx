import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { createQueryClient } from '../../lib/query/query-client';
import { AUTH_QUERY_KEY } from '../../features/auth/session';

interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  const [queryClient] = useState(createQueryClient);
  useEffect(() => {
    const invalidateIdentity = () => {
      void queryClient.cancelQueries();
      // Conservar la query observada de identidad para notificar a los layouts.
      queryClient.removeQueries({ predicate: (query) =>
        query.queryKey[0] !== AUTH_QUERY_KEY[0] || query.queryKey[1] !== AUTH_QUERY_KEY[1] });
      queryClient.setQueryData(AUTH_QUERY_KEY, null);
    };
    window.addEventListener('cecasem:unauthorized', invalidateIdentity);
    return () => window.removeEventListener('cecasem:unauthorized', invalidateIdentity);
  }, [queryClient]);
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
