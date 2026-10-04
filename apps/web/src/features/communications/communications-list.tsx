import { useState } from 'react';
import { Link } from 'react-router';
import type { AuthIdentity } from '../auth/session';
import { Pagination, QueryState } from '../directory/directory-ui';
import { communicationDate } from './contracts';
import { useCommunications } from './queries';
export function CommunicationsList({ identity, processId }: { identity: AuthIdentity; processId: string }) {
  const [page, setPage] = useState(1), list = useCommunications(identity, processId, page);
  if (!identity.permissions.includes('communications.read')) return null;
  return <section aria-label="Comunicaciones registradas" className="space-y-3"><h2 className="text-xl font-semibold">Comunicaciones registradas</h2>
    <QueryState pending={list.isPending} error={list.isError} retry={list.refetch} />
    {list.data?.total === 0 && <p>No hay comunicaciones registradas en este proceso.</p>}
    <ul className="space-y-2">{list.data?.items.map(row => <li key={row.id} className="rounded border p-3 break-words"><Link className="underline whitespace-pre-wrap" to={'/communications/' + row.id}>{row.subject}</Link>
      {row.validity === 'INVALIDATED' && <p className="font-semibold">INVALIDADA</p>}<p>{row.direction === 'SENT' ? 'Enviada' : 'Recibida'}: {new Date(communicationDate(row)).toLocaleString('es-BO')} · Registrada: {new Date(row.createdAt).toLocaleString('es-BO')}</p></li>)}</ul>
    {list.data && <Pagination page={page} total={list.data.total} onPage={setPage} />}
  </section>;
}
