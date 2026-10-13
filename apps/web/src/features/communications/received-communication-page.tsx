import { FormSection, FormActions } from '../../components/ui/forms';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { useNavigate, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useSession, type AuthIdentity } from '../auth/session';
import { buttonClass, Field, inputClass, MutationError, QueryState } from '../directory/directory-ui';
import { useProcess } from '../relationships/process-queries';
import { RelationshipContextPanel } from '../relationships/relationship-context-panel';
import { communicationIdentityKey, communicationIdentityMatches, useReceivedCommunication } from './queries';
import { receivedBody, receivedFormSchema, type ReceivedBody } from './contracts';
import { PageHeader } from '../../components/ui/layout';
import { ActionLink, Button } from '../../components/ui/actions';
import { Alert, ConfirmationPanel } from '../../components/ui/feedback';
export function ReceivedCommunicationPage() {
  const identity = useSession().data, { id = '' } = useParams();
  if (!identity?.permissions.includes('communications.received.create') || !identity.permissions.includes('relationships.process.read')) return <p role="alert">No tienes permiso para registrar comunicaciones recibidas.</p>;
  return <ReceivedForm key={communicationIdentityKey(identity).join(':') + ':' + id} identity={identity} processId={id} />;
}
function ReceivedForm({ identity, processId }: { identity: AuthIdentity; processId: string }) {
  const process = useProcess(identity, processId), mutation = useReceivedCommunication(identity), navigate = useNavigate(), client = useQueryClient();
  const [confirmation, setConfirmation] = useState<ReceivedBody | null>(null), requestKey = useRef<string | null>(null);
  const form = useForm<z.infer<typeof receivedFormSchema>>({ resolver: zodResolver(receivedFormSchema), defaultValues: { sender: '', to: '', cc: '', bcc: '', subject: '', body: '', receivedAt: '' } });
  return <section className="ui-editor-page"><PageHeader eyebrow="Relaciones / Comunicaciones" title="Registrar comunicación recibida" back={<ActionLink appearance="back" to={'/relationship-processes/' + processId}>Volver al proceso</ActionLink>} />
    <Alert tone="neutral">Documenta una comunicación externa realmente recibida. El remitente identifica el origen del mensaje; tu usuario identifica quién lo registra. No necesitas tener asignado el buzón receptor. El contenido original quedará como registro histórico sin edición ordinaria. Registra CCO únicamente cuando lo conozcas.</Alert>
    <QueryState pending={process.isPending} error={process.isError} retry={process.refetch} />
    {process.data?.state === 'CLOSED' && <Alert role="status" tone="warning"><p>Esta comunicación se registrará como respuesta recibida en un proceso cerrado. Después puede ser necesario reabrir el proceso.</p><p>El registro conservará el cierre y no ejecutará una reapertura automática.</p></Alert>}
    <RelationshipContextPanel identity={identity} target={process.data?.target ?? null} />
    <p>Una restricción activa no impide documentar esta entrada y seguirá vigente después del registro.</p>
    {process.data && <form className="ui-editor-form" onChange={() => setConfirmation(null)} onSubmit={form.handleSubmit(values => setConfirmation(receivedBody(values)))}>
      <FormSection heading="Remitente y destinatarios"><Field label="Remitente externo" error={form.formState.errors.sender?.message}><input aria-label="Remitente externo" type="email" className={inputClass} maxLength={254} {...form.register('sender')} /></Field>
      <p>Separa las direcciones observadas con comas, punto y coma o saltos de línea. Pueden ser cuentas CECASEM u otras direcciones.</p>
      {(['to', 'cc', 'bcc'] as const).map(field => <Field key={field} label={field === 'to' ? 'Para' : field === 'cc' ? 'CC' : 'CCO'} error={form.formState.errors[field]?.message}><textarea aria-label={field === 'to' ? 'Para' : field === 'cc' ? 'CC' : 'CCO'} className={inputClass} rows={2} maxLength={25600} {...form.register(field)} /></Field>)}
      </FormSection>
      <FormSection heading="Contenido original"><Field label="Asunto" error={form.formState.errors.subject?.message}><input aria-label="Asunto" className={inputClass} maxLength={998} {...form.register('subject')} /></Field>
      <Field label="Cuerpo original" error={form.formState.errors.body?.message}><textarea aria-label="Cuerpo original" className={inputClass} rows={12} maxLength={200000} {...form.register('body')} /></Field>
      </FormSection>
      <FormSection heading="Fecha del hecho"><Field label="Fecha y hora real de recepción" error={form.formState.errors.receivedAt?.message}><input aria-label="Fecha y hora real de recepción" type="datetime-local" className={inputClass} {...form.register('receivedAt')} /></Field>
      <p className="text-sm">Zona horaria del formulario: {Intl.DateTimeFormat().resolvedOptions().timeZone}.</p></FormSection><FormActions><Button type="submit" variant="primary" disabled={mutation.isPending}>Revisar registro</Button></FormActions>
    </form>}
    {confirmation && <ConfirmationPanel aria-label="Confirmar comunicación recibida" title="Confirmar registro histórico recibido">
      <p>Remitente externo: {confirmation.sender}</p><p>Para: {confirmation.to.join(', ')}</p><p>CC: {confirmation.cc.join(', ') || 'Sin destinatarios'}</p><p>CCO: {confirmation.bcc.join(', ') || 'Sin destinatarios'}</p><p className="whitespace-pre-wrap">Asunto: {confirmation.subject}</p><pre className="max-h-72 overflow-auto whitespace-pre-wrap font-sans">{confirmation.body}</pre><p>Fecha real: {new Date(confirmation.receivedAt).toLocaleString('es-BO')}</p>
      <Button variant="primary" disabled={mutation.isPending} onClick={() => { requestKey.current ??= crypto.randomUUID(); void mutation.mutateAsync({ processId, body: confirmation, requestKey: requestKey.current }).then(row => { if (communicationIdentityMatches(client, identity)) navigate('/communications/' + row.id); }).catch(() => undefined); }}>Confirmar registro</Button>{' '}
      <Button disabled={mutation.isPending} onClick={() => { setConfirmation(null); mutation.reset(); }}>Volver sin registrar</Button>
    </ConfirmationPanel>}
    <MutationError error={mutation.error} />{mutation.error && <button className={buttonClass} onClick={() => { void process.refetch(); }}>Recargar proceso</button>}
  </section>;
}
