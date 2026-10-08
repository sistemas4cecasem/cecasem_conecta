import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { AuthIdentity } from '../auth/session';
import type { Communication } from './contracts';
import { MutationError } from '../directory/directory-ui';
import { amendmentFormSchema } from './amendment-contracts';
import { useAmendments, useCommunicationAmendment } from './queries';
import { Button } from '../../components/ui/actions';
import { FormField, Textarea, FormActions } from '../../components/ui/forms';
import { Surface } from '../../components/ui/layout';
import { EmptyState, QueryFeedback } from '../../components/ui/feedback';
type Action = 'CORRECTION' | 'ANNOTATION' | 'INVALIDATION';
const labels = { CORRECTION: 'Corrección', ANNOTATION: 'Observación', INVALIDATION: 'Invalidación' };
function canInvalidateCommunication(identity: AuthIdentity, row: Pick<Communication, 'registeredBy' | 'validity'>) {
  return row.validity === 'VALID' && identity.permissions.includes('communications.invalidate') &&
    (identity.role === 'ADMINISTRATOR' || identity.role === 'BOARD' || identity.id === row.registeredBy.id);
}
function AmendmentForm({ identity, row, action, close }: { identity: AuthIdentity; row: Communication; action: Action; close: () => void }) {
  const form = useForm<{ content: string }>({ resolver: zodResolver(amendmentFormSchema), defaultValues: { content: '' } });
  const mutation = useCommunicationAmendment(identity, row.id), [attempt, setAttempt] = useState<{ content: string; key: string } | null>(null);
  return <form aria-label={labels[action]} className="space-y-3 rounded border p-4" onSubmit={form.handleSubmit(async values => {
    if (mutation.isPending) return;
    const requestAttempt = attempt?.content === values.content ? attempt : { content: values.content, key: crypto.randomUUID() }; setAttempt(requestAttempt);
    try { await mutation.mutateAsync({ type: action, content: values.content, requestKey: requestAttempt.key }); close(); } catch { /* Conserva borrador y clave del mismo intento. */ }
  })}>
    <h3 className="font-semibold">{labels[action]}</h3>
    <p>{action === 'CORRECTION' ? 'La corrección no reemplazará el contenido original.' : action === 'ANNOTATION' ? 'Esta observación añade contexto a esta comunicación específica.' : 'La comunicación permanecerá visible en el historial, pero dejará de considerarse válida para el contexto operativo.'}</p>
    <FormField label={action === 'INVALIDATION' ? 'Motivo obligatorio' : 'Contenido'} error={form.formState.errors.content?.message}>{control => <Textarea {...control} aria-label={action === 'INVALIDATION' ? 'Motivo obligatorio' : 'Contenido'} maxLength={5000} {...form.register('content')} />}</FormField>
    {action === 'INVALIDATION' && <label className="block"><input type="checkbox" required disabled={mutation.isPending} /> Confirmo la invalidación de esta comunicación</label>}
    <FormActions><Button type="submit" variant={action === 'INVALIDATION' ? 'danger' : 'primary'} disabled={mutation.isPending}>{mutation.isPending ? 'Registrando…' : action === 'INVALIDATION' ? 'Confirmar invalidación' : 'Registrar ' + labels[action].toLowerCase()}</Button>
    <Button type="button" disabled={mutation.isPending} onClick={close}>Cancelar</Button></FormActions><MutationError modern error={mutation.error} />
  </form>;
}
export function CommunicationAmendments({ identity, row }: { identity: AuthIdentity; row: Communication }) {
  const [page, setPage] = useState(1), [action, setAction] = useState<Action | null>(null), query = useAmendments(identity, row.id, page);
  const allowed = { CORRECTION: row.validity === 'VALID' && identity.permissions.includes('communications.amend'), ANNOTATION: identity.permissions.includes('communications.amend'), INVALIDATION: canInvalidateCommunication(identity, row) };
  return <Surface aria-label="Correcciones y observaciones" heading="Correcciones y observaciones" description="Registros posteriores que conservan el contenido original." className="communication-amendments">
    <QueryFeedback pending={query.isPending} error={query.isError} retry={query.refetch} />
    {query.data?.total === 0 && <EmptyState title="Sin correcciones ni observaciones posteriores." />}
    <ol className="space-y-2">{query.data?.items.map(item => <li key={item.id} className="min-w-0"><h3>{labels[item.type]}</h3><p>{item.author.displayName}{!item.author.isActive && ' (cuenta inactiva)'} · <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString('es-BO')}</time></p><p className="whitespace-pre-wrap">{item.content}</p></li>)}</ol>
    {query.data && <div><Button disabled={page === 1} onClick={() => setPage(page - 1)}>Anteriores</Button><span> Página {page} </span><Button disabled={page * 25 >= query.data.total} onClick={() => setPage(page + 1)}>Siguientes</Button></div>}
    <div className="flex flex-wrap gap-2">{(['CORRECTION', 'ANNOTATION', 'INVALIDATION'] as const).map(value => allowed[value] && <Button key={value} disabled={!!action} onClick={() => setAction(value)}>{value === 'INVALIDATION' ? 'Invalidar comunicación' : 'Agregar ' + labels[value].toLowerCase()}</Button>)}</div>
    {action && allowed[action] && <AmendmentForm key={action} identity={identity} row={row} action={action} close={() => { setAction(null); }} />}
  </Surface>;
}
