import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { Link, useParams, useSearchParams } from 'react-router';
import { useSession, type AuthIdentity } from '../auth/session';
import { buttonClass, Field, inputClass, MutationError, Pagination, QueryState } from '../directory/directory-ui';
import { ProcessContext } from './relationship-processes-page';
import { PARTICIPANT_ORIGIN_LABELS, OPEN_STATES, PROCESS_RESULT_LABELS, PROCESS_STATE_LABELS, processCloseSchema, processReopenSchema, processStateFormSchema, type ProcessDetail, type ProcessEvent } from './process-contracts';
import { processIdentityKey, useProcess, useProcessEvents, useProcessMutation } from './process-queries';
import { CommunicationsList } from '../communications/communications-list';
import { RelationshipTimeline } from './relationship-timeline';
import { timelineIdentityKey } from './timeline-queries';
type Action = 'state' | 'close' | 'reopen';
type FormProps = { pending: boolean; blocked: boolean; submit: (body: object) => Promise<void> };

function StateForm({ mode, states, pending, blocked, submit }: FormProps & { mode: 'state' | 'reopen'; states: ProcessDetail['allowedStates'] }) {
  const form = useForm<z.infer<typeof processStateFormSchema>>({ resolver: zodResolver(mode === 'reopen' ? processReopenSchema : processStateFormSchema), defaultValues: { reason: '' } });
  return <form className="space-y-3" onSubmit={form.handleSubmit(values => submit({ state: values.state, ...(values.reason ? { reason: values.reason } : {}) }))}>
    {mode === 'reopen' && <p>Confirma que esta gestión corresponde al mismo acercamiento. El cierre previo permanecerá en el historial.</p>}
    <Field label="Estado de destino" error={form.formState.errors.state?.message}><select aria-label="Estado de destino" className={inputClass} {...form.register('state')}><option value="">Selecciona un estado</option>
      {states.map(value => <option key={value} value={value}>{PROCESS_STATE_LABELS[value]}</option>)}</select></Field>
    <Field label={mode === 'reopen' ? 'Motivo de reapertura' : 'Motivo del cambio (opcional)'} error={form.formState.errors.reason?.message}><textarea aria-label={mode === 'reopen' ? 'Motivo de reapertura' : 'Motivo del cambio (opcional)'} className={inputClass} maxLength={5000} {...form.register('reason')} /></Field>
    <button className={buttonClass} disabled={pending || blocked}>{pending ? 'Guardando…' : mode === 'reopen' ? 'Confirmar reapertura' : 'Confirmar cambio de estado'}</button>
  </form>;
}
function CloseForm({ pending, blocked, submit }: FormProps) {
  const form = useForm<z.infer<typeof processCloseSchema>>({ resolver: zodResolver(processCloseSchema), defaultValues: { observation: '' } });
  const other = useWatch({ control: form.control, name: 'result' }) === 'OTHER';
  return <form className="space-y-3" onSubmit={form.handleSubmit(values => submit({ result: values.result, ...(values.observation ? { observation: values.observation } : {}) }))}>
    <Field label="Resultado de cierre" error={form.formState.errors.result?.message}><select aria-label="Resultado de cierre" className={inputClass} {...form.register('result')}><option value="">Selecciona un resultado</option>
      {Object.entries(PROCESS_RESULT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
    <Field label={other ? 'Observación de cierre (obligatoria para Otro)' : 'Observación de cierre (opcional)'} error={form.formState.errors.observation?.message}><textarea aria-label={other ? 'Observación de cierre (obligatoria para Otro)' : 'Observación de cierre (opcional)'} className={inputClass} maxLength={5000} {...form.register('observation')} /></Field>
    <button className={buttonClass} disabled={pending || blocked}>{pending ? 'Guardando…' : 'Confirmar cierre'}</button>
  </form>;
}
const eventLabels = { CREATED: 'Creación', STATE_CHANGED: 'Cambio de estado', CLOSED: 'Cierre', REOPENED: 'Reapertura' };
function HistoryEvent({ event }: { event: ProcessEvent }) {
  return <li className="min-w-0 space-y-1 rounded border p-3 break-words"><p className="font-semibold">{eventLabels[event.type]} · {new Date(event.createdAt).toLocaleString('es-BO')} · {event.actor.displayName}</p>
    <p>{event.previousState && PROCESS_STATE_LABELS[event.previousState] + ' → '}{PROCESS_STATE_LABELS[event.newState]}</p>
    {event.result && <p>Resultado histórico: {PROCESS_RESULT_LABELS[event.result]}</p>}{event.observation && <p className="whitespace-pre-wrap">{event.observation}</p>}
    {event.authority === 'ADMINISTRATOR' && <p>Intervención excepcional de Administración</p>}{event.authority === 'BOARD' && <p>Intervención de Directorio</p>}</li>;
}
export function RelationshipProcessDetailPage() {
  const identity = useSession().data, { id = '' } = useParams();
  if (!identity?.permissions.includes('relationships.process.read')) return <p role="alert">No tienes permiso para consultar procesos.</p>;
  return <ProcessDetailView key={processIdentityKey(identity).join(':') + ':' + id} identity={identity} id={id} />;
}
function ProcessDetailView({ identity, id }: { identity: AuthIdentity; id: string }) {
  const detail = useProcess(identity, id), mutation = useProcessMutation(identity);
  const [parameters] = useSearchParams();
  const [action, setAction] = useState<Action | null>(() => parameters.get('action') === 'reopen' ? 'reopen' : null), [page, setPage] = useState(1);
  const history = useProcessEvents(identity, id, page);
  const process = detail.data;
  const actions: Record<Action, boolean> = {
    state: !!process?.allowedStates.length && identity.permissions.includes('relationships.process.state.change'),
    close: !!process?.canClose && identity.permissions.includes('relationships.process.close'),
    reopen: !!process?.canReopen && identity.permissions.includes('relationships.process.reopen'),
  };
  async function submit(body: object) {
    if (!process || !action) return;
    try {
      await mutation.mutateAsync({ path: 'relationship-processes/' + id + '/' + action, body: { ...body, expectedVersion: process.version } });
      setAction(null); setPage(1);
    } catch { /* Conserva formulario y contexto; requiere recargar tras conflicto. */ }
  }
  return <section className="min-w-0 w-full space-y-4"><h1 className="text-2xl font-semibold">Proceso de relación</h1><Link className={buttonClass} to="/relationship-processes">Volver al listado</Link>
    <QueryState pending={detail.isPending} error={detail.isError} retry={detail.refetch} />
    {process && <><p className="whitespace-pre-wrap break-words">{process.purpose}</p><ProcessContext process={process} />
      {process.exceptionalAdministration && <p>El cierre o la reapertura por Administración se registrará como intervención excepcional.</p>}
      {process.state !== 'CLOSED' && identity.permissions.includes('communications.sent.create') && <Link className={buttonClass} to={'/relationship-processes/' + id + '/communications/sent'}>Registrar comunicación enviada</Link>}
      {identity.permissions.includes('communications.received.create') && <Link className={buttonClass} to={'/relationship-processes/' + id + '/communications/received'}>Registrar comunicación recibida</Link>}
      <RelationshipTimeline key={timelineIdentityKey(identity).join(':') + ':' + id} identity={identity} processId={id} />
      <CommunicationsList key={'communications-' + id} identity={identity} processId={id} />
      <div className="flex flex-wrap gap-3">{(['state', 'close', 'reopen'] as const).map(value => actions[value] && <button key={value} className={buttonClass} disabled={mutation.isPending || !!mutation.error} onClick={() => { mutation.reset(); setAction(value); }}>{value === 'state' ? 'Cambiar estado' : value === 'close' ? 'Cerrar proceso' : 'Reabrir proceso'}</button>)}</div>
      {!actions.state && !actions.close && !actions.reopen && <p>Consulta disponible. Las acciones requieren los permisos y la participación correspondientes.</p>}
      {action && actions[action] && <section aria-label={action === 'close' ? 'Cerrar proceso' : action === 'reopen' ? 'Reabrir proceso' : 'Cambiar estado'} className="space-y-3 rounded border p-3">
        {action === 'close' ? <CloseForm pending={mutation.isPending} blocked={!!mutation.error} submit={submit} /> :
          <StateForm key={action} mode={action} states={action === 'reopen' ? [...OPEN_STATES] : process.allowedStates} pending={mutation.isPending} blocked={!!mutation.error} submit={submit} />}
        <button className={buttonClass} disabled={mutation.isPending} onClick={() => setAction(null)}>Volver sin guardar</button></section>}
      <MutationError error={mutation.error} />
      {mutation.error && <button className={buttonClass} onClick={() => { void detail.refetch().then(result => { if (!result.isError) { mutation.reset(); setPage(1); } }); }}>Recargar proceso y revisar estado</button>}
      {mutation.isSuccess && <p role="status">Operación registrada.</p>}
      <section aria-label="Participantes" className="space-y-2"><h2 className="text-xl font-semibold">Participantes</h2><ul>{process.participants.map(participant => <li key={participant.user.id}>{participant.user.displayName}{!participant.user.isActive && ' (cuenta inactiva)'} · {PARTICIPANT_ORIGIN_LABELS[participant.origin]} · {new Date(participant.joinedAt).toLocaleString('es-BO')}</li>)}</ul></section>
      <section aria-label="Historial del proceso" className="space-y-3"><h2 className="text-xl font-semibold">Historial del proceso</h2>
        {page > 1 && <QueryState pending={history.isPending} error={history.isError} retry={history.refetch} />}
        <ol className="space-y-3">{(page === 1 ? process.events : history.data?.items ?? []).map(event => <HistoryEvent key={event.id} event={event} />)}</ol>
        <Pagination page={page} total={page === 1 ? process.eventsTotal : history.data?.total ?? process.eventsTotal} pageSize={25} onPage={setPage} /></section>
    </>}
  </section>;
}
