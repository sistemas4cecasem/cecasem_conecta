import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { AuthIdentity } from '../auth/session';
import type { Communication } from './contracts';
import { buttonClass, Field, inputClass, MutationError, QueryState } from '../directory/directory-ui';
import { amendmentFormSchema } from './amendment-contracts';
import { useAmendments, useCommunicationAmendment } from './queries';
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
    <Field label={action === 'INVALIDATION' ? 'Motivo obligatorio' : 'Contenido'} error={form.formState.errors.content?.message}><textarea aria-label={action === 'INVALIDATION' ? 'Motivo obligatorio' : 'Contenido'} className={inputClass} maxLength={5000} {...form.register('content')} /></Field>
    {action === 'INVALIDATION' && <label className="block"><input type="checkbox" required disabled={mutation.isPending} /> Confirmo la invalidación de esta comunicación</label>}
    <button className={buttonClass} disabled={mutation.isPending}>{mutation.isPending ? 'Registrando…' : action === 'INVALIDATION' ? 'Confirmar invalidación' : 'Registrar ' + labels[action].toLowerCase()}</button>
    <button className={buttonClass} type="button" disabled={mutation.isPending} onClick={close}>Cancelar</button><MutationError error={mutation.error} />
  </form>;
}
export function CommunicationAmendments({ identity, row }: { identity: AuthIdentity; row: Communication }) {
  const [page, setPage] = useState(1), [action, setAction] = useState<Action | null>(null), query = useAmendments(identity, row.id, page);
  const allowed = { CORRECTION: row.validity === 'VALID' && identity.permissions.includes('communications.amend'), ANNOTATION: identity.permissions.includes('communications.amend'), INVALIDATION: canInvalidateCommunication(identity, row) };
  return <section aria-label="Correcciones y observaciones" className="space-y-3"><h2 className="text-xl font-semibold">Correcciones y observaciones</h2>
    <QueryState pending={query.isPending} error={query.isError} retry={query.refetch} />
    {query.data?.total === 0 && <p>Sin correcciones ni observaciones posteriores.</p>}
    <ol className="space-y-2">{query.data?.items.map(item => <li key={item.id} className="rounded border p-3"><h3>{labels[item.type]}</h3><p>{item.author.displayName}{!item.author.isActive && ' (cuenta inactiva)'} · {new Date(item.createdAt).toLocaleString('es-BO')}</p><p className="whitespace-pre-wrap">{item.content}</p></li>)}</ol>
    {query.data && <div><button className={buttonClass} disabled={page === 1} onClick={() => setPage(page - 1)}>Anteriores</button><span> Página {page} </span><button className={buttonClass} disabled={page * 25 >= query.data.total} onClick={() => setPage(page + 1)}>Siguientes</button></div>}
    <div className="flex flex-wrap gap-2">{(['CORRECTION', 'ANNOTATION', 'INVALIDATION'] as const).map(value => allowed[value] && <button key={value} className={buttonClass} disabled={!!action} onClick={() => setAction(value)}>{value === 'INVALIDATION' ? 'Invalidar comunicación' : 'Agregar ' + labels[value].toLowerCase()}</button>)}</div>
    {action && allowed[action] && <AmendmentForm key={action} identity={identity} row={row} action={action} close={() => { setAction(null); }} />}
  </section>;
}
