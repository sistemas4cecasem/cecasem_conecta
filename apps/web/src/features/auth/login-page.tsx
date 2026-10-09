import { AuthFormSurface } from './auth-form-surface';
import { FormField, Input, FieldHelp, FormActions } from '../../components/ui/forms';
import { Button } from '../../components/ui/actions';
import { Alert } from '../../components/ui/feedback';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useNavigate } from 'react-router';
import { z } from 'zod';
import { ApiError, apiRequest } from '../../lib/api/client';
import { AUTH_QUERY_KEY, identitySchema, useSession } from './session';

const schema = z.object({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email('Introduce un correo válido.')),
  password: z.string().min(1, 'Introduce tu contraseña.').refine((value) => value.length <= 256 &&
    [...value.normalize('NFC')].length <= 128, 'La contraseña debe tener como máximo 128 caracteres.'),
});
type LoginFields = z.infer<typeof schema>;

export function LoginPage() {
  const session = useSession();
  const client = useQueryClient();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, resetField, formState: { errors } } = useForm<LoginFields>({
    resolver: zodResolver(schema), defaultValues: { email: '', password: '' },
  });

  async function submit(fields: LoginFields) {
    setPending(true); setError(null);
    // El secreto no entra en variables/caché de mutaciones de TanStack Query.
    const body = JSON.stringify(fields);
    resetField('password');
    fields.password = '';
    try {
      const identity = identitySchema.parse(await apiRequest('auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
      }));
      await client.cancelQueries();
      client.clear();
      client.setQueryData(AUTH_QUERY_KEY, identity);
      void client.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
      navigate('/', { replace: true });
    } catch (failure) {
      setError(failure instanceof ApiError && failure.status === 401 ? 'Credenciales no válidas. Revisa tu correo y contraseña.' :
        failure instanceof ApiError ? failure.message : 'No se pudo iniciar sesión. Intenta nuevamente.');
    } finally { setPending(false); }
  }

  if (session.isPending) return <p role="status">Comprobando sesión…</p>;
  if (session.data) return <Navigate to="/" replace />;

  return <AuthFormSurface title="Iniciar sesión" titleId="login-title" description="Accede con tu cuenta de CECASEM.">
    {session.isError && <Alert tone="danger" role="alert">No se pudo comprobar la sesión. Puedes intentar iniciar sesión nuevamente.</Alert>}
    <form onSubmit={handleSubmit(submit)} noValidate>
      <FormField id="email" label="Correo electrónico" error={errors.email?.message}>{control =>
        <Input {...control} type="email" autoComplete="username" {...register('email')} disabled={pending}/>}</FormField>
      <FormField id="password" label="Contraseña" error={errors.password?.message}>{control =>
        <Input {...control} type="password" autoComplete="current-password" {...register('password')} disabled={pending}/>}</FormField>
      {error && <Alert tone="danger" role="alert">{error}</Alert>}
      <FormActions><Button type="submit" variant="primary" className="auth-submit" pending={pending} disabled={pending}>
        {pending ? 'Ingresando…' : 'Iniciar sesión'}</Button></FormActions>
    </form>
    <FieldHelp>Si no puedes ingresar, solicita al Administrador que restablezca tu contraseña.</FieldHelp>
  </AuthFormSurface>;
}
