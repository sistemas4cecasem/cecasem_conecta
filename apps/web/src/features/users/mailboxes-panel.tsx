import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { useEffect, useRef } from 'react';
import type { z } from 'zod';
import { apiRequest, ApiError } from '../../lib/api/client';
import { useSession } from '../auth/session';
import { createMailboxSchema, mailboxSchema } from './contracts';
import { useAdministrationAction } from './use-administration-action';

export function MailboxesPanel({ actorId, userId }: { actorId: string; userId: string }) {
  const client = useQueryClient(); const session = useSession(); const refreshed = useRef(false);
  const action = useAdministrationAction();
  const catalog = useQuery({ queryKey: ['email-accounts', actorId], queryFn: async ({ signal }) => mailboxSchema.array().parse(await apiRequest('email-accounts', { signal })) });
  const key = ['users', actorId, userId, 'email-accounts'];
  const assignments = useQuery({ queryKey: key, queryFn: async ({ signal }) => mailboxSchema.array().parse(await apiRequest(`users/${userId}/email-accounts`, { signal })) });
  useEffect(() => {
    if (!refreshed.current && [catalog.error, assignments.error].some(error => error instanceof ApiError && error.status === 403)) {
      refreshed.current = true; void session.refetch();
    }
  }, [catalog.error, assignments.error, session]);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<z.infer<typeof createMailboxSchema>>({
    resolver: zodResolver(createMailboxSchema), defaultValues: { address: '', displayName: '', provider: '' },
  });
  if (catalog.isPending || assignments.isPending) return <p role="status">Cargando buzones…</p>;
  if (catalog.isError || assignments.isError) return <div><p role="alert">No se pudieron cargar los buzones.</p>
    <button className="min-h-11 underline" onClick={() => { void catalog.refetch(); void assignments.refetch(); }}>Reintentar buzones</button></div>;
  return <section aria-label="Buzones del usuario" className="mt-4 border-t pt-3">
    <h3 className="font-semibold">Buzones institucionales</h3>
    <p>Estas asignaciones registran disponibilidad institucional; no modifican el acceso al proveedor de correo.</p>
    {!assignments.data.length && <p>No hay buzones asignados.</p>}
    {assignments.data.map(account => <div key={account.id} className="flex flex-wrap items-center gap-3"><span>{account.displayName} — {account.address}</span>
      <button className="min-h-11 underline" disabled={action.pending} onClick={() => void action.run(async () => {
        await apiRequest(`users/${userId}/email-accounts/${account.id}`, { method: 'DELETE' }); await client.invalidateQueries({ queryKey: key });
      })}>Retirar {account.address}</button></div>)}
    {catalog.data.filter(account => !assignments.data.some(assigned => assigned.id === account.id)).map(account =>
      <button key={account.id} className="mr-3 min-h-11 underline" disabled={action.pending} onClick={() => void action.run(async () => {
        await apiRequest(`users/${userId}/email-accounts/${account.id}`, { method: 'PUT' }); await client.invalidateQueries({ queryKey: key });
      })}>Asignar {account.address}</button>)}
    <form aria-label="Registrar buzón" noValidate className="mt-3 grid gap-3 sm:grid-cols-3" onSubmit={handleSubmit(fields => action.run(async () => {
      await apiRequest('email-accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: fields.address, displayName: fields.displayName, ...(fields.provider ? { provider: fields.provider } : {}) }) });
      reset(); await client.invalidateQueries({ queryKey: ['email-accounts', actorId] });
    }))}>
      {(['displayName', 'address', 'provider'] as const).map((field, index) => <div key={field}>
        <label htmlFor={`mail-${userId}-${field}`}>{['Nombre del buzón', 'Correo del buzón', 'Proveedor (opcional)'][index]}</label>
        <input id={`mail-${userId}-${field}`} {...register(field)} disabled={action.pending} type={field === 'address' ? 'email' : 'text'}
          aria-invalid={!!errors[field]} className="min-h-11 w-full rounded border px-2" />
        {errors[field] && <p role="alert">{errors[field].message}</p>}</div>)}
      <button className="min-h-11 rounded border px-3" disabled={action.pending}>Registrar buzón</button>
    </form>{action.error && <p role="alert">{action.error}</p>}
  </section>;
}
