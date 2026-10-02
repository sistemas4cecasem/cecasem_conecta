import { Navigate, NavLink, Outlet, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ApiError, apiRequest } from '../../lib/api/client';
import { AUTH_QUERY_KEY, useSession } from '../../features/auth/session';
import { ApplicationFrame } from './application-frame';
import { AUTHENTICATED_NAVIGATION, visibleNavigationItems } from '../router/navigation';
import { clearForbiddenAdministration } from '../../features/users/administration-cache';
import { clearForbiddenDirectory } from '../../features/directory/queries';

const ROLE_LABELS = { ADMINISTRATOR: 'Administrador', BOARD: 'Directorio', RESEARCH: 'Búsqueda', PLANNING: 'Planificación' };

export function AuthenticatedLayout() {
  const session = useSession();
  const client = useQueryClient();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (session.data !== undefined) {
      void clearForbiddenAdministration(client, session.data);
      void clearForbiddenDirectory(client, session.data);
    }
  }, [client, session.data]);

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
    <nav aria-label="Navegación principal" className="flex flex-wrap items-center gap-3">
      {visibleNavigationItems(AUTHENTICATED_NAVIGATION, session.data.permissions).map(item =>
        <NavLink key={item.to} to={item.to} end className="inline-flex min-h-11 items-center underline">{item.label}</NavLink>)}
    </nav>
    <span>{session.data.givenNames} {session.data.familyNames}</span>
    <span>{ROLE_LABELS[session.data.role]}</span>
    <button disabled={pending} onClick={() => void logout()} className="min-h-11 rounded border px-3 py-2">
      {pending ? 'Cerrando sesión…' : 'Cerrar sesión'}</button>
    {error && <p role="alert">{error}</p>}
  </div>}><Outlet /></ApplicationFrame>;
}
