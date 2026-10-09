import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '../../components/ui/actions';
import { Alert } from '../../components/ui/feedback';
import { FormActions, FormField, Input } from '../../components/ui/forms';
import { Surface } from '../../components/ui/layout';
import { apiRequest } from '../../lib/api/client';
import { NEW_PASSWORD_MESSAGE, validNewPassword } from '../auth/password-policy';
import { PasswordRequirements } from '../auth/password-requirements';
import { useAdministrationAction } from './use-administration-action';

const schema = z.object({ password: z.string().refine(validNewPassword, NEW_PASSWORD_MESSAGE), confirmation: z.string() })
  .refine(fields => fields.password.normalize('NFC') === fields.confirmation.normalize('NFC'), {
    message: 'Las contraseñas no coinciden.', path: ['confirmation'],
  });
type Fields = z.infer<typeof schema>;

export function AdminPasswordResetForm({ userId, actorId, open, saved, onClose, onSaved, panelId }: {
  userId: string; actorId: string; open: boolean; saved: boolean; onClose: () => void; onSaved: () => void; panelId: string;
}) {
  const client = useQueryClient();
  const action = useAdministrationAction();
  const { register, handleSubmit, reset, control, formState: { errors } } = useForm<Fields>({
    resolver: zodResolver(schema), defaultValues: { password: '', confirmation: '' },
  });
  const password = useWatch({ control, name: 'password' });

  useEffect(() => { if (open) reset(); }, [open, reset]);

  if (!open && !saved) return null;

  const cancel = () => { reset(); onClose(); };

  return <Surface id={panelId} className="user-auxiliary-panel user-password-reset-panel" heading="Restablecer contraseña">
    {open && <form aria-label="Restablecer contraseña del usuario" className="user-password-reset-form" noValidate
      onSubmit={handleSubmit(fields => action.run(async () => {
        const body = JSON.stringify({ password: fields.password });
        await apiRequest(`users/${userId}/password`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
        reset();
        onSaved();
        await client.invalidateQueries({ queryKey: ['users', actorId] });
      }))}>
      <p>El usuario ingresará con esta contraseña y deberá cambiarla al iniciar sesión. Sus sesiones actuales se cerrarán.</p>
      <FormField label="Contraseña inicial" id={`reset-password-${userId}`} error={errors.password?.message} required>
        {control => <><Input {...control} type="password" autoComplete="new-password" {...register('password')} disabled={action.pending}/>
          <PasswordRequirements password={password}/></>}</FormField>
      <FormField label="Confirmar contraseña inicial" id={`reset-password-confirm-${userId}`} error={errors.confirmation?.message} required>
        {control => <Input {...control} type="password" autoComplete="new-password" {...register('confirmation')} disabled={action.pending}/>}</FormField>
      {action.error && <Alert tone="danger" role="alert">{action.error}</Alert>}
      <FormActions><Button type="button" onClick={cancel}>Cancelar</Button><Button type="submit" variant="primary" pending={action.pending} disabled={action.pending}>
        {action.pending ? 'Guardando…' : 'Guardar contraseña inicial'}</Button></FormActions>
    </form>}
    {saved && <Alert tone="success" role="status">Contraseña restablecida. El usuario deberá cambiarla al iniciar sesión.</Alert>}
  </Surface>;
}
