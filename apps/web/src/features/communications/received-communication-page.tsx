import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { Link, useNavigate, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useSession, type AuthIdentity } from '../auth/session';
import { buttonClass, Field, inputClass, MutationError, QueryState } from '../directory/directory-ui';
import { useProcess } from '../relationships/process-queries';
import { RelationshipContextPanel } from '../relationships/relationship-context-panel';
import { communicationIdentityKey, communicationIdentityMatches, useReceivedCommunication } from './queries';
import { receivedBody, receivedFormSchema, type ReceivedBody } from './contracts';
export function ReceivedCommunicationPage() {
  const identity = useSession().data, { id = '' } = useParams();
  if (!identity?.permissions.includes('communications.received.create') || !identity.permissions.includes('relationships.process.read')) return <p role="alert">No tienes permiso para registrar comunicaciones recibidas.</p>;
  return <ReceivedForm key={communicationIdentityKey(identity).join(':') + ':' + id} identity={identity} processId={id} />;
}
function ReceivedForm({ identity, processId }: { identity: AuthIdentity; processId: string }) {
  const process = useProcess(identity, processId), mutation = useReceivedCommunication(identity), navigate = useNavigate(), client = useQueryClient();
  const [confirmation, setConfirmation] = useState<ReceivedBody | null>(null), requestKey = useRef<string | null>(null);
  const form = useForm<z.infer<typeof receivedFormSchema>>({ resolver: zodResolver(receivedFormSchema), defaultValues: { sender: '', to: '', cc: '', bcc: '', subject: '', body: '', receivedAt: '' } });
  return <section className="min-w-0 w-full space-y-4 break-words"><h1 className="text-2xl font-semibold">Registrar comunicación recibida</h1><Link className={buttonClass} to={'/relationship-processes/' + processId}>Volver al proceso</Link>
    <p>Documenta una comunicación externa realmente recibida. El remitente identifica el origen del mensaje; tu usuario identifica quién lo registra. No necesitas tener asignado el buzón receptor.</p>
    <p>El contenido original quedará como registro histórico sin edición ordinaria. Registra CCO únicamente cuando lo conozcas.</p>
    <QueryState pending={process.isPending} error={process.isError} retry={process.refetch} />
    {process.data?.state === 'CLOSED' && <aside role="status" className="rounded border border-amber-700 p-3"><p>Esta comunicación se registrará como respuesta recibida en un proceso cerrado. Después puede ser necesario reabrir el proceso.</p><p>El registro conservará el cierre y no ejecutará una reapertura automática.</p></aside>}
    <RelationshipContextPanel identity={identity} target={process.data?.target ?? null} />
    <p>Una restricción activa no impide documentar esta entrada y seguirá vigente después del registro.</p>
    {process.data && <form className="space-y-4" onChange={() => setConfirmation(null)} onSubmit={form.handleSubmit(values => setConfirmation(receivedBody(values)))}>
      <Field label="Remitente externo" error={form.formState.errors.sender?.message}><input aria-label="Remitente externo" type="email" className={inputClass} maxLength={254} {...form.register('sender')} /></Field>
      <p>Separa las direcciones observadas con comas, punto y coma o saltos de línea. Pueden ser cuentas CECASEM u otras direcciones.</p>
      {(['to', 'cc', 'bcc'] as const).map(field => <Field key={field} label={field === 'to' ? 'Para' : field === 'cc' ? 'CC' : 'CCO'} error={form.formState.errors[field]?.message}><textarea aria-label={field === 'to' ? 'Para' : field === 'cc' ? 'CC' : 'CCO'} className={inputClass} rows={2} maxLength={25600} {...form.register(field)} /></Field>)}
      <Field label="Asunto" error={form.formState.errors.subject?.message}><input aria-label="Asunto" className={inputClass} maxLength={998} {...form.register('subject')} /></Field>
      <Field label="Cuerpo original" error={form.formState.errors.body?.message}><textarea aria-label="Cuerpo original" className={inputClass} rows={12} maxLength={200000} {...form.register('body')} /></Field>
      <Field label="Fecha y hora real de recepción" error={form.formState.errors.receivedAt?.message}><input aria-label="Fecha y hora real de recepción" type="datetime-local" className={inputClass} {...form.register('receivedAt')} /></Field>
      <p className="text-sm">Zona horaria del formulario: {Intl.DateTimeFormat().resolvedOptions().timeZone}.</p><button className={buttonClass} disabled={mutation.isPending}>Revisar registro</button>
    </form>}
    {confirmation && <section aria-label="Confirmar comunicación recibida" className="space-y-3 rounded border p-3"><h2 className="font-semibold">Confirmar registro histórico recibido</h2>
      <p>Remitente externo: {confirmation.sender}</p><p>Para: {confirmation.to.join(', ')}</p><p>CC: {confirmation.cc.join(', ') || 'Sin destinatarios'}</p><p>CCO: {confirmation.bcc.join(', ') || 'Sin destinatarios'}</p><p className="whitespace-pre-wrap">Asunto: {confirmation.subject}</p><pre className="max-h-72 overflow-auto whitespace-pre-wrap font-sans">{confirmation.body}</pre><p>Fecha real: {new Date(confirmation.receivedAt).toLocaleString('es-BO')}</p>
      <button className={buttonClass} disabled={mutation.isPending} onClick={() => { requestKey.current ??= crypto.randomUUID(); void mutation.mutateAsync({ processId, body: confirmation, requestKey: requestKey.current }).then(row => { if (communicationIdentityMatches(client, identity)) navigate('/communications/' + row.id); }).catch(() => undefined); }}>Confirmar registro</button>{' '}
      <button className={buttonClass} disabled={mutation.isPending} onClick={() => { setConfirmation(null); mutation.reset(); }}>Volver sin registrar</button>
    </section>}
    <MutationError error={mutation.error} />{mutation.error && <button className={buttonClass} onClick={() => { void process.refetch(); }}>Recargar proceso</button>}
  </section>;
}
