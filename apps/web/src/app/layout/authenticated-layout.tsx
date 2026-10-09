import { clearForbiddenMeetings } from '../../features/meetings/queries';
import { clearForbiddenOpportunities } from '../../features/opportunities/queries';
import { clearForbiddenNotifications } from '../../features/notifications/queries';
import { NotificationIndicator } from '../../features/notifications/notifications-page';
import { clearForbiddenFiles } from '../../features/files/queries';
import { Navigate, Outlet, useNavigate, useLocation } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ApiError, apiRequest } from '../../lib/api/client';
import { AUTH_QUERY_KEY, useSession } from '../../features/auth/session';
import { ApplicationFrame } from './application-frame';
import { activeNavigationRoute, AUTHENTICATED_NAVIGATION, visibleNavigationItems } from '../router/navigation';
import { ShellNavigation } from './shell-navigation';
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
  if (session.data.mustChangePassword) {
    if (location.pathname !== '/change-password') return <Navigate to="/change-password" replace />;
    return <ApplicationFrame pathname={location.pathname} context="Cambiar contraseña"><Outlet /></ApplicationFrame>;
  }
  const navigationItems = visibleNavigationItems(AUTHENTICATED_NAVIGATION, session.data.permissions);
  const context = navigationItems.find(item => item.to === activeNavigationRoute(location.pathname))?.label
    ?? (location.pathname === '/notifications' ? 'Notificaciones' : 'CECASEM Conecta');
  return <ApplicationFrame pathname={location.pathname} context={context}
    navigation={<ShellNavigation items={navigationItems} pathname={location.pathname} />}
    actions={<div className="shell-account-area">
    {session.data.permissions.includes('notifications.read') && <NotificationIndicator identity={session.data} />}
    <div className="shell-account" role="group" aria-label="Cuenta actual">
    <div className="shell-account-identity"><span>{session.data.givenNames} {session.data.familyNames}</span>
    <span className="shell-account-role">{ROLE_LABELS[session.data.role]}</span></div>
    <button disabled={pending} onClick={() => void logout()} className="shell-account-logout">
      {pending ? 'Cerrando sesión…' : 'Cerrar sesión'}</button>
    </div>
    {error && <p role="alert">{error}</p>}
  </div>}>{notificationReadFailed && <p role="alert">No se pudo confirmar la lectura del aviso. Se actualizará al sincronizar las notificaciones.</p>}<Outlet /></ApplicationFrame>;
}
