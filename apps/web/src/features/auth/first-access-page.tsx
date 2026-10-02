import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useLayoutEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import { ApiError, apiRequest } from '../../lib/api/client';
import { AUTH_QUERY_KEY, useSession } from './session';

const INVALID_TOKEN_MESSAGE = 'El enlace o token de primer acceso no es válido o ya no está disponible.';
const passwordLength = (value: string) => [...value.normalize('NFC')].length;
const schema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Introduce el token de primer acceso recibido.'),
  password: z.string().refine((value) => passwordLength(value) >= 15 && passwordLength(value) <= 128,
    'La contraseña debe contener entre 15 y 128 caracteres.'),
  confirmPassword: z.string(),
}).refine((fields) => fields.password.normalize('NFC') === fields.confirmPassword.normalize('NFC'), {
  message: 'Las contraseñas no coinciden.', path: ['confirmPassword'],
});
type FirstAccessFields = z.infer<typeof schema>;

export function FirstAccessPage() {
  const session = useSession();
  const client = useQueryClient();
  const navigate = useNavigate();
  const initialized = useRef(false);
  const sending = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, setValue, resetField, reset, formState: { errors } } = useForm<FirstAccessFields>({
    resolver: zodResolver(schema), defaultValues: { token: '', password: '', confirmPassword: '' },
  });

  useLayoutEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const fragment = window.location.hash;
    if (fragment) {
      const token = new URLSearchParams(fragment.slice(1)).get('token');
      window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
      if (token) setValue('token', token);
    }
  }, [setValue]);

  async function logout() {
    if (sending.current) return;
    sending.current = true; setPending(true); setError(null);
    try {
      await apiRequest('auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      await client.cancelQueries();
      client.removeQueries({ predicate: (query) => query.queryKey[0] !== AUTH_QUERY_KEY[0] || query.queryKey[1] !== AUTH_QUERY_KEY[1] });
      client.getMutationCache().clear();
      client.setQueryData(AUTH_QUERY_KEY, null);
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : 'No se pudo cerrar la sesión. Intenta nuevamente.');
    } finally { sending.current = false; setPending(false); }
  }

  async function submit(fields: FirstAccessFields) {
    if (sending.current || session.data || session.isPending || session.isError) return;
    sending.current = true; setPending(true); setError(null);
    const body = JSON.stringify({ token: fields.token, password: fields.password });
    resetField('password'); resetField('confirmPassword');
    fields.password = ''; fields.confirmPassword = ''; fields.token = '';
    try {
      await apiRequest('auth/first-access', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      reset();
      navigate('/login', { replace: true, state: { firstAccessCompleted: true } });
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 409) {
        setError('Hay una sesión abierta. Ciérrala antes de continuar.');
        await session.refetch();
      } else setError(failure instanceof ApiError && failure.status === 400 ?
        (failure.message === 'La contraseña nueva debe contener entre 15 y 128 caracteres.' ? failure.message : INVALID_TOKEN_MESSAGE) :
        failure instanceof ApiError ? failure.message : 'No se pudo completar el primer acceso. Intenta nuevamente.');
    } finally { sending.current = false; setPending(false); }
  }

  return <section className="w-full max-w-md" aria-labelledby="first-access-title">
    <h1 id="first-access-title" className="text-3xl font-semibold">Primer acceso</h1>
    <p className="mt-3 text-slate-600">Establece tu contraseña para completar el primer acceso.</p>
    {session.isPending ? <p role="status" className="mt-4">Comprobando sesión…</p> : session.isError ?
      <div className="mt-4"><p role="alert">No se pudo comprobar la sesión. Revisa tu conexión.</p>
        <button className="min-h-11 underline" onClick={() => void session.refetch()}>Reintentar</button></div> : session.data ?
      <div className="mt-6 space-y-3"><p>Existe una sesión abierta de {session.data.givenNames} {session.data.familyNames} ({session.data.email}).</p>
        <p>Ciérrala para continuar con el primer acceso.</p>
        <button disabled={pending} className="min-h-11 rounded border px-3 py-2" onClick={() => void logout()}>
          {pending ? 'Cerrando sesión…' : 'Cerrar sesión y continuar'}</button></div> :
      <form onSubmit={(event) => void handleSubmit(submit)(event)} noValidate className="mt-8 space-y-5">
        <div><label htmlFor="first-access-token" className="block font-medium">Token de primer acceso</label>
          <input id="first-access-token" type="password" autoComplete="off" {...register('token')} disabled={pending}
            aria-invalid={!!errors.token} aria-describedby={errors.token ? 'token-error' : 'token-help'}
            className="mt-2 min-h-11 w-full rounded border border-slate-400 px-3" />
          <p id="token-help" className="mt-2 text-sm text-slate-600">Si no abriste un enlace, pega la credencial recibida. Al recargar tendrás que pegarla nuevamente.</p>
          {errors.token && <p id="token-error" role="alert">{errors.token.message}</p>}</div>
        <p className="text-sm text-slate-600">Usa entre 15 y 128 caracteres. Puedes incluir espacios y caracteres Unicode.</p>
        {(['password', 'confirmPassword'] as const).map((field) => <div key={field}>
          <label htmlFor={field} className="block font-medium">{field === 'password' ? 'Contraseña nueva' : 'Confirmar contraseña'}</label>
          <input id={field} type="password" autoComplete="new-password" {...register(field)} disabled={pending}
            aria-invalid={!!errors[field]} aria-describedby={errors[field] ? `${field}-error` : undefined}
            className="mt-2 min-h-11 w-full rounded border border-slate-400 px-3" />
          {errors[field] && <p id={`${field}-error`} role="alert">{errors[field].message}</p>}</div>)}
        <button disabled={pending} type="submit" className="min-h-11 w-full rounded bg-slate-900 px-5 py-3 font-medium text-white disabled:opacity-60">
          {pending ? 'Estableciendo contraseña…' : 'Establecer contraseña'}</button>
      </form>}
    {error && <p role="alert" className="mt-4">{error}</p>}
  </section>;
}
