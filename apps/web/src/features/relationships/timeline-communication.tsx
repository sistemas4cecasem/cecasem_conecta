import { useId, useState } from 'react';
import type { AuthIdentity } from '../auth/session';
import { useCommunication } from '../communications/queries';
import { ActionLink, Button } from '../../components/ui/actions';
import { QueryFeedback, StatusBadge } from '../../components/ui/feedback';
import { iconCatalog } from '../../components/ui/icons';
import type { TimelineItem } from './timeline-contracts';

type CommunicationItem = Extract<TimelineItem, { kind: 'SENT_COMMUNICATION' | 'RECEIVED_COMMUNICATION' }>;
export function TimelineCommunication({ identity, item }: { identity: AuthIdentity; item: CommunicationItem }) {
  const [expanded, setExpanded] = useState(false), bodyId = useId();
  const query = useCommunication(identity, item.payload.communicationId, expanded);
  const sent = item.kind === 'SENT_COMMUNICATION', Icon = sent ? iconCatalog.action.sent : iconCatalog.action.received;
  const recipients = expanded && query.data ? query.data.recipients : item.payload.recipients;
  return <article className={'process-exchange process-exchange-' + (sent ? 'sent' : 'received')}>
    <div className="process-entry-heading"><h3><Icon size={18} aria-hidden="true" />{sent ? 'Comunicación enviada' : 'Comunicación recibida'}</h3>
      {item.payload.validity === 'INVALIDATED' && <StatusBadge tone="warning">INVALIDADA</StatusBadge>}</div>
    <p className="process-timeline-subject">{item.payload.subject}</p>
    <p><span className="process-field-label">Remitente:</span> {item.payload.sender}</p>
    <p className="process-recipients"><span className="process-field-label">Destinatarios:</span> {recipients.map(recipient => (recipient.type === 'TO' ? 'Para' : recipient.type === 'BCC' ? 'CCO' : 'CC') + ': ' + recipient.addressOriginal).join(' · ') || 'Sin destinatarios disponibles'}</p>
    {item.payload.recipientTotal > recipients.length && <p className="process-timeline-fact">Se muestran {recipients.length} de {item.payload.recipientTotal} destinatarios; expande el contenido para consultar todos.</p>}
    <div className="process-exchange-provenance">
      <p>{sent ? 'Fecha efectiva de envío' : 'Fecha efectiva de recepción'}: <time dateTime={item.occurredAt}>{new Date(item.occurredAt).toLocaleString('es-BO')}</time></p>
      <p>Registrador: {item.actor.displayName}{!item.actor.isActive && ' (cuenta inactiva)'} · Registro en CECASEM Conecta: <time dateTime={item.registeredAt}>{new Date(item.registeredAt).toLocaleString('es-BO')}</time></p>
    </div>
    {item.payload.validity === 'INVALIDATED' && <p className="process-timeline-fact">Se conserva el original. Consulta el acontecimiento de invalidación o el detalle para ver su motivo.</p>}
    {!expanded && query.data && <p className="process-body-excerpt">{query.data.bodyOriginal.slice(0, 240).replace(/\s+/g, ' ').trim()}{query.data.bodyOriginal.length > 240 && '…'}</p>}
    <div className="ui-actions process-exchange-actions"><Button variant="outline" aria-expanded={expanded} aria-controls={bodyId} onClick={() => setExpanded(value => !value)}>{expanded ? 'Contraer contenido' : 'Consultar contenido'}</Button>
      <ActionLink appearance="context" to={'/communications/' + item.payload.communicationId}>Ver detalle de comunicación</ActionLink></div>
    <div id={bodyId} hidden={!expanded}>
      {expanded && <><QueryFeedback pending={query.isPending} pendingMessage="Cargando contenido original…" error={query.isError} errorMessage="No se pudo cargar el contenido original. Puedes volver a intentar." retry={query.refetch} />
        {query.data && <div className="process-original-body"><h4>Cuerpo original registrado</h4><pre>{query.data.bodyOriginal}</pre></div>}
        <p className="process-timeline-fact">El detalle conserva las correcciones, observaciones y evidencias. Este es un registro manual del correo externo.</p></>}
    </div>
  </article>;
}
