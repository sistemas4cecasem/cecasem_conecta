import { AuthFormSurface } from './auth-form-surface';
import { FormField, Input, FieldHelp, FormActions } from '../../components/ui/forms';
import { Button } from '../../components/ui/actions';
import { Alert, QueryFeedback } from '../../components/ui/feedback';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useLayoutEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import { ApiError, apiRequest } from '../../lib/api/client';
import { AUTH_QUERY_KEY, useSession } from './session';

const flows = {
  'first-access': { title: 'Primer acceso', description: 'Establece tu contraseña para completar el primer acceso.', tokenLabel: 'Token de primer acceso', endpoint: 'auth/first-access', success: 'firstAccessCompleted', invalid: 'El enlace o token de primer acceso no es válido o ya no está disponible.' },
  'password-reset': { title: 'Restablecer contraseña', description: 'Establece una contraseña nueva para tu cuenta.', tokenLabel: 'Token de restablecimiento', endpoint: 'auth/password-reset', success: 'passwordResetCompleted', invalid: 'El enlace o token de restablecimiento no es válido o ya no está disponible.' },
} as const;
const REUSED_PASSWORD_MESSAGE = 'La nueva contraseña debe ser diferente de la contraseña actual.';
const passwordLength = (value: string) => [...value.normalize('NFC')].length;
const schema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Introduce la credencial temporal recibida.'),
  password: z.string().refine((value) => passwordLength(value) >= 15 && passwordLength(value) <= 128,
    'La contraseña debe contener entre 15 y 128 caracteres.'),
  confirmPassword: z.string(),
}).refine((fields) => fields.password.normalize('NFC') === fields.confirmPassword.normalize('NFC'), {
  message: 'Las contraseñas no coinciden.', path: ['confirmPassword'],
});
type CredentialPasswordFields = z.infer<typeof schema>;

export function CredentialPasswordForm({ flow }: { flow: keyof typeof flows }) {
  const configuration = flows[flow];
  const session = useSession();
  const client = useQueryClient();
  const navigate = useNavigate();
  const initialized = useRef(false);
  const sending = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, setValue, resetField, reset, formState: { errors } } = useForm<CredentialPasswordFields>({
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

  async function submit(fields: CredentialPasswordFields) {
    if (sending.current || session.data || session.isPending || session.isError) return;
    sending.current = true; setPending(true); setError(null);
    const body = JSON.stringify({ token: fields.token, password: fields.password });
    resetField('password'); resetField('confirmPassword');
    fields.password = ''; fields.confirmPassword = ''; fields.token = '';
    try {
      await apiRequest(configuration.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      reset();
      navigate('/login', { replace: true, state: { [configuration.success]: true } });
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 409) {
        setError('Hay una sesión abierta. Ciérrala antes de continuar.');
        await session.refetch();
      } else setError(failure instanceof ApiError && failure.status === 400 ?
        (failure.message === 'La contraseña nueva debe contener entre 15 y 128 caracteres.' || failure.message === REUSED_PASSWORD_MESSAGE ? failure.message : configuration.invalid) :
        failure instanceof ApiError ? failure.message : 'No se pudo establecer la contraseña. Intenta nuevamente.');
    } finally { sending.current = false; setPending(false); }
  }

  return <AuthFormSurface title={configuration.title} titleId="first-access-title" description={configuration.description}>
    {session.isPending || session.isError ? <QueryFeedback pending={session.isPending} pendingMessage="Comprobando sesión…" error={session.isError}
      errorMessage="No se pudo comprobar la sesión. Revisa tu conexión." retry={() => session.refetch()}/> : session.data ?
      <Alert tone="info"><p>Existe una sesión abierta de {session.data.givenNames} {session.data.familyNames} ({session.data.email}).</p>
        <p>Ciérrala para continuar con el formulario.</p>
        <FormActions><Button disabled={pending} pending={pending} onClick={() => void logout()}>
          {pending ? 'Cerrando sesión…' : 'Cerrar sesión y continuar'}</Button></FormActions></Alert> :
      <form onSubmit={(event) => void handleSubmit(submit)(event)} noValidate>
        <FormField id="first-access-token" label={configuration.tokenLabel} error={errors.token?.message}
          help="Si no abriste un enlace, pega la credencial recibida. Al recargar tendrás que pegarla nuevamente.">{control =>
          <Input {...control} type="password" autoComplete="off" {...register('token')} disabled={pending}/>}</FormField>
        <FieldHelp id="password-help">Usa entre 15 y 128 caracteres. Puedes incluir espacios y caracteres Unicode.</FieldHelp>
        {(['password', 'confirmPassword'] as const).map(field => <FormField key={field} id={field}
          label={field === 'password' ? 'Contraseña nueva' : 'Confirmar contraseña'} error={errors[field]?.message} describedBy="password-help">{control =>
          <Input {...control} type="password" autoComplete="new-password" {...register(field)} disabled={pending}/>}</FormField>)}
        <FormActions><Button disabled={pending} pending={pending} type="submit" variant="primary" className="auth-submit">
          {pending ? 'Estableciendo contraseña…' : 'Establecer contraseña'}</Button></FormActions>
        <FieldHelp>Si la credencial ya no está disponible, solicita otra al Administrador.</FieldHelp>
      </form>}
    {error && <Alert tone="danger" role="alert">{error}</Alert>}
  </AuthFormSurface>;
}
