import { Surface } from '../../components/ui/layout';
import { FormField, Input, Select, FormSection, FormActions, FieldHelp } from '../../components/ui/forms';
import { Button } from '../../components/ui/actions';
import { Alert } from '../../components/ui/feedback';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import type { z } from 'zod';
import { apiRequest } from '../../lib/api/client';
import { createUserSchema, roleLabels, roles } from './contracts';
import { useAdministrationAction } from './use-administration-action';
import { PasswordRequirements } from '../auth/password-requirements';

export function UserCreationForm({ actorId, onCancel, onCreated }: { actorId: string; onCancel: () => void; onCreated: () => void }) {
  const client = useQueryClient();
  const action = useAdministrationAction();
  const { register, handleSubmit, reset, control, formState: { errors } } = useForm<z.infer<typeof createUserSchema>>({
    resolver: zodResolver(createUserSchema), defaultValues: { givenNames: '', familyNames: '', email: '', role: 'RESEARCH', password: '' },
  });
  const initialPassword = useWatch({ control, name: 'password' });
  return <Surface className="user-creation"><form aria-label="Crear usuario" noValidate
    onSubmit={handleSubmit(fields => action.run(async () => {
      const body = JSON.stringify(fields);
      await apiRequest('users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      reset();
      await client.invalidateQueries({ queryKey: ['users', actorId] });
      onCreated();
    }))}>
    <FormSection heading="Datos de la cuenta" className="administration-fields user-create-account-fields">
    {(['givenNames', 'familyNames', 'email'] as const).map(field => <FormField key={field}
      label={{givenNames:'Nombres', familyNames:'Apellidos', email:'Correo electrónico'}[field]} id={`create-${field}`} error={errors[field]?.message} required>
      {control => <Input {...control} aria-required="true" type={field === 'email' ? 'email' : 'text'} {...register(field)} disabled={action.pending}/>}
    </FormField>)}
    <FormField label="Rol" id="create-role">{control => <Select {...control} {...register('role')} disabled={action.pending}>
      {roles.map(role => <option key={role} value={role}>{roleLabels[role]}</option>)}</Select>}</FormField>
    </FormSection>
    <FormSection heading="Acceso inicial" className="user-create-access-fields">
      <FormField label="Contraseña inicial" id="create-password" error={errors.password?.message}
        help="La persona deberá cambiarla al iniciar sesión." required>{control => <>
        <Input {...control} type="password" autoComplete="new-password" {...register('password')} disabled={action.pending}/>
        <PasswordRequirements password={initialPassword}/>
      </>}</FormField>
      <FieldHelp>La contraseña inicial permite el primer ingreso; el sistema pedirá cambiarla antes de continuar.</FieldHelp>
    </FormSection>
    {action.error && <Alert tone="danger" role="alert">{action.error}</Alert>}
    <FormActions><Button type="button" onClick={onCancel}>Cancelar</Button><Button type="submit" variant="primary" pending={action.pending} disabled={action.pending}>{action.pending ? 'Creando…' : 'Crear cuenta'}</Button></FormActions>
  </form></Surface>;
}
