import { Attachments } from '../files/attachments';
import { CommunicationTranslation } from './communication-translation';
import { ReferralsPanel } from '../referrals/referrals-panel';
import { useParams } from 'react-router';
import { useSession, type AuthIdentity } from '../auth/session';
import { ActionLink } from '../../components/ui/actions';
import { PageHeader, Surface } from '../../components/ui/layout';
import { Alert, QueryFeedback, StatusBadge } from '../../components/ui/feedback';
import { Metadata } from '../../components/ui/lists';
import '../relationships/process-detail.css';
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
  return <section className="communication-detail">
    <PageHeader eyebrow="Relaciones / Comunicaciones" title={row?.direction === 'RECEIVED' ? 'Comunicación recibida registrada' : 'Comunicación enviada registrada'}
      description={row && <span className="whitespace-pre-wrap">{row.subject}</span>}
      metadata={row && <p>{row.direction === 'SENT' ? 'Enviada' : 'Recibida'} · <StatusBadge tone={row.validity === 'INVALIDATED' ? 'warning' : 'neutral'}>{row.validity === 'INVALIDATED' ? 'INVALIDADA' : 'Registro válido'}</StatusBadge></p>}
      actions={row && <><ActionLink appearance="context" to={'/relationship-processes/' + row.processId}>Volver al proceso</ActionLink>
        {identity.permissions.includes('opportunities.create') && <ActionLink appearance="context" to={'/opportunities/new?processId=' + row.processId + '&communicationId=' + row.id}>Crear oportunidad desde esta comunicación</ActionLink>}</>} />
    <QueryFeedback pending={detail.isPending} error={detail.isError} retry={detail.refetch} />
    {row && <>
      {row.invalidation && <Alert tone="warning"><p>Invalidada por {row.invalidation.author.displayName} · <time dateTime={row.invalidation.createdAt}>{new Date(row.invalidation.createdAt).toLocaleString('es-BO')}</time></p><p className="whitespace-pre-wrap">Motivo: {row.invalidation.content}</p></Alert>}
      <Surface heading="Contenido original registrado" className="communication-original">
      <Metadata items={[
        { label: row.direction === 'SENT' ? 'Fecha real de envío' : 'Fecha real de recepción', value: <time dateTime={communicationDate(row)}>{new Date(communicationDate(row)).toLocaleString('es-BO')}</time> },
        { label: 'Fecha de registro', value: <time dateTime={row.createdAt}>{new Date(row.createdAt).toLocaleString('es-BO')}</time> },
      ]} />
      {row.emailAccount && <p>Cuenta utilizada: {row.emailAccount.displayName} · {row.emailAccount.address}</p>}<p>Remitente: {row.sender}</p>
      {row.direction === 'RECEIVED' && process.data?.state === 'CLOSED' && <Alert tone="neutral" role="status"><p>El proceso está cerrado. Esta respuesta puede requerir reapertura.</p>
        {process.data.canReopen && identity.permissions.includes('relationships.process.reopen') && <ActionLink appearance="context" to={'/relationship-processes/' + row.processId + '?action=reopen'}>Reabrir proceso</ActionLink>}</Alert>}
      {(['TO', 'CC', 'BCC'] as const).map(type => <div key={type}><h3 className="font-semibold">{type === 'TO' ? 'Para' : type === 'CC' ? 'CC' : 'CCO'}</h3><ul>{row.recipients.filter(item => item.type === type).map(item => <li key={item.position}>{item.addressOriginal}{item.emailAccount && ' · Cuenta CECASEM: ' + item.emailAccount.displayName}</li>)}</ul>{!row.recipients.some(item => item.type === type) && <p>Sin destinatarios</p>}</div>)}
      <h3 className="font-semibold">Cuerpo original</h3><pre className="whitespace-pre-wrap break-words font-sans">{row.bodyOriginal}</pre>
      <CommunicationTranslation identity={identity} id={id} body={row.bodyOriginal} />
      <p>Registrada por: {row.registeredBy.displayName}{!row.registeredBy.isActive && ' (cuenta inactiva)'}</p><Alert tone="neutral">El contenido original es histórico y no dispone de edición ordinaria.</Alert>
      </Surface>
      <Attachments modern identity={identity} resource='communications' resourceId={id} processId={row.processId} blocked={row.validity === 'INVALIDATED'} />
      <CommunicationAmendments identity={identity} row={row} />
      {identity.permissions.includes('referrals.read') && <ReferralsPanel identity={identity} row={row} />}
    </>}
  </section>;
}
