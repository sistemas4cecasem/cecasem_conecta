import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { Link, useNavigate, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useSession, type AuthIdentity } from '../auth/session';
import { buttonClass, Field, inputClass, MutationError, QueryState } from '../directory/directory-ui';
import { useProcess } from '../relationships/process-queries';
import { useRelationshipContext } from '../relationships/context-queries';
import { RelationshipContextPanel } from '../relationships/relationship-context-panel';
import { communicationIdentityKey, communicationIdentityMatches, useAvailableAccounts, useSentCommunication } from './queries';
import { sentBody, sentFormSchema, type SentBody } from './contracts';
export function SentCommunicationPage() {
  const identity = useSession().data, { id = '' } = useParams();
  if (!identity?.permissions.includes('communications.sent.create') || !identity.permissions.includes('relationships.process.read')) return <p role="alert">No tienes permiso para registrar comunicaciones enviadas.</p>;
  return <SentForm key={communicationIdentityKey(identity).join(':') + ':' + id} identity={identity} processId={id} />;
}
function SentForm({ identity, processId }: { identity: AuthIdentity; processId: string }) {
  const process = useProcess(identity, processId), accounts = useAvailableAccounts(identity), mutation = useSentCommunication(identity), navigate = useNavigate(), client = useQueryClient();
  const context = useRelationshipContext(identity, process.data?.target ?? null);
  const [confirmation, setConfirmation] = useState<SentBody | null>(null), requestKey = useRef<string | null>(null);
  const form = useForm<z.infer<typeof sentFormSchema>>({ resolver: zodResolver(sentFormSchema), defaultValues: { emailAccountId: '', to: '', cc: '', bcc: '', subject: '', body: '', sentAt: '' } });
  const closed = process.data?.state === 'CLOSED', restricted = context.data?.contactAllowed === false;
  const canRegister = !!process.data && !closed && !restricted && !!accounts.data?.length;
  return <section className="min-w-0 w-full space-y-4 break-words"><h1 className="text-2xl font-semibold">Registrar comunicación enviada</h1><Link className={buttonClass} to={'/relationship-processes/' + processId}>Volver al proceso</Link>
    <p>Registra fielmente un mensaje ya enviado por el canal externo. CECASEM Conecta conserva el hecho y no envía el correo.</p>
    <p>Después de registrar la comunicación, el contenido original no podrá editarse silenciosamente.</p>
    <QueryState pending={process.isPending || accounts.isPending} error={process.isError || accounts.isError} retry={async () => { await Promise.all([process.refetch(), accounts.refetch()]); }} />
    {closed && <p role="alert">El proceso está cerrado. Debe reabrirse mediante la acción autorizada antes de registrar otra comunicación.</p>}
    {accounts.data?.length === 0 && <p role="status">No tienes una cuenta institucional habilitada para registrar comunicaciones.</p>}
    <RelationshipContextPanel identity={identity} target={process.data?.target ?? null} />
    {canRegister && <form className="space-y-4" onChange={() => setConfirmation(null)} onSubmit={form.handleSubmit(values => setConfirmation(sentBody(values)))}>
      <Field label="Cuenta remitente" error={form.formState.errors.emailAccountId?.message}><select aria-label="Cuenta remitente" className={inputClass} {...form.register('emailAccountId')}><option value="">Selecciona una cuenta</option>{accounts.data?.map(account => <option key={account.id} value={account.id}>{account.displayName} · {account.address}</option>)}</select></Field>
      <p>Se usará la dirección de la cuenta seleccionada como remitente.</p><p>Separa destinatarios con comas, punto y coma o saltos de línea. Pueden ser direcciones aún no registradas en el Directorio.</p>
      {(['to', 'cc', 'bcc'] as const).map(field => <Field key={field} label={field === 'to' ? 'Para' : field === 'cc' ? 'CC' : 'CCO'} error={form.formState.errors[field]?.message}><textarea aria-label={field === 'to' ? 'Para' : field === 'cc' ? 'CC' : 'CCO'} className={inputClass} rows={2} maxLength={25600} {...form.register(field)} /></Field>)}
      <Field label="Asunto" error={form.formState.errors.subject?.message}><input aria-label="Asunto" className={inputClass} maxLength={998} {...form.register('subject')} /></Field>
      <Field label="Cuerpo original" error={form.formState.errors.body?.message}><textarea aria-label="Cuerpo original" className={inputClass} rows={12} maxLength={200000} {...form.register('body')} /></Field>
      <Field label="Fecha y hora real de envío" error={form.formState.errors.sentAt?.message}><input aria-label="Fecha y hora real de envío" type="datetime-local" className={inputClass} {...form.register('sentAt')} /></Field>
      <p className="text-sm">Zona horaria del formulario: {Intl.DateTimeFormat().resolvedOptions().timeZone}.</p>
      <button className={buttonClass} disabled={mutation.isPending}>Revisar registro</button>
    </form>}
    {canRegister && confirmation && <section aria-label="Confirmar comunicación enviada" className="space-y-3 rounded border p-3"><h2 className="font-semibold">Confirmar registro histórico</h2>
      <p>Remitente: {accounts.data?.find(account => account.id === confirmation.emailAccountId)?.address}</p><p>Para: {confirmation.to.join(', ')}</p><p>CC: {confirmation.cc.join(', ') || 'Sin destinatarios'}</p><p>CCO: {confirmation.bcc.join(', ') || 'Sin destinatarios'}</p>
      <p className="whitespace-pre-wrap">Asunto: {confirmation.subject}</p><pre className="max-h-72 overflow-auto whitespace-pre-wrap font-sans">{confirmation.body}</pre><p>Fecha real: {new Date(confirmation.sentAt).toLocaleString('es-BO')}</p>
      <button className={buttonClass} disabled={mutation.isPending} onClick={() => { requestKey.current ??= crypto.randomUUID();
        void mutation.mutateAsync({ processId, body: confirmation, requestKey: requestKey.current }).then(row => { if (communicationIdentityMatches(client, identity)) navigate('/communications/' + row.id); }).catch(() => undefined);
      }}>Confirmar registro</button>{' '}<button className={buttonClass} disabled={mutation.isPending} onClick={() => { setConfirmation(null); mutation.reset(); }}>Volver sin registrar</button>
    </section>}
    <MutationError error={mutation.error} />
    {mutation.error && <button className={buttonClass} onClick={() => { void Promise.all([accounts.refetch(), process.refetch(), context.refetch()]); }}>Recargar cuentas y proceso</button>}
  </section>;
}
