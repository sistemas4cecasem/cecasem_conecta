import { useState } from 'react';
import { ActionLink } from '../../components/ui/actions';
import { Surface } from '../../components/ui/layout';
import { DataList, DataListItem, Pagination } from '../../components/ui/lists';
import { EmptyState, QueryFeedback, StatusBadge } from '../../components/ui/feedback';
import type { AuthIdentity } from '../auth/session';
import { communicationDate } from './contracts';
import { useCommunications } from './queries';
export function CommunicationsList({ identity, processId }: { identity: AuthIdentity; processId: string }) {
  const [page, setPage] = useState(1), list = useCommunications(identity, processId, page);
  if (!identity.permissions.includes('communications.read')) return null;
  return <Surface aria-label="Comunicaciones registradas" heading="Comunicaciones registradas" description="Índice de los mensajes registrados. El timeline muestra su relación con los demás hechos del proceso.">
    <QueryFeedback pending={list.isPending} error={list.isError} retry={list.refetch} />
    {list.data?.total === 0 && <EmptyState title="No hay comunicaciones registradas en este proceso." />}
    <DataList>{list.data?.items.map(row => <DataListItem key={row.id}><ActionLink appearance="list" className="whitespace-pre-wrap" to={'/communications/' + row.id}>{row.subject}</ActionLink>
      {row.validity === 'INVALIDATED' && <StatusBadge tone="warning">INVALIDADA</StatusBadge>}<p>{row.direction === 'SENT' ? 'Enviada' : 'Recibida'}: <time dateTime={communicationDate(row)}>{new Date(communicationDate(row)).toLocaleString('es-BO')}</time> · Registrada: <time dateTime={row.createdAt}>{new Date(row.createdAt).toLocaleString('es-BO')}</time></p></DataListItem>)}</DataList>
    {list.data && <Pagination page={page} total={list.data.total} onPage={setPage} />}
  </Surface>;
}
