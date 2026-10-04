import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router';
import type { AuthIdentity } from '../auth/session';
import { buttonClass, Field, inputClass, MutationError } from '../directory/directory-ui';
import { PROCESS_STATE_LABELS, PROCESS_RESULT_LABELS } from './process-contracts';
import { noteFormSchema, type TimelineItem } from './timeline-contracts';
import { canReadTimeline, useInternalNote, useTimeline } from './timeline-queries';
const eventLabels = { FILES_ATTACHED: 'Adjuntos incorporados', PROCESS_CREATED: 'Proceso iniciado', PROCESS_STATE_CHANGED: 'Cambio de estado', PROCESS_CLOSED: 'Proceso cerrado', PROCESS_REOPENED: 'Proceso reabierto', COMMUNICATION_CORRECTED: 'Corrección añadida', COMMUNICATION_ANNOTATED: 'Observación añadida', COMMUNICATION_INVALIDATED: 'Comunicación invalidada' };
function TimelineEntry({ item }: { item: TimelineItem }) {
  const sent = item.kind === 'SENT_COMMUNICATION', received = item.kind === 'RECEIVED_COMMUNICATION';
  const title = sent ? 'ENVIADA' : received ? 'RECIBIDA' : item.kind === 'INTERNAL_NOTE' ? 'NOTA INTERNA' : eventLabels[item.kind as keyof typeof eventLabels];
  return <li className={'min-w-0 space-y-2 rounded border p-4 break-words ' + (sent ? 'border-blue-700 bg-blue-50 md:ml-12' : received ? 'border-emerald-700 bg-emerald-50 md:mr-12' : item.kind === 'INTERNAL_NOTE' ? 'border-dashed border-amber-700 bg-amber-50' : 'border-slate-400 bg-slate-50')}>
    <h3 className="font-semibold">{title}</h3>
    <p>Fecha del hecho: {new Date(item.occurredAt).toLocaleString('es-BO')}</p>
    <p>{sent || received ? 'Registrador' : 'Autor'}: {item.actor.displayName}{!item.actor.isActive && ' (cuenta inactiva)'}</p>
    {sent || received ? <p>Registro en CECASEM Conecta: {new Date(item.registeredAt).toLocaleString('es-BO')}</p> : null}
    {'uploadId' in item.payload ? <><p>{item.payload.communicationId ? 'Incorporación posterior; no forma parte del mensaje original registrado.' : 'Adjuntos del proceso.'}</p><ul>{item.payload.names.map((name, index) => <li key={index}>{name}</li>)}</ul>{item.payload.communicationId ? <Link className={buttonClass} to={'/communications/' + item.payload.communicationId}>Consultar adjuntos</Link> : <a className={buttonClass} href='#adjuntos'>Consultar adjuntos</a>}</> : 'amendmentId' in item.payload ? <><p className="whitespace-pre-wrap">{item.payload.content}</p><Link className={buttonClass} to={'/communications/' + item.payload.communicationId}>Ver comunicación original</Link></> : 'communicationId' in item.payload ? <>
      {item.payload.validity === 'INVALIDATED' && <aside><p className="font-semibold">INVALIDADA</p>{item.payload.invalidation && <><p>Invalidada posteriormente por {item.payload.invalidation.author.displayName} · {new Date(item.payload.invalidation.createdAt).toLocaleString('es-BO')}</p><p className="whitespace-pre-wrap">Motivo: {item.payload.invalidation.content}</p></>}</aside>}
      <p className="font-medium whitespace-pre-wrap">{item.payload.subject}</p><p>Remitente: {item.payload.sender}</p>
      <p>Destinatarios: {item.payload.recipients.map(recipient => (recipient.type === 'TO' ? 'Para' : recipient.type === 'BCC' ? 'CCO' : 'CC') + ': ' + recipient.addressOriginal).join(' · ')}</p>
      {item.payload.recipientTotal > item.payload.recipients.length && <p>Se muestran {item.payload.recipients.length} de {item.payload.recipientTotal} destinatarios; el detalle conserva todos.</p>}
      <Link className={buttonClass} to={'/communications/' + item.payload.communicationId}>Ver detalle de comunicación</Link>
    </> : 'noteId' in item.payload ? <><p>Contexto interno; no es una comunicación enviada ni recibida.</p><p className="whitespace-pre-wrap">{item.payload.body}</p></> : <>
      <p>{item.payload.previousState && PROCESS_STATE_LABELS[item.payload.previousState] + ' → '}{PROCESS_STATE_LABELS[item.payload.newState]}</p>
      {item.payload.result && <p>Resultado histórico: {PROCESS_RESULT_LABELS[item.payload.result]}</p>}
      {item.payload.observation && <p className="whitespace-pre-wrap">{item.payload.observation}</p>}
    </>}
  </li>;
}
function InternalNoteForm({ identity, processId }: { identity: AuthIdentity; processId: string }) {
  const mutation = useInternalNote(identity, processId), form = useForm<{ body: string }>({ resolver: zodResolver(noteFormSchema), defaultValues: { body: '' } });
  return <form aria-label="Agregar nota interna" className="space-y-3 rounded border border-amber-700 p-4" onSubmit={form.handleSubmit(async values => {
    try { await mutation.mutateAsync(values.body); form.reset(); } catch { /* Conserva la nota para reintentar. */ }
  })}>
    <h3 className="font-semibold">Agregar nota interna</h3>
    <p>Esta nota solo será visible dentro de CECASEM Conecta y no se envía al contacto.</p>
    <p>Agregar una nota no te convierte en participante del proceso.</p>
    <Field label="Contenido de la nota interna" error={form.formState.errors.body?.message}><textarea aria-label="Contenido de la nota interna" className={inputClass} maxLength={5000} {...form.register('body')} /></Field>
    <button className={buttonClass} disabled={mutation.isPending}>{mutation.isPending ? 'Guardando nota…' : 'Guardar nota interna'}</button>
    <MutationError error={mutation.error} />{mutation.isSuccess && <p role="status">Nota interna registrada.</p>}
  </form>;
}
export function RelationshipTimeline({ identity, processId }: { identity: AuthIdentity; processId: string }) {
  const query = useTimeline(identity, processId);
  if (!canReadTimeline(identity)) return null;
  const items = query.data?.pages.flatMap(page => page.items) ?? [];
  return <section aria-label="Conversación / Historial" className="min-w-0 space-y-4">
    <h2 className="text-xl font-semibold">Conversación / Historial</h2><p>Hechos del proceso en orden cronológico según su fecha real.</p>
    <button className={buttonClass} disabled={query.isFetching} onClick={() => { void query.refetch(); }}>Actualizar historial</button>
    {query.isPending && <p role="status">Cargando historial…</p>}
    {query.isError && <div role="alert"><p>No se pudo cargar el historial.</p><button className={buttonClass} onClick={() => { void (query.isFetchNextPageError ? query.fetchNextPage() : query.refetch()); }}>Reintentar historial</button></div>}
    {query.data && !items.length && <p>No hay hechos registrados en este historial.</p>}
    <ol className="space-y-3">{items.map(item => <TimelineEntry key={item.kind + ':' + item.id} item={item} />)}</ol>
    {query.hasNextPage && <button className={buttonClass} disabled={query.isFetching} onClick={() => { void query.fetchNextPage(); }}>{query.isFetchingNextPage ? 'Cargando más…' : 'Cargar más historial'}</button>}
    {identity.permissions.includes('relationships.note.create') && <InternalNoteForm identity={identity} processId={processId} />}
  </section>;
}
