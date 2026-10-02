import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { apiRequest } from '../../lib/api/client';
import { createUserSchema, roleLabels, roles } from './contracts';
import { useAdministrationAction } from './use-administration-action';

export function UserCreationForm({ actorId }: { actorId: string }) {
  const client = useQueryClient();
  const action = useAdministrationAction();
  const { register, handleSubmit, reset, formState: { errors } } = useForm<z.infer<typeof createUserSchema>>({
    resolver: zodResolver(createUserSchema), defaultValues: { givenNames: '', familyNames: '', email: '', role: 'RESEARCH' },
  });
  return <form aria-label="Crear usuario" noValidate className="my-6 grid gap-3 rounded border p-4 sm:grid-cols-2"
    onSubmit={handleSubmit(fields => action.run(async () => {
      await apiRequest('users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields) });
      reset(); await client.invalidateQueries({ queryKey: ['users', actorId] });
    }))}>
    <h2 className="text-xl font-semibold sm:col-span-2">Crear usuario</h2>
    {(['givenNames', 'familyNames', 'email'] as const).map((field, index) => <div key={field}>
      <label htmlFor={`create-${field}`}>{['Nombres', 'Apellidos', 'Correo electrónico'][index]}</label>
      <input id={`create-${field}`} type={field === 'email' ? 'email' : 'text'} {...register(field)} disabled={action.pending}
        aria-invalid={!!errors[field]} aria-describedby={errors[field] ? `error-${field}` : undefined} className="min-h-11 w-full rounded border px-2" />
      {errors[field] && <p role="alert" id={`error-${field}`}>{errors[field].message}</p>}
    </div>)}
    <div><label htmlFor="create-role">Rol</label><select id="create-role" {...register('role')} disabled={action.pending} className="min-h-11 w-full rounded border px-2">
      {roles.map(role => <option key={role} value={role}>{roleLabels[role]}</option>)}</select></div>
    <p className="sm:col-span-2">La cuenta se crea pendiente de primer acceso. Genera la credencial cuando vayas a entregarla.</p>
    {action.error && <p role="alert">{action.error}</p>}
    <button disabled={action.pending} className="min-h-11 rounded bg-slate-900 px-3 text-white">{action.pending ? 'Creando…' : 'Crear cuenta'}</button>
  </form>;
}
