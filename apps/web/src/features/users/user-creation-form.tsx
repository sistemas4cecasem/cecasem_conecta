import { Surface } from '../../components/ui/layout';
import { FormField, Input, Select, FormSection, FormActions, FieldHelp } from '../../components/ui/forms';
import { Button } from '../../components/ui/actions';
import { Alert } from '../../components/ui/feedback';
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
  return <Surface heading="Crear usuario" className="user-creation"><form aria-label="Crear usuario" noValidate
    onSubmit={handleSubmit(fields => action.run(async () => {
      await apiRequest('users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields) });
      reset(); await client.invalidateQueries({ queryKey: ['users', actorId] });
    }))}>
    <FormSection heading="Datos de la cuenta" className="administration-fields">
    {(['givenNames', 'familyNames', 'email'] as const).map(field => <FormField key={field}
      label={{givenNames:'Nombres', familyNames:'Apellidos', email:'Correo electrónico'}[field]} id={`create-${field}`} error={errors[field]?.message} required>
      {control => <Input {...control} aria-required="true" type={field === 'email' ? 'email' : 'text'} {...register(field)} disabled={action.pending}/>}
    </FormField>)}
    <FormField label="Rol" id="create-role">{control => <Select {...control} {...register('role')} disabled={action.pending}>
      {roles.map(role => <option key={role} value={role}>{roleLabels[role]}</option>)}</Select>}</FormField>
    </FormSection>
    <FieldHelp>La cuenta se crea pendiente de primer acceso. Genera la credencial cuando vayas a entregarla.</FieldHelp>
    {action.error && <Alert tone="danger" role="alert">{action.error}</Alert>}
    <FormActions><Button type="submit" variant="primary" pending={action.pending} disabled={action.pending}>{action.pending ? 'Creando…' : 'Crear cuenta'}</Button></FormActions>
  </form></Surface>;
}
