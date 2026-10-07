import { clearForbiddenMeetings } from '../../features/meetings/queries';
import { clearForbiddenOpportunities } from '../../features/opportunities/queries';
import { clearForbiddenNotifications } from '../../features/notifications/queries';
import { NotificationIndicator } from '../../features/notifications/notifications-page';
import { clearForbiddenFiles } from '../../features/files/queries';
import { Link, Navigate, Outlet, useNavigate, useLocation } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ApiError, apiRequest } from '../../lib/api/client';
import { AUTH_QUERY_KEY, useSession } from '../../features/auth/session';
import { ApplicationFrame } from './application-frame';
import { AUTHENTICATED_NAVIGATION, visibleNavigationItems } from '../router/navigation';
import { clearForbiddenAdministration } from '../../features/users/administration-cache';
import { clearForbiddenDirectory } from '../../features/directory/queries';
import { clearForbiddenIntents } from '../../features/relationships/queries';
import { clearForbiddenProcesses } from '../../features/relationships/process-queries';
import { clearForbiddenRestrictions } from '../../features/relationships/restriction-queries';
import { clearForbiddenContext } from '../../features/relationships/context-queries';
import { clearForbiddenCommunications } from '../../features/communications/queries';
import { clearForbiddenTimeline } from '../../features/relationships/timeline-queries';
import { clearForbiddenDashboard } from '../../features/home/dashboard-queries';

const ROLE_LABELS = { ADMINISTRATOR: 'Administrador', BOARD: 'Directorio', RESEARCH: 'Búsqueda', PLANNING: 'Planificación' };

export function AuthenticatedLayout() {
  const session = useSession();
  const client = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const navigationState: unknown = location.state;
  const notificationReadFailed = navigationState !== null && typeof navigationState === 'object' &&
    'notificationReadFailed' in navigationState && navigationState.notificationReadFailed === true;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (session.data !== undefined) {
      void clearForbiddenAdministration(client, session.data);
      void clearForbiddenDirectory(client, session.data);
      void clearForbiddenIntents(client, session.data);
      void clearForbiddenProcesses(client, session.data);
      void clearForbiddenRestrictions(client, session.data);
      void clearForbiddenContext(client, session.data);
      void clearForbiddenCommunications(client, session.data);
      void clearForbiddenTimeline(client, session.data);
      void clearForbiddenOpportunities(client, session.data);
      void clearForbiddenNotifications(client, session.data);
      void clearForbiddenFiles(client, session.data);
      void clearForbiddenMeetings(client, session.data);
      void clearForbiddenDashboard(client, session.data);
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
  const navigationItems = visibleNavigationItems(AUTHENTICATED_NAVIGATION, session.data.permissions);
  return <ApplicationFrame actions={<div className="mt-3 space-y-3 text-sm">
    <details key={location.pathname} className="lg:hidden">
      <summary className="inline-flex min-h-11 cursor-pointer items-center rounded border border-slate-400 px-3 py-2 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800">Menú principal</summary>
    <NavigationLinks items={navigationItems} pathname={location.pathname} className="mt-2 flex flex-col items-start gap-1 rounded border border-slate-200 p-2" />
    </details>
    <NavigationLinks items={navigationItems} pathname={location.pathname} className="hidden flex-wrap items-center gap-2 lg:flex" />
    <div className="flex flex-wrap items-center gap-3">
    {session.data.permissions.includes('notifications.read') && <NotificationIndicator identity={session.data} />}
    <span>{session.data.givenNames} {session.data.familyNames}</span>
    <span>{ROLE_LABELS[session.data.role]}</span>
    <button disabled={pending} onClick={() => void logout()} className="min-h-11 rounded border px-3 py-2">
      {pending ? 'Cerrando sesión…' : 'Cerrar sesión'}</button>
    {error && <p role="alert">{error}</p>}
    </div>
  </div>}>{notificationReadFailed && <p role="alert">No se pudo confirmar la lectura del aviso. Se actualizará al sincronizar las notificaciones.</p>}<Outlet /></ApplicationFrame>;
}

function NavigationLinks({ items, pathname, className }: { items: ReturnType<typeof visibleNavigationItems>; pathname: string; className: string }) {
  return <nav aria-label="Navegación principal" className={className}>
    {items.map(item => {
      const routeActive = item.to === '/' ? pathname === '/' : pathname === item.to || pathname.startsWith(`${item.to}/`);
      const directoryRouteActive = item.to === '/organizations' && /^\/(?:people|contact-methods|directory\/search)(?:\/|$)/u.test(pathname);
      const active = routeActive || directoryRouteActive;
      return <Link key={item.to} to={item.to} aria-current={active ? 'page' : undefined}
        className={`inline-flex min-h-11 items-center rounded px-2 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800 ${active ? 'bg-slate-100 font-semibold decoration-2' : ''}`}>
        {item.label}
      </Link>;
    })}
  </nav>;
}
