import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation, useNavigate } from 'react-router';
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
  const location = useLocation();
  const navigationState: unknown = location.state;
  const firstAccessCompleted = typeof navigationState === 'object' && navigationState !== null &&
    'firstAccessCompleted' in navigationState && navigationState.firstAccessCompleted === true;
  const passwordResetCompleted = typeof navigationState === 'object' && navigationState !== null &&
    'passwordResetCompleted' in navigationState && navigationState.passwordResetCompleted === true;
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

  return <section className="w-full max-w-md" aria-labelledby="login-title">
    <h1 id="login-title" className="text-3xl font-semibold">Iniciar sesión</h1>
    <p className="mt-3 text-slate-600">Accede con tu cuenta de CECASEM.</p>
    {firstAccessCompleted && <p role="status" className="mt-4">Contraseña establecida correctamente. Ya puedes iniciar sesión.</p>}
    {passwordResetCompleted && <p role="status" className="mt-4">Contraseña restablecida correctamente. Ya puedes iniciar sesión.</p>}
    {session.isError && <p role="alert" className="mt-4">No se pudo comprobar la sesión. Puedes intentar iniciar sesión nuevamente.</p>}
    <form onSubmit={handleSubmit(submit)} noValidate className="mt-8 space-y-5">
      <div><label htmlFor="email" className="block font-medium">Correo electrónico</label>
        <input id="email" type="email" autoComplete="username" {...register('email')} disabled={pending}
          aria-invalid={!!errors.email} aria-describedby={errors.email ? 'email-error' : undefined}
          className="mt-2 min-h-11 w-full rounded border border-slate-400 px-3" />
        {errors.email && <p id="email-error" role="alert">{errors.email.message}</p>}</div>
      <div><label htmlFor="password" className="block font-medium">Contraseña</label>
        <input id="password" type="password" autoComplete="current-password" {...register('password')} disabled={pending}
          aria-invalid={!!errors.password} aria-describedby={errors.password ? 'password-error' : undefined}
          className="mt-2 min-h-11 w-full rounded border border-slate-400 px-3" />
        {errors.password && <p id="password-error" role="alert">{errors.password.message}</p>}</div>
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={pending} className="min-h-11 w-full rounded bg-slate-900 px-5 py-3 font-medium text-white disabled:opacity-60">
        {pending ? 'Ingresando…' : 'Iniciar sesión'}</button>
    </form>
  </section>;
}
