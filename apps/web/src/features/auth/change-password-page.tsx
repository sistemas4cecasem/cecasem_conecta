import { Navigate, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '../../components/ui/actions';
import { Alert, QueryFeedback } from '../../components/ui/feedback';
import { FieldHelp, FormActions, FormField, Input } from '../../components/ui/forms';
import { ApiError, apiRequest } from '../../lib/api/client';
import { AuthFormSurface } from './auth-form-surface';
import { AUTH_QUERY_KEY, useSession } from './session';
import { NEW_PASSWORD_MESSAGE, validNewPassword } from './password-policy';
import { PasswordRequirements } from './password-requirements';

const schema = z.object({
  password: z.string().refine(validNewPassword, NEW_PASSWORD_MESSAGE),
  confirmPassword: z.string(),
}).refine(fields => fields.password.normalize('NFC') === fields.confirmPassword.normalize('NFC'), {
  message: 'Las contraseñas no coinciden.', path: ['confirmPassword'],
});
type PasswordFields = z.infer<typeof schema>;

export function ChangePasswordPage() {
  const session = useSession();
  const client = useQueryClient();
  const navigate = useNavigate();
  const sending = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, reset, control, formState: { errors } } = useForm<PasswordFields>({
    resolver: zodResolver(schema), defaultValues: { password: '', confirmPassword: '' },
  });
  const password = useWatch({ control, name: 'password' });

  async function logout() {
    if (sending.current) return;
    sending.current = true; setPending(true); setError(null);
    try {
      await apiRequest('auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      await client.cancelQueries(); client.clear(); client.setQueryData(AUTH_QUERY_KEY, null);
      navigate('/login', { replace: true });
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : 'No se pudo cerrar la sesión. Intenta nuevamente.');
    } finally { sending.current = false; setPending(false); }
  }

  async function submit(fields: PasswordFields) {
    if (sending.current || !session.data?.mustChangePassword) return;
    sending.current = true; setPending(true); setError(null);
    const body = JSON.stringify({ password: fields.password });
    reset();
    try {
      await apiRequest('auth/change-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      const refreshed = await session.refetch();
      if (!refreshed.data?.mustChangePassword) navigate('/', { replace: true });
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : 'No se pudo cambiar la contraseña. Intenta nuevamente.');
    } finally { sending.current = false; setPending(false); }
  }

  if (session.isPending || session.isError) return <QueryFeedback pending={session.isPending} pendingMessage="Comprobando sesión…"
    error={session.isError} errorMessage="No se pudo comprobar la sesión. Revisa tu conexión." retry={() => session.refetch()}/>;
  if (!session.data) return <Navigate to="/login" replace />;
  if (!session.data.mustChangePassword) return <Navigate to="/" replace />;

  return <AuthFormSurface title="Cambia tu contraseña" titleId="change-password-title"
    description="Por seguridad, debes reemplazar la contraseña inicial antes de continuar.">
    <form onSubmit={event => void handleSubmit(submit)(event)} noValidate>
      <FieldHelp id="new-password-help">Elige una contraseña que no hayas usado como contraseña inicial.</FieldHelp>
      <PasswordRequirements password={password}/>
      <FormField id="required-new-password" label="Contraseña nueva" error={errors.password?.message}
        describedBy="new-password-help" required>{control => <Input {...control} type="password" autoComplete="new-password"
          {...register('password')} disabled={pending}/>}</FormField>
      <FormField id="required-confirm-password" label="Confirmar contraseña" error={errors.confirmPassword?.message} required>
        {control => <Input {...control} type="password" autoComplete="new-password" {...register('confirmPassword')} disabled={pending}/>}</FormField>
      <FormActions><Button type="submit" variant="primary" className="auth-submit" pending={pending} disabled={pending}>
        {pending ? 'Cambiando contraseña…' : 'Cambiar contraseña'}</Button>
        <Button type="button" disabled={pending} onClick={() => void logout()}>Cerrar sesión</Button></FormActions>
    </form>
    {error && <Alert tone="danger" role="alert">{error}</Alert>}
  </AuthFormSurface>;
}
