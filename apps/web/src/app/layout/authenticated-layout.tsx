import { Navigate, Outlet, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError, apiRequest } from '../../lib/api/client';
import { AUTH_QUERY_KEY, useSession } from '../../features/auth/session';
import { ApplicationFrame } from './application-frame';

export function AuthenticatedLayout() {
  const session = useSession();
  const client = useQueryClient();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function logout() {
    setPending(true); setError(null);
    try {
      await apiRequest('auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      await client.cancelQueries();
      client.clear();
      client.setQueryData(AUTH_QUERY_KEY, null);
      navigate('/login', { replace: true });
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : 'No se pudo cerrar la sesión. Intenta nuevamente.');
    } finally { setPending(false); }
  }

  if (session.isPending) return <ApplicationFrame><p role="status">Comprobando sesión…</p></ApplicationFrame>;
  if (session.isError) return <ApplicationFrame><div><p role="alert">No se pudo comprobar la sesión. Revisa tu conexión.</p>
    <button className="min-h-11 underline" onClick={() => void session.refetch()}>Reintentar</button></div></ApplicationFrame>;
  if (!session.data) return <Navigate to="/login" replace />;
  return <ApplicationFrame actions={<div className="flex flex-wrap items-center gap-3 text-sm">
    <span>{session.data.givenNames} {session.data.familyNames}</span>
    <button disabled={pending} onClick={() => void logout()} className="min-h-11 rounded border px-3 py-2">
      {pending ? 'Cerrando sesión…' : 'Cerrar sesión'}</button>
    {error && <p role="alert">{error}</p>}
  </div>}><Outlet /></ApplicationFrame>;
}
