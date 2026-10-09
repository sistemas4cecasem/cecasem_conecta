import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { Button } from '../../components/ui/actions';
import { Alert } from '../../components/ui/feedback';
import { FormActions, FormField, Input } from '../../components/ui/forms';
import { apiRequest } from '../../lib/api/client';
import { useSession } from '../auth/session';
import { updateUserProfileSchema, type AdministrativeUser } from './contracts';
import { useAdministrationAction } from './use-administration-action';

type ProfileFields = z.infer<typeof updateUserProfileSchema>;

export function UserProfileForm({ user, actorId }: { user: AdministrativeUser; actorId: string }) {
  const client = useQueryClient();
  const session = useSession();
  const action = useAdministrationAction();
  const [saved, setSaved] = useState(false);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<ProfileFields>({
    resolver: zodResolver(updateUserProfileSchema),
    defaultValues: { givenNames: user.givenNames, familyNames: user.familyNames, email: user.email },
  });

  useEffect(() => {
    reset({ givenNames: user.givenNames, familyNames: user.familyNames, email: user.email });
  }, [user.givenNames, user.familyNames, user.email, reset]);

  return <form aria-label={`Editar datos de ${user.username}`} className="user-profile-form" noValidate
    onSubmit={handleSubmit(fields => action.run(async () => {
      setSaved(false);
      await apiRequest(`users/${user.id}/profile`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields),
      });
      setSaved(true);
      await client.invalidateQueries({ queryKey: ['users', actorId] });
      if (user.id === session.data?.id) await session.refetch();
    }))}>
    <div className="user-profile-fields">
      <FormField label="Nombres" id={`given-names-${user.id}`} error={errors.givenNames?.message} required>
        {control => <Input {...control} {...register('givenNames')} disabled={action.pending}/>}</FormField>
      <FormField label="Apellidos" id={`family-names-${user.id}`} error={errors.familyNames?.message} required>
        {control => <Input {...control} {...register('familyNames')} disabled={action.pending}/>}</FormField>
      <FormField label="Nombre de usuario" id={`username-${user.id}`} help="Se genera automáticamente y no se puede editar.">
        {control => <Input {...control} value={user.username} readOnly aria-readonly="true"/>}
      </FormField>
      <FormField label="Correo electrónico" id={`email-${user.id}`} error={errors.email?.message} required>
        {control => <Input {...control} type="email" autoComplete="email" {...register('email')} disabled={action.pending}/>}</FormField>
    </div>
    {action.error && <Alert tone="danger" role="alert">{action.error}</Alert>}
    {saved && <Alert tone="success" role="status">Información de usuario actualizada.</Alert>}
    <FormActions><Button type="submit" pending={action.pending} disabled={action.pending}>
      {action.pending ? 'Guardando…' : 'Guardar información'}</Button></FormActions>
  </form>;
}
