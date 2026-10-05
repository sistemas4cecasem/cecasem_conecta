import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { AUTH_QUERY_KEY, useSession, type AuthIdentity } from '../auth/session';
import { notificationIdentityKey, useNotificationCount, useNotifications, useReadNotification } from './queries';
import type { Notification } from './contracts';

const notificationLabels: Record<Notification['type'], string> = {
  OPPORTUNITY_CREATED:'Nueva oportunidad', OPPORTUNITY_DISCARDED:'Oportunidad descartada', OPPORTUNITY_FINISHED:'Oportunidad finalizada',
  MEETING_CREATED:'Nueva reunión', MEETING_CANCELLED:'Reunión cancelada', MEETING_COMPLETED:'Reunión realizada',
  MEETING_PARTICIPANT_ADDED:'Fuiste incorporado a una reunión', MEETING_RESCHEDULED:'Cambio de planificación de reunión',
};
export function NotificationIndicator({ identity }: { identity: AuthIdentity }) {
  const count = useNotificationCount(identity);
  if (!identity.permissions.includes('notifications.read')) return null;
  return <Link to="/notifications" className="inline-flex min-h-11 items-center gap-2 underline">
    Notificaciones
    {count.data && count.data.count > 0 && <span aria-label={`${count.data.count} notificaciones no leídas`}
      className="rounded-full bg-blue-800 px-2 py-1 text-xs font-semibold text-white">{count.data.count}</span>}
    {count.isError && <span aria-label="No se pudo actualizar el contador">·</span>}
  </Link>;
}

export function NotificationsPage() {
  const session = useSession();
  if (!session.data) return null;
  if (!session.data.permissions.includes('notifications.read')) return <p role="alert">No tienes acceso a las notificaciones.</p>;
  return <NotificationCenter key={notificationIdentityKey(session.data).join(':')} identity={session.data} />;
}
function NotificationCenter({ identity }: { identity: AuthIdentity }) {
  const [status, setStatus] = useState('all');
  const query = useNotifications(identity, status), read = useReadNotification(identity);
  const count = useNotificationCount(identity), navigate = useNavigate(), client = useQueryClient();
  const [opening, setOpening] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function open(row: Notification) {
    setOpening(row.id); setNotice(null);
    let failed = false;
    try { if (!row.readAt) await read.mutateAsync(row.id); }
    catch { failed = true; setNotice('No se pudo confirmar la lectura. El aviso se actualizará al sincronizar.'); }
    finally { setOpening(null); }
    const current = client.getQueryData<AuthIdentity | null>(AUTH_QUERY_KEY);
    if (!current || notificationIdentityKey(identity).some((value, index) => value !== notificationIdentityKey(current)[index])) return;
    navigate(row.meeting ? '/meetings/' + row.meeting.id : '/opportunities/' + row.opportunity.id, { state: { notificationReadFailed: failed } });
  }

  const items = query.data?.pages.flatMap(page => page.items) ?? [];
  return <section className="space-y-5">
    <h1 className="text-2xl font-semibold">Notificaciones</h1>
    <p>Consulta los avisos institucionales dirigidos a tu usuario.</p>
    {count.data && <p aria-live="polite">No leídas: {count.data.count}</p>}
    <label className="flex flex-wrap items-center gap-2">Mostrar
      <select value={status} onChange={event => setStatus(event.target.value)} className="min-h-11 rounded border px-3">
        <option value="all">Todas</option><option value="unread">No leídas</option><option value="read">Leídas</option>
      </select>
    </label>
    {notice && <p role="alert">{notice}</p>}
    {query.isPending && <p role="status">Cargando notificaciones…</p>}
    {query.isError && <div><p role="alert">No se pudieron cargar las notificaciones. Revisa tu conexión.</p>
      <button className="min-h-11 underline" onClick={() => void query.refetch()}>Reintentar</button></div>}
    {query.isSuccess && !items.length && <p>No tienes notificaciones en este listado.</p>}
    <ul className="space-y-3">
      {items.map(row => <li key={row.id} className="space-y-2 break-words rounded border p-4">
        <div className="flex flex-wrap justify-between gap-2"><strong>{notificationLabels[row.type]}</strong>
          <span>{row.readAt ? 'Leída' : 'No leída'}</span></div>
        <p>{row.meeting ? row.meeting.purpose : row.opportunity.name}</p>
        {row.meeting && <p>{new Intl.DateTimeFormat('es-BO',{dateStyle:'medium',timeStyle:'short',timeZone:row.meeting.timezone}).format(new Date(row.meeting.scheduledAt))} · {row.meeting.timezone}</p>}
        <time dateTime={row.createdAt}>{new Date(row.createdAt).toLocaleString('es-BO')}</time>
        <div><button disabled={opening !== null} className="min-h-11 rounded border px-3 py-2"
          onClick={() => void open(row)}>{opening === row.id ? 'Abriendo…' : row.meeting ? 'Abrir reunión' : 'Abrir oportunidad'}</button></div>
      </li>)}
    </ul>
    {query.hasNextPage && <button disabled={query.isFetchingNextPage} className="min-h-11 rounded border px-3 py-2"
      onClick={() => void query.fetchNextPage()}>{query.isFetchingNextPage ? 'Cargando…' : 'Cargar más notificaciones'}</button>}
  </section>;
}
