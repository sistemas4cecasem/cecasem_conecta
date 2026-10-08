import { Metadata } from '../../components/ui/lists';
import { StatusBadge, Alert, ConfirmationPanel } from '../../components/ui/feedback';
import { FormField, Select, FormActions } from '../../components/ui/forms';
import { Button } from '../../components/ui/actions';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import type { AuthIdentity } from '../auth/session';
import { AUTH_QUERY_KEY, useSession } from '../auth/session';
import { hasPermission } from '../auth/permissions';
import { apiRequest } from '../../lib/api/client';
import { roleLabels, roles, type AdministrativeUser } from './contracts';
import { useAdministrationAction } from './use-administration-action';
import { TemporaryCredential } from './temporary-credential';
import { MailboxesPanel } from './mailboxes-panel';
import { clearForbiddenAdministration } from './administration-cache';

export function UserCard({ user, identity }: { user: AdministrativeUser; identity: AuthIdentity }) {
  const [role, setRole] = useState(user.role); const [confirm, setConfirm] = useState(false); const [mailboxes, setMailboxes] = useState(false);
  const action = useAdministrationAction(); const client = useQueryClient(); const session = useSession(); const navigate = useNavigate();
  const can = (permission: string) => hasPermission(identity.permissions, permission);
  const self = user.id === identity.id;
  return <article aria-label={`${user.givenNames} ${user.familyNames}`} className="user-summary">
    <h2 className="user-name">{user.givenNames} {user.familyNames}</h2>
    <Metadata items={[
      {label:'Nombre de usuario', value:user.username}, {label:'Correo', value:user.email},
      {label:'Rol', value:roleLabels[user.role]},
      {label:'Estado', value:<StatusBadge tone={user.isActive ? 'success' : 'neutral'}>{user.isActive ? 'Activo' : 'Inactivo'}</StatusBadge>},
      {label:'Acceso', value:<StatusBadge tone={user.credentialStatus === 'PENDING_FIRST_ACCESS' ? 'warning' : 'neutral'}>{user.credentialStatus === 'PENDING_FIRST_ACCESS' ? 'Pendiente de primer acceso' : 'Contraseña establecida'}</StatusBadge>},
    ]}/>
    {(can('users.role.update') || can('users.mailboxes.manage') || user.isActive && (user.credentialStatus === 'PENDING_FIRST_ACCESS' ? can('auth.first_access.issue') : can('auth.password_reset.issue'))) &&
    <section className="user-access-actions" aria-label={`Operaciones de acceso de ${user.username}`}><h3>Operaciones de acceso</h3>
    <div className="user-access-controls">
      {can('users.role.update') && <form aria-label={`Cambiar rol de ${user.username}`} onSubmit={event => {
        event.preventDefault(); if (role === user.role) return;
        void action.run(async () => {
          await apiRequest(`users/${user.id}/role`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role }) });
          if (self) { const refreshed = await session.refetch(); await clearForbiddenAdministration(client, refreshed.data ?? null); }
          await client.invalidateQueries({ queryKey: ['users', identity.id] });
        });
      }} className="user-role-form"><FormField label="Nuevo rol" id={`role-${user.id}`} help="El rol actual se mantiene hasta guardar la selección.">{control => <Select {...control} value={role} disabled={action.pending}
        onChange={event => setRole(event.target.value as typeof role)}>
        {roles.map(value => <option key={value} value={value}>{roleLabels[value]}</option>)}</Select>}</FormField>
        <FormActions><Button type="submit" disabled={action.pending || role === user.role} pending={action.pending}>Guardar rol</Button></FormActions></form>}
      {user.isActive && user.credentialStatus === 'PENDING_FIRST_ACCESS' && can('auth.first_access.issue') && <TemporaryCredential userId={user.id} kind="first-access" />}
      {user.isActive && user.credentialStatus === 'ESTABLISHED' && can('auth.password_reset.issue') && <TemporaryCredential userId={user.id} kind="password-reset" />}
      {can('users.mailboxes.manage') && <Button onClick={() => setMailboxes(!mailboxes)}>{mailboxes ? 'Cerrar buzones' : 'Gestionar buzones'}</Button>}
    </div></section>}
      {can('users.status.update') && <section className="user-state-actions" aria-label={`Estado de cuenta de ${user.username}`}><h3>Estado de cuenta</h3><Button variant={user.isActive ? 'danger' : 'secondary'} disabled={action.pending} onClick={() => setConfirm(true)}>
        {user.isActive ? 'Desactivar' : 'Reactivar'}</Button>
        {confirm && <ConfirmationPanel role="group" aria-label="Confirmar cambio de estado" title={user.isActive ? "Desactivar cuenta" : "Reactivar cuenta"} tone={user.isActive ? "danger" : "warning"}><p>{user.isActive
          ? 'La persona perderá acceso a CECASEM Conecta. Sus acciones institucionales permanecerán en el historial; podrás reactivar la cuenta después.'
          : 'La cuenta volverá a poder iniciar sesión con sus credenciales actuales. Su historial institucional se conserva.'}</p>
          <Button variant={user.isActive ? "danger" : "secondary"} pending={action.pending} disabled={action.pending} onClick={() => void action.run(async () => {
            await apiRequest(`users/${user.id}/${user.isActive ? 'deactivate' : 'reactivate'}`, { method: 'POST' });
            setConfirm(false);
            if (self && user.isActive) {
              await client.cancelQueries(); client.clear(); client.setQueryData(AUTH_QUERY_KEY, null); navigate('/login', { replace: true });
            } else await client.invalidateQueries({ queryKey: ['users', identity.id] });
          })}>{user.isActive ? 'Confirmar desactivación' : 'Confirmar reactivación'}</Button><Button onClick={() => setConfirm(false)}>Cancelar</Button></ConfirmationPanel>}
      </section>}
    {action.error && <Alert tone="danger" role="alert">{action.error}</Alert>}
    {mailboxes && can('users.mailboxes.manage') && <MailboxesPanel actorId={identity.id} userId={user.id} />}
  </article>;
}
