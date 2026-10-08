import { Button } from '../../components/ui/actions';
import { FormField, Input, FormSection, FormActions } from '../../components/ui/forms';
import { Alert, StatusBadge, QueryFeedback } from '../../components/ui/feedback';
import { DataList, DataListItem } from '../../components/ui/lists';
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
  if (catalog.isPending || assignments.isPending) return <QueryFeedback pending pendingMessage="Cargando buzones…" error={false}/>;
  if (catalog.isError || assignments.isError) return <Alert tone="danger" role="alert"><p>No se pudieron cargar los buzones.</p>
    <Button onClick={() => { void catalog.refetch(); void assignments.refetch(); }}>Reintentar buzones</Button></Alert>;
  const availableMailboxes = catalog.data.filter(account => !assignments.data.some(assigned => assigned.id === account.id));
  return <section aria-label="Buzones del usuario" className="user-mailboxes">
    <h3 className="user-mailboxes-heading">Buzones institucionales</h3>
    <p>Estas asignaciones registran disponibilidad institucional; no modifican el acceso al proveedor de correo.</p>
    {!assignments.data.length && <p>No hay buzones asignados.</p>}
    {!!assignments.data.length && <DataList aria-label="Buzones asignados">{assignments.data.map(account => <DataListItem key={account.id} className="mailbox-row"><div><p>{account.displayName} — {account.address}</p><StatusBadge tone={account.isActive ? 'success' : 'neutral'}>{account.isActive ? 'Activo' : 'Inactivo'}</StatusBadge>{account.provider && <p className="ui-description">Proveedor: {account.provider}</p>}</div>
      <Button variant="ghost" disabled={action.pending} onClick={() => void action.run(async () => {
        await apiRequest(`users/${userId}/email-accounts/${account.id}`, { method: 'DELETE' }); await client.invalidateQueries({ queryKey: key });
      })}>Retirar {account.address}</Button></DataListItem>)}</DataList>}
    {!!availableMailboxes.length && <FormActions aria-label="Asignar buzones disponibles">{availableMailboxes.map(account =>
      <Button key={account.id} disabled={action.pending} onClick={() => void action.run(async () => {
        await apiRequest(`users/${userId}/email-accounts/${account.id}`, { method: 'PUT' }); await client.invalidateQueries({ queryKey: key });
      })}>Asignar {account.address}</Button>)}</FormActions>}
    <form aria-label="Registrar buzón" noValidate className="mailbox-form" onSubmit={handleSubmit(fields => action.run(async () => {
      await apiRequest('email-accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: fields.address, displayName: fields.displayName, ...(fields.provider ? { provider: fields.provider } : {}) }) });
      reset(); await client.invalidateQueries({ queryKey: ['email-accounts', actorId] });
    }))}>
      <FormSection heading="Registrar buzón institucional" className="administration-fields">
      {(['displayName', 'address', 'provider'] as const).map(field => <FormField key={field}
        label={{displayName:'Nombre del buzón', address:'Correo del buzón', provider:'Proveedor (opcional)'}[field]} id={`mail-${userId}-${field}`} error={errors[field]?.message} required={field !== 'provider'}>
        {control => <Input {...control} aria-required={field !== 'provider' || undefined} {...register(field)} disabled={action.pending} type={field === 'address' ? 'email' : 'text'}/>}
      </FormField>)}
      </FormSection><FormActions><Button type="submit" variant="primary" pending={action.pending} disabled={action.pending}>Registrar buzón</Button></FormActions>
    </form>{action.error && <Alert tone="danger" role="alert">{action.error}</Alert>}
  </section>;
}
