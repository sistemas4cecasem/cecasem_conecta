import { PageHeader, Surface, FilterBar } from '../../components/ui/layout';
import { FormField, Select } from '../../components/ui/forms';
import { Button } from '../../components/ui/actions';
import { Alert, StatusBadge, QueryFeedback, EmptyState } from '../../components/ui/feedback';
import { DataList, DataListItem, Metadata, LoadMore } from '../../components/ui/lists';
import './notifications.css';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { AUTH_QUERY_KEY, useSession, type AuthIdentity } from '../auth/session';
import { notificationIdentityKey, useNotificationCount, useNotifications, useReadNotification } from './queries';
import type { Notification } from './contracts';

const notificationLabels: Record<Notification['type'], string> = {
  PROCESS_ACHIEVED:'Proceso concretado',
  INTENT_INACTIVITY_REMINDER:'Intención sin actividad', PROCESS_INACTIVITY_REMINDER:'Proceso sin actividad',
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
    navigate(row.process ? '/relationship-processes/' + row.process.id : row.reminder ? (row.reminder.intentId ? '/contact-intents/' + row.reminder.intentId : '/relationship-processes/' + row.reminder.processId)
      : row.meeting ? '/meetings/' + row.meeting.id : '/opportunities/' + row.opportunity!.id, { state: { notificationReadFailed: failed } });
  }

  const items = query.data?.pages.flatMap(page => page.items) ?? [];
  return <section className="notifications-page">
    <PageHeader title="Notificaciones" eyebrow="CECASEM Conecta" description="Consulta los avisos institucionales dirigidos a tu usuario."
      metadata={count.data && <p aria-live="polite" className="ui-description">No leídas: {count.data.count}</p>}/>
    <FilterBar aria-label="Filtros de notificaciones"><FormField label="Mostrar">{control =>
      <Select {...control} value={status} onChange={event => setStatus(event.target.value)}>
        <option value="all">Todas</option><option value="unread">No leídas</option><option value="read">Leídas</option>
      </Select>}</FormField></FilterBar>
    {notice && <Alert tone="warning" role="alert">{notice}</Alert>}
    <QueryFeedback pending={query.isPending} pendingMessage="Cargando notificaciones…" error={query.isError}
      errorMessage="No se pudieron cargar las notificaciones. Revisa tu conexión." retry={() => query.refetch()}/>
    {query.isSuccess && !items.length && <EmptyState title="No tienes notificaciones en este listado."/>}
    {items.length > 0 && <Surface aria-label="Listado de notificaciones"><DataList>
      {items.map(row => <DataListItem key={row.id} className={row.readAt ? 'notification-row' : 'notification-row notification-unread'}>
        <div className="notification-heading"><h2>{notificationLabels[row.type]}</h2>
          <StatusBadge tone={row.readAt ? 'neutral' : 'info'}>{row.readAt ? 'Leída' : 'No leída'}</StatusBadge></div>
        <p>{row.process ? row.process.purpose : row.reminder ? row.reminder.purpose : row.meeting ? row.meeting.purpose : row.opportunity!.name}</p>
        {row.process && <><p>{row.process.context}</p><p>Concretado el {new Date(row.process.occurredAt).toLocaleString('es-BO')}</p></>}
        {row.reminder && <><p>{row.reminder.context}</p><p>Sin actividad desde {new Intl.DateTimeFormat('es-BO',{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'}).format(new Date(row.reminder.inactivityAnchorAt))} UTC · Intervalo: {row.reminder.intervalDays} días</p></>}
        {row.meeting && <p>{new Intl.DateTimeFormat('es-BO',{dateStyle:'medium',timeStyle:'short',timeZone:row.meeting.timezone}).format(new Date(row.meeting.scheduledAt))} · {row.meeting.timezone}</p>}
        <Metadata items={[{label:'Generada',value:<time dateTime={row.createdAt}>{new Date(row.createdAt).toLocaleString('es-BO')}</time>}]}/>
        <div><Button disabled={opening !== null} pending={opening === row.id}
          onClick={() => void open(row)}>{opening === row.id ? 'Abriendo…' : row.process ? 'Abrir proceso' : row.reminder ? row.reminder.intentId ? 'Abrir intención' : 'Abrir proceso' : row.meeting ? 'Abrir reunión' : 'Abrir oportunidad'}</Button></div>
      </DataListItem>)}
    </DataList></Surface>}
    {query.hasNextPage && <LoadMore disabled={query.isFetchingNextPage} pending={query.isFetchingNextPage}
      onClick={() => void query.fetchNextPage()}>{query.isFetchingNextPage ? 'Cargando…' : 'Cargar más notificaciones'}</LoadMore>}
  </section>;
}
