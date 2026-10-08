import { MeetingEventContent } from '../meetings/meeting-components';
import { useForm } from 'react-hook-form';
import { ReferralContent } from '../referrals/referrals-panel';
import { zodResolver } from '@hookform/resolvers/zod';
import type { AuthIdentity } from '../auth/session';
import { MutationError } from '../directory/directory-ui';
import { PROCESS_STATE_LABELS, PROCESS_RESULT_LABELS } from './process-contracts';
import { noteFormSchema, type TimelineItem } from './timeline-contracts';
import { canReadTimeline, useInternalNote, useTimeline } from './timeline-queries';
import { ActionLink, Button } from '../../components/ui/actions';
import { LoadMore } from '../../components/ui/lists';
import { FormField, FormSection, FormActions, Textarea } from '../../components/ui/forms';
import { EmptyState, Alert } from '../../components/ui/feedback';
import './process-detail.css';
const eventLabels = { FILES_ATTACHED: 'Adjuntos incorporados', PROCESS_CREATED: 'Proceso iniciado', PROCESS_STATE_CHANGED: 'Cambio de estado', PROCESS_CLOSED: 'Proceso cerrado', PROCESS_REOPENED: 'Proceso reabierto', COMMUNICATION_CORRECTED: 'Corrección añadida', COMMUNICATION_ANNOTATED: 'Observación añadida', COMMUNICATION_INVALIDATED: 'Comunicación invalidada' };
function TimelineEntry({ item }: { item: TimelineItem }) {
  if (item.kind === 'MEETING_ACTIVITY') return <li className="process-timeline-entry"><p>Fecha del hecho: <time dateTime={item.occurredAt}>{new Date(item.occurredAt).toLocaleString('es-BO')}</time></p><p>Autor: {item.actor.displayName}{!item.actor.isActive && ' (cuenta inactiva)'} · Registro en CECASEM Conecta: <time dateTime={item.registeredAt}>{new Date(item.registeredAt).toLocaleString('es-BO')}</time></p><MeetingEventContent event={item.payload} /><ActionLink appearance="context" to={'/meetings/' + item.payload.meetingId}>Ver reunión</ActionLink></li>;
  if (item.kind === 'REFERRAL_CREATED') return <li className="process-timeline-entry"><h3 className="font-semibold">CONTACTO RECOMENDADO</h3><p>Fecha del hecho: <time dateTime={item.occurredAt}>{new Date(item.occurredAt).toLocaleString('es-BO')}</time></p><p>Autor: {item.actor.displayName}{!item.actor.isActive && ' (cuenta inactiva)'} · Registro en CECASEM Conecta: <time dateTime={item.registeredAt}>{new Date(item.registeredAt).toLocaleString('es-BO')}</time></p><ReferralContent row={item.payload.referral} /><ActionLink appearance="context" to={'/communications/' + item.payload.communicationId}>Ver comunicación de origen</ActionLink></li>;
  const sent = item.kind === 'SENT_COMMUNICATION', received = item.kind === 'RECEIVED_COMMUNICATION';
  const title = sent ? 'ENVIADA' : received ? 'RECIBIDA' : item.kind === 'INTERNAL_NOTE' ? 'NOTA INTERNA' : eventLabels[item.kind as keyof typeof eventLabels];
  return <li className={'process-timeline-entry' + (item.kind === 'INTERNAL_NOTE' ? ' process-timeline-note' : '')}>
    <h3 className="font-semibold">{title}</h3>
    <p>Fecha del hecho: <time dateTime={item.occurredAt}>{new Date(item.occurredAt).toLocaleString('es-BO')}</time></p>
    <p>{sent || received ? 'Registrador' : 'Autor'}: {item.actor.displayName}{!item.actor.isActive && ' (cuenta inactiva)'}</p>
    <p>Registro en CECASEM Conecta: <time dateTime={item.registeredAt}>{new Date(item.registeredAt).toLocaleString('es-BO')}</time></p>
    {'uploadId' in item.payload ? <><p>{item.payload.meetingId ? 'Documentación de reunión.' : item.payload.communicationId ? 'Incorporación posterior; no forma parte del mensaje original registrado.' : 'Adjuntos del proceso.'}</p><ul>{item.payload.names.map((name, index) => <li key={index}>{name}</li>)}</ul>{item.payload.meetingId ? <ActionLink appearance="context" to={'/meetings/' + item.payload.meetingId + '#adjuntos'}>Consultar documentación de reunión</ActionLink> : item.payload.communicationId ? <ActionLink appearance="context" to={'/communications/' + item.payload.communicationId}>Consultar adjuntos</ActionLink> : <a className="ui-link ui-link-context" href='#adjuntos'>Consultar adjuntos</a>}</> : 'amendmentId' in item.payload ? <><p className="whitespace-pre-wrap">{item.payload.content}</p><ActionLink appearance="context" to={'/communications/' + item.payload.communicationId}>Ver comunicación original</ActionLink></> : 'communicationId' in item.payload ? <>
      {item.payload.validity === 'INVALIDATED' && <aside><p className="font-semibold">INVALIDADA</p>{item.payload.invalidation && <><p>Invalidada posteriormente por {item.payload.invalidation.author.displayName} · {new Date(item.payload.invalidation.createdAt).toLocaleString('es-BO')}</p><p className="whitespace-pre-wrap">Motivo: {item.payload.invalidation.content}</p></>}</aside>}
      <p className="font-medium whitespace-pre-wrap">{item.payload.subject}</p><p>Remitente: {item.payload.sender}</p>
      <p>Destinatarios: {item.payload.recipients.map(recipient => (recipient.type === 'TO' ? 'Para' : recipient.type === 'BCC' ? 'CCO' : 'CC') + ': ' + recipient.addressOriginal).join(' · ')}</p>
      {item.payload.recipientTotal > item.payload.recipients.length && <p>Se muestran {item.payload.recipients.length} de {item.payload.recipientTotal} destinatarios; el detalle conserva todos.</p>}
      <ActionLink appearance="context" to={'/communications/' + item.payload.communicationId}>Ver detalle de comunicación</ActionLink>
    </> : 'noteId' in item.payload ? <><p>Contexto interno; no es una comunicación enviada ni recibida.</p><p className="whitespace-pre-wrap">{item.payload.body}</p></> : <>
      <p>{item.payload.previousState && PROCESS_STATE_LABELS[item.payload.previousState] + ' → '}{PROCESS_STATE_LABELS[item.payload.newState]}</p>
      {item.payload.result && <p>Resultado histórico: {PROCESS_RESULT_LABELS[item.payload.result]}</p>}
      {item.payload.observation && <p className="whitespace-pre-wrap">{item.payload.observation}</p>}
    </>}
  </li>;
}
function InternalNoteForm({ identity, processId }: { identity: AuthIdentity; processId: string }) {
  const mutation = useInternalNote(identity, processId), form = useForm<{ body: string }>({ resolver: zodResolver(noteFormSchema), defaultValues: { body: '' } });
  return <form aria-label="Agregar nota interna" className="process-note-form" onSubmit={form.handleSubmit(async values => {
    try { await mutation.mutateAsync(values.body); form.reset(); } catch { /* Conserva la nota para reintentar. */ }
  })}>
    <FormSection heading="Agregar nota interna">
    <p>Esta nota solo será visible dentro de CECASEM Conecta y no se envía al contacto.</p>
    <p>Agregar una nota no te convierte en participante del proceso.</p>
    <FormField label="Contenido de la nota interna" error={form.formState.errors.body?.message}>{control => <Textarea {...control} aria-label="Contenido de la nota interna" maxLength={5000} {...form.register('body')} />}</FormField>
    <FormActions><Button type="submit" variant="primary" disabled={mutation.isPending}>{mutation.isPending ? 'Guardando nota…' : 'Guardar nota interna'}</Button></FormActions></FormSection>
    <MutationError modern error={mutation.error} />{mutation.isSuccess && <p role="status">Nota interna registrada.</p>}
  </form>;
}
export function RelationshipTimeline({ identity, processId }: { identity: AuthIdentity; processId: string }) {
  const query = useTimeline(identity, processId);
  if (!canReadTimeline(identity)) return null;
  const items = query.data?.pages.flatMap(page => page.items) ?? [];
  return <section aria-label="Conversación / Historial" className="process-timeline">
    <h2 className="text-xl font-semibold">Conversación / Historial</h2><p>Hechos del proceso en orden cronológico según su fecha real.</p>
    <Button disabled={query.isFetching} onClick={() => { void query.refetch(); }}>Actualizar historial</Button>
    {query.isPending && <p role="status">Cargando historial…</p>}
    {query.isError && <Alert tone="danger" role="alert"><p>No se pudo cargar el historial.</p><Button onClick={() => { void (query.isFetchNextPageError ? query.fetchNextPage() : query.refetch()); }}>Reintentar historial</Button></Alert>}
    {query.data && !items.length && <EmptyState title="No hay hechos registrados en este historial." />}
    <ol className="process-timeline-list">{items.map(item => <TimelineEntry key={item.kind + ':' + item.id} item={item} />)}</ol>
    {query.hasNextPage && <LoadMore disabled={query.isFetching} onClick={() => { void query.fetchNextPage(); }}>{query.isFetchingNextPage ? 'Cargando más…' : 'Cargar más historial'}</LoadMore>}
    {identity.permissions.includes('relationships.note.create') && <InternalNoteForm identity={identity} processId={processId} />}
  </section>;
}
