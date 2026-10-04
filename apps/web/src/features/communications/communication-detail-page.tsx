import { Attachments } from '../files/attachments';
import { Link, useParams } from 'react-router';
import { useSession, type AuthIdentity } from '../auth/session';
import { buttonClass, QueryState } from '../directory/directory-ui';
import { communicationIdentityKey, useCommunication } from './queries';
import { useProcess } from '../relationships/process-queries';
import { communicationDate } from './contracts';
import { CommunicationAmendments } from './communication-amendments';
export function CommunicationDetailPage() {
  const identity = useSession().data, { id = '' } = useParams();
  if (!identity?.permissions.includes('communications.read') || !identity.permissions.includes('relationships.process.read')) return <p role="alert">No tienes permiso para consultar comunicaciones.</p>;
  return <CommunicationDetail key={communicationIdentityKey(identity).join(':') + ':' + id} identity={identity} id={id} />;
}
function CommunicationDetail({ identity, id }: { identity: AuthIdentity; id: string }) {
  const detail = useCommunication(identity, id), row = detail.data;
  const process = useProcess(identity, row?.processId ?? '');
  return <section className="min-w-0 w-full space-y-4 break-words"><h1 className="text-2xl font-semibold">{row?.direction === 'RECEIVED' ? 'Comunicación recibida registrada' : 'Comunicación enviada registrada'}</h1>
    <QueryState pending={detail.isPending} error={detail.isError} retry={detail.refetch} />
    {row && <><Link className={buttonClass} to={'/relationship-processes/' + row.processId}>Volver al proceso</Link>
      <p>{row.direction === 'SENT' ? 'Enviada' : 'Recibida'} · {row.validity === 'INVALIDATED' ? 'INVALIDADA' : 'Registro válido'}</p>
      {row.invalidation && <aside className="rounded border border-red-700 p-3"><p>Invalidada por {row.invalidation.author.displayName} · {new Date(row.invalidation.createdAt).toLocaleString('es-BO')}</p><p className="whitespace-pre-wrap">Motivo: {row.invalidation.content}</p></aside>}
      <h2 className="font-semibold">Contenido original registrado</h2>{row.emailAccount && <p>Cuenta utilizada: {row.emailAccount.displayName} · {row.emailAccount.address}</p>}<p>Remitente: {row.sender}</p>
      {row.direction === 'RECEIVED' && process.data?.state === 'CLOSED' && <aside role="status"><p>El proceso está cerrado. Esta respuesta puede requerir reapertura.</p>
        {process.data.canReopen && identity.permissions.includes('relationships.process.reopen') && <Link className={buttonClass} to={'/relationship-processes/' + row.processId + '?action=reopen'}>Reabrir proceso</Link>}</aside>}
      {(['TO', 'CC', 'BCC'] as const).map(type => <div key={type}><h2 className="font-semibold">{type === 'TO' ? 'Para' : type === 'CC' ? 'CC' : 'CCO'}</h2><ul>{row.recipients.filter(item => item.type === type).map(item => <li key={item.position}>{item.addressOriginal}{item.emailAccount && ' · Cuenta CECASEM: ' + item.emailAccount.displayName}</li>)}</ul>{!row.recipients.some(item => item.type === type) && <p>Sin destinatarios</p>}</div>)}
      <h2 className="font-semibold">Asunto</h2><p className="whitespace-pre-wrap">{row.subject}</p>
      <h2 className="font-semibold">Cuerpo original</h2><pre className="whitespace-pre-wrap break-words font-sans">{row.bodyOriginal}</pre>
      <p>{row.direction === 'SENT' ? 'Fecha real de envío' : 'Fecha real de recepción'}: {new Date(communicationDate(row)).toLocaleString('es-BO')}</p><p>Fecha de registro: {new Date(row.createdAt).toLocaleString('es-BO')}</p>
      <p>Registrada por: {row.registeredBy.displayName}{!row.registeredBy.isActive && ' (cuenta inactiva)'}</p><p>El contenido original es histórico y no dispone de edición ordinaria.</p>
      <Attachments identity={identity} resource='communications' resourceId={id} processId={row.processId} blocked={row.validity === 'INVALIDATED'} />
      <CommunicationAmendments identity={identity} row={row} />
    </>}
  </section>;
}
