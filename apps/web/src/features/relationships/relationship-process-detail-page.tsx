import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { useParams, useSearchParams } from 'react-router';
import { useSession, type AuthIdentity } from '../auth/session';
import { MutationError } from '../directory/directory-ui';
import { ActionLink, Button } from '../../components/ui/actions';
import { PageHeader, Surface } from '../../components/ui/layout';
import { Alert, QueryFeedback, StatusBadge, ConfirmationPanel } from '../../components/ui/feedback';
import { FormField, Select, Textarea } from '../../components/ui/forms';
import { Metadata, Pagination } from '../../components/ui/lists';
import { iconCatalog } from '../../components/ui/icons';
import './process-detail.css';
import { OPEN_STATES, PROCESS_RESULT_LABELS, PROCESS_STATE_LABELS, processCloseSchema, processReopenSchema, processStateFormSchema, type ProcessDetail, type ProcessEvent } from './process-contracts';
import { processIdentityKey, useProcess, useProcessEvents, useProcessMutation } from './process-queries';
import { ProcessContextPanel } from './process-context-panel';
import { ContactRestrictionNotice } from './contact-restriction-notice';
import { useTargetRestriction } from './restriction-queries';
import { RelationshipTimeline } from './relationship-timeline';
import { canReadTimeline, timelineIdentityKey } from './timeline-queries';
type Action = 'state' | 'close' | 'reopen';
type FormProps = { pending: boolean; blocked: boolean; submit: (body: object) => Promise<void> };

function StateForm({ mode, states, pending, blocked, submit }: FormProps & { mode: 'state' | 'reopen'; states: ProcessDetail['allowedStates'] }) {
  const form = useForm<z.infer<typeof processStateFormSchema>>({ resolver: zodResolver(mode === 'reopen' ? processReopenSchema : processStateFormSchema), defaultValues: { reason: '' } });
  return <form className="space-y-3" onSubmit={form.handleSubmit(values => submit({ state: values.state, ...(values.reason ? { reason: values.reason } : {}) }))}>
    {mode === 'reopen' && <p>Confirma que esta gestión corresponde al mismo acercamiento. El cierre previo permanecerá en el historial.</p>}
    <FormField label="Estado de destino" error={form.formState.errors.state?.message}>{control => <Select {...control} aria-label="Estado de destino" {...form.register('state')}><option value="">Selecciona un estado</option>
      {states.map(value => <option key={value} value={value}>{PROCESS_STATE_LABELS[value]}</option>)}</Select>}</FormField>
    <FormField label={mode === 'reopen' ? 'Motivo de reapertura' : 'Motivo del cambio (opcional)'} error={form.formState.errors.reason?.message}>{control => <Textarea {...control} aria-label={mode === 'reopen' ? 'Motivo de reapertura' : 'Motivo del cambio (opcional)'} maxLength={5000} {...form.register('reason')} />}</FormField>
    <Button type="submit" variant="primary" disabled={pending || blocked}>{pending ? 'Guardando…' : mode === 'reopen' ? 'Confirmar reapertura' : 'Confirmar cambio de estado'}</Button>
  </form>;
}
function CloseForm({ pending, blocked, submit }: FormProps) {
  const form = useForm<z.infer<typeof processCloseSchema>>({ resolver: zodResolver(processCloseSchema), defaultValues: { observation: '' } });
  const other = useWatch({ control: form.control, name: 'result' }) === 'OTHER';
  return <form className="space-y-3" onSubmit={form.handleSubmit(values => submit({ result: values.result, ...(values.observation ? { observation: values.observation } : {}) }))}>
    <FormField label="Resultado de cierre" error={form.formState.errors.result?.message}>{control => <Select {...control} aria-label="Resultado de cierre" {...form.register('result')}><option value="">Selecciona un resultado</option>
      {Object.entries(PROCESS_RESULT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>}</FormField>
    <FormField label={other ? 'Observación de cierre (obligatoria para Otro)' : 'Observación de cierre (opcional)'} error={form.formState.errors.observation?.message}>{control => <Textarea {...control} aria-label={other ? 'Observación de cierre (obligatoria para Otro)' : 'Observación de cierre (opcional)'} maxLength={5000} {...form.register('observation')} />}</FormField>
    <Button type="submit" variant="primary" disabled={pending || blocked}>{pending ? 'Guardando…' : 'Confirmar cierre'}</Button>
  </form>;
}
const eventLabels = { CREATED: 'Creación', STATE_CHANGED: 'Cambio de estado', CLOSED: 'Cierre', REOPENED: 'Reapertura' };
function HistoryEvent({ event }: { event: ProcessEvent }) {
  return <li className="process-history-event min-w-0 space-y-1 break-words"><p className="process-history-heading">{eventLabels[event.type]} · <time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString('es-BO')}</time> · {event.actor.displayName}</p>
    <p>{event.previousState && PROCESS_STATE_LABELS[event.previousState] + ' → '}{PROCESS_STATE_LABELS[event.newState]}</p>
    {event.result && <p>Resultado histórico: {PROCESS_RESULT_LABELS[event.result]}</p>}{event.observation && <p className="whitespace-pre-wrap">{event.observation}</p>}
    {event.authority === 'ADMINISTRATOR' && <p>Intervención excepcional de Administración</p>}{event.authority === 'BOARD' && <p>Intervención de Directorio</p>}</li>;
}
function AdministrativeHistory({ identity, process }: { identity: AuthIdentity; process: ProcessDetail }) {
  const [page, setPage] = useState(1), history = useProcessEvents(identity, process.id, page);
  return <Surface aria-label="Historial del proceso" heading="Cronología del proceso" description="Acontecimientos administrativos disponibles con tus permisos." className="process-history">
    {page > 1 && <QueryFeedback pending={history.isPending} error={history.isError} retry={history.refetch} />}
    <ol>{(page === 1 ? process.events : history.data?.items ?? []).map(event => <HistoryEvent key={event.id} event={event} />)}</ol>
    <Pagination page={page} total={page === 1 ? process.eventsTotal : history.data?.total ?? process.eventsTotal} pageSize={25} onPage={setPage} />
  </Surface>;
}
export function RelationshipProcessDetailPage() {
  const identity = useSession().data, { id = '' } = useParams();
  if (!identity?.permissions.includes('relationships.process.read')) return <p role="alert">No tienes permiso para consultar procesos.</p>;
  return <ProcessDetailView key={processIdentityKey(identity).join(':') + ':' + id} identity={identity} id={id} />;
}
function ProcessDetailView({ identity, id }: { identity: AuthIdentity; id: string }) {
  const detail = useProcess(identity, id), mutation = useProcessMutation(identity);
  const [parameters] = useSearchParams();
  const [action, setAction] = useState<Action | null>(() => parameters.get('action') === 'reopen' ? 'reopen' : null);

  const process = detail.data;
  const restriction = useTargetRestriction(identity, process?.target ?? null);
  const actions: Record<Action, boolean> = {
    state: !!process?.allowedStates.length && identity.permissions.includes('relationships.process.state.change'),
    close: !!process?.canClose && identity.permissions.includes('relationships.process.close'),
    reopen: !!process?.canReopen && identity.permissions.includes('relationships.process.reopen'),
  };
  async function submit(body: object) {
    if (!process || !action) return;
    try {
      await mutation.mutateAsync({ path: 'relationship-processes/' + id + '/' + action, body: { ...body, expectedVersion: process.version } });
      setAction(null);
    } catch { /* Conserva formulario y contexto; requiere recargar tras conflicto. */ }
  }
  return <section className="process-detail">
    <PageHeader eyebrow="Relaciones / Procesos" title={process?.purpose ?? 'Proceso de relación'}
      metadata={process && <StatusBadge tone={process.state === 'CLOSED' ? 'neutral' : process.state === 'WAITING_RESPONSE' ? 'warning' : 'info'}>{PROCESS_STATE_LABELS[process.state]}</StatusBadge>}
      actions={<ActionLink appearance="context" to="/relationship-processes">Volver al listado</ActionLink>} />
    <QueryFeedback pending={detail.isPending} error={detail.isError} retry={detail.refetch} />
    {process && <>
      {identity.permissions.includes('relationships.restriction.read') && <QueryFeedback pending={restriction.isPending} error={restriction.isError} retry={restriction.refetch} />}
      <ContactRestrictionNotice restriction={restriction.data?.items[0]} context="process" />
      <Surface className="process-summary" heading="Información del proceso"><Metadata items={[
        { label: 'Actor principal', value: <ActionLink to={'/' + (process.target.kind === 'ORGANIZATION' ? 'organizations/' : 'people/') + process.target.id}>{process.target.label}{!process.target.isActive && ' (inactivo)'}</ActionLink> },
        { label: 'Creador', value: process.createdBy.displayName + (!process.createdBy.isActive ? ' (cuenta inactiva)' : '') },
        { label: 'Creación', value: <time dateTime={process.createdAt}>{new Date(process.createdAt).toLocaleString('es-BO')}</time> },
        { label: 'Última actividad formal', value: <time dateTime={process.lastActivityAt}>{new Date(process.lastActivityAt).toLocaleString('es-BO')}</time> },
      ]} />{process.sourceIntentId && <ActionLink appearance="context" to={'/contact-intents/' + process.sourceIntentId}>Consultar intención de origen</ActionLink>}
      {process.currentResult && <div className="process-closure"><p>Resultado: {PROCESS_RESULT_LABELS[process.currentResult]}</p><p>Cerrado por {process.closedBy?.displayName} · <time dateTime={process.closedAt!}>{new Date(process.closedAt!).toLocaleString('es-BO')}</time></p>{process.closureObservation && <p className="whitespace-pre-wrap">{process.closureObservation}</p>}</div>}
      {process.exceptionalAdministration && <Alert tone="neutral">El cierre o la reapertura por Administración se registrará como intervención excepcional.</Alert>}
      <section aria-label="Estado y acciones" className="process-state-actions">
      <h2>Estado y acciones</h2><div className="ui-actions">{(['state', 'close', 'reopen'] as const).map(value => actions[value] && <Button key={value} variant={value === 'close' ? 'danger' : 'secondary'} disabled={mutation.isPending || !!mutation.error} onClick={() => { mutation.reset(); setAction(value); }}>{value === 'state' ? 'Cambiar estado' : value === 'close' ? 'Cerrar proceso' : 'Reabrir proceso'}</Button>)}</div>
      {!actions.state && !actions.close && !actions.reopen && <p>Consulta disponible. Las acciones requieren los permisos y la participación correspondientes.</p>}
      {action && actions[action] && <ConfirmationPanel tone={action === 'close' ? 'danger' : 'warning'} title={action === 'close' ? 'Cerrar proceso' : action === 'reopen' ? 'Reabrir proceso' : 'Cambiar estado'} aria-label={action === 'close' ? 'Cerrar proceso' : action === 'reopen' ? 'Reabrir proceso' : 'Cambiar estado'}>
        {action === 'close' ? <CloseForm pending={mutation.isPending} blocked={!!mutation.error} submit={submit} /> :
          <StateForm key={action} mode={action} states={action === 'reopen' ? [...OPEN_STATES] : process.allowedStates} pending={mutation.isPending} blocked={!!mutation.error} submit={submit} />}
        <Button disabled={mutation.isPending} onClick={() => setAction(null)}>Volver sin guardar</Button></ConfirmationPanel>}
      <MutationError modern error={mutation.error} />
      {mutation.error && <Button onClick={() => { void detail.refetch().then(result => { if (!result.isError) { mutation.reset(); } }); }}>Recargar proceso y revisar estado</Button>}
      {mutation.isSuccess && <p role="status">Operación registrada.</p>}
      </section></Surface>
      <div className="process-workspace"><div className="process-conversation">
        {canReadTimeline(identity) ? <RelationshipTimeline key={timelineIdentityKey(identity).join(':') + ':' + id} identity={identity} processId={id} registrationActions={<>
          {process.state !== 'CLOSED' && !restriction.data?.items.length && identity.permissions.includes('communications.sent.create') && <ActionLink appearance="action" variant="primary" startIcon={<iconCatalog.action.sent size={18} />} to={'/relationship-processes/' + id + '/communications/sent'}>Registrar comunicación enviada</ActionLink>}
          {identity.permissions.includes('communications.received.create') && <ActionLink appearance="action" variant="outline" startIcon={<iconCatalog.action.received size={18} />} to={'/relationship-processes/' + id + '/communications/received'}>Registrar comunicación recibida</ActionLink>}
          {identity.permissions.includes('meetings.read') && identity.permissions.includes('meetings.create') && <ActionLink appearance="context" startIcon={<iconCatalog.metric.meeting size={18} />} to={'/meetings/new?processId=' + id}>Crear reunión vinculada</ActionLink>}
        </>} /> : <>
          <div className="process-registration-actions">
            {process.state !== 'CLOSED' && !restriction.data?.items.length && identity.permissions.includes('communications.sent.create') && <ActionLink appearance="action" variant="primary" to={'/relationship-processes/' + id + '/communications/sent'}>Registrar comunicación enviada</ActionLink>}
            {identity.permissions.includes('communications.received.create') && <ActionLink appearance="action" variant="outline" to={'/relationship-processes/' + id + '/communications/received'}>Registrar comunicación recibida</ActionLink>}
          </div><AdministrativeHistory key={process.version} identity={identity} process={process} />
        </>}
      </div><ProcessContextPanel identity={identity} process={process} /></div>
    </>}
  </section>;
}
