import { useEffect, useRef, useState } from 'react';
import { useSession } from '../auth/session';
import { ApiError } from '../../lib/api/client';

export function useAdministrationAction() {
  const session = useSession();
  const alive = useRef(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function run(operation: () => Promise<void>) {
    setPending(true); setError(null);
    try { await operation(); }
    catch (failure) {
      if (alive.current) setError(failure instanceof ApiError ? failure.message : 'No se pudo completar la operación. Intenta nuevamente.');
      if (failure instanceof ApiError && failure.status === 403) await session.refetch();
    } finally { if (alive.current) setPending(false); }
  }
  return { pending, error, run };
}
