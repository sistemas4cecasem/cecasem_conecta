import { useState, type ReactNode } from 'react';
import { MeetingEventContent } from '../meetings/meeting-components';
import { useForm } from 'react-hook-form';
import { ReferralContent } from '../referrals/referrals-panel';
import { zodResolver } from '@hookform/resolvers/zod';
import type { AuthIdentity } from '../auth/session';
import { MutationError } from '../directory/directory-ui';
import { PROCESS_STATE_LABELS, PROCESS_RESULT_LABELS } from './process-contracts';
import { noteFormSchema, type TimelineItem } from './timeline-contracts';
import { canReadTimeline, useInternalNote, useTimeline } from './timeline-queries';
import { TimelineCommunication } from './timeline-communication';
import { ActionLink, Button } from '../../components/ui/actions';
import { LoadMore } from '../../components/ui/lists';
import { FormField, FormSection, FormActions, Textarea } from '../../components/ui/forms';
import { EmptyState, Alert } from '../../components/ui/feedback';
import { iconCatalog } from '../../components/ui/icons';
import './process-detail.css';

const eventLabels = { FILES_ATTACHED: 'Adjuntos incorporados', PROCESS_CREATED: 'Proceso iniciado', PROCESS_STATE_CHANGED: 'Cambio de estado', PROCESS_CLOSED: 'Proceso cerrado', PROCESS_REOPENED: 'Proceso reabierto', COMMUNICATION_CORRECTED: 'Corrección añadida', COMMUNICATION_ANNOTATED: 'Observación añadida', COMMUNICATION_INVALIDATED: 'Comunicación invalidada' };
function EntryMetadata({ item }: { item: TimelineItem }) {
  return <p className="process-timeline-fact">Autor: {item.actor.displayName}{!item.actor.isActive && ' (cuenta inactiva)'} · <time dateTime={item.registeredAt}>{new Date(item.registeredAt).toLocaleString('es-BO')}</time></p>;
}
function TimelineEntry({ identity, item, day }: { identity: AuthIdentity; item: TimelineItem; day: string | null }) {
  let content: ReactNode;
  if (item.kind === 'SENT_COMMUNICATION' || item.kind === 'RECEIVED_COMMUNICATION') {
    content = <TimelineCommunication identity={identity} item={item} />;
  } else if (item.kind === 'INTERNAL_NOTE') {
    content = <article className="process-internal-note"><div className="process-entry-heading"><h3>Nota interna</h3><span className="process-internal-label">Solo CECASEM</span></div>
      <EntryMetadata item={item} /><p className="process-note-body">{item.payload.body}</p><p className="process-timeline-fact">Contexto interno; no es una comunicación enviada ni recibida.</p></article>;
  } else if (item.kind === 'MEETING_ACTIVITY') {
    content = <article className="process-institutional-event"><h3>Reunión vinculada</h3><EntryMetadata item={item} />
      <MeetingEventContent event={item.payload} /><ActionLink appearance="context" to={'/meetings/' + item.payload.meetingId}>Ver reunión</ActionLink></article>;
  } else if (item.kind === 'REFERRAL_CREATED') {
    content = <article className="process-institutional-event"><h3>Contacto recomendado</h3><EntryMetadata item={item} /><ReferralContent row={item.payload.referral} /><ActionLink appearance="context" to={'/communications/' + item.payload.communicationId}>Ver comunicación de origen</ActionLink></article>;
  } else {
    content = <article className="process-institutional-event"><h3>{eventLabels[item.kind]}</h3><EntryMetadata item={item} />
      {'uploadId' in item.payload ? <><p>{item.payload.meetingId ? 'Documentación de reunión.' : item.payload.communicationId ? 'Incorporación posterior; no forma parte del mensaje original registrado.' : 'Adjuntos del proceso.'}</p>
        <p className="process-file-names">{item.payload.names.join(' · ')}</p>
        {item.payload.meetingId ? <ActionLink appearance="context" to={'/meetings/' + item.payload.meetingId + '#adjuntos'}>Consultar documentación de reunión</ActionLink> : item.payload.communicationId ? <ActionLink appearance="context" to={'/communications/' + item.payload.communicationId}>Consultar adjuntos</ActionLink> : <ActionLink appearance="context" to="#adjuntos">Consultar adjuntos</ActionLink>}</>
      : 'amendmentId' in item.payload ? <><p className="process-event-observation">{item.payload.content}</p><ActionLink appearance="context" to={'/communications/' + item.payload.communicationId}>Ver comunicación original</ActionLink></>
      : 'eventId' in item.payload ? <><p className="process-event-transition">{item.payload.previousState && PROCESS_STATE_LABELS[item.payload.previousState] + ' → '}{PROCESS_STATE_LABELS[item.payload.newState]}</p>
        {item.payload.result && <p>Resultado histórico: {PROCESS_RESULT_LABELS[item.payload.result]}</p>}
        {item.payload.observation && <p className="process-event-observation">{item.payload.observation}</p>}
        {item.payload.authority === 'ADMINISTRATOR' && <p className="process-event-authority">Intervención excepcional de Administración</p>}
        {item.payload.authority === 'BOARD' && <p className="process-event-authority">Intervención de Directorio</p>}</> : null}
    </article>;
  }
  return <li className="process-timeline-entry">{day && <p className="process-timeline-day">{day}</p>}{content}</li>;
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

export function RelationshipTimeline({ identity, processId, registrationActions }: { identity: AuthIdentity; processId: string; registrationActions?: ReactNode }) {
  const query = useTimeline(identity, processId), [noteOpen, setNoteOpen] = useState(false), [noteActivated, setNoteActivated] = useState(false);
  if (!canReadTimeline(identity)) return null;
  const items = query.data?.pages.flatMap(page => page.items) ?? [];
  const dayLabel = (at: string) => new Date(at).toLocaleDateString('es-BO', { day: 'numeric', month: 'long', year: 'numeric' });
  return <section aria-label="Cronología institucional" className="process-timeline">
    <div className="process-timeline-header"><div><h2>Cronología institucional</h2><p>Actividad más reciente primero, según la fecha del hecho.</p></div>
      <Button variant="outline" disabled={query.isFetching} onClick={() => { void query.refetch(); }}>Actualizar historial</Button></div>
    <div className="process-registration-actions">{registrationActions}
      {identity.permissions.includes('relationships.note.create') && <Button variant="secondary" startIcon={<iconCatalog.action.edit size={18} />} aria-expanded={noteOpen} aria-controls="process-internal-note-form" onClick={() => { setNoteActivated(true); setNoteOpen(value => !value); }}>{noteOpen ? 'Cerrar formulario de nota' : 'Añadir nota interna'}</Button>}</div>
    <p className="process-timeline-fact">Las comunicaciones son registros manuales de correos externos. Las notas permanecen dentro de CECASEM.</p>
    <div id="process-internal-note-form" hidden={!noteOpen}>{noteActivated && <InternalNoteForm identity={identity} processId={processId} />}</div>
    {query.isPending && <p role="status">Cargando historial…</p>}
    {query.isError && <Alert tone="danger" role="alert"><p>No se pudo cargar el historial.</p><Button onClick={() => { void (query.isFetchNextPageError ? query.fetchNextPage() : query.refetch()); }}>Reintentar historial</Button></Alert>}
    {query.data && !items.length && <EmptyState title="No hay hechos registrados en este historial." />}
    <ol className="process-timeline-list">{items.map((item, index) => <TimelineEntry key={item.kind + ':' + item.id} identity={identity} item={item}
      day={index === 0 || dayLabel(items[index - 1]!.occurredAt) !== dayLabel(item.occurredAt) ? dayLabel(item.occurredAt) : null} />)}</ol>
    {query.hasNextPage && <LoadMore disabled={query.isFetching} onClick={() => { void query.fetchNextPage(); }}>{query.isFetchingNextPage ? 'Cargando anteriores…' : 'Cargar acontecimientos anteriores'}</LoadMore>}
    {query.data && items.length > 0 && !query.hasNextPage && <p className="process-timeline-end">Inicio del historial · Todos los acontecimientos cargados.</p>}
  </section>;
}
