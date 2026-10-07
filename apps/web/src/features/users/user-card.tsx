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
  return <article aria-label={`${user.givenNames} ${user.familyNames}`} className="rounded border border-slate-300 p-4">
    <h2 className="text-xl font-semibold">{user.givenNames} {user.familyNames}</h2>
    <dl className="my-3 grid gap-2 sm:grid-cols-2">
      <div><dt className="font-medium">Nombre de usuario</dt><dd className="break-all">{user.username}</dd></div>
      <div><dt className="font-medium">Correo</dt><dd className="break-all">{user.email}</dd></div>
      <div><dt className="font-medium">Rol</dt><dd>{roleLabels[user.role]}</dd></div>
      <div><dt className="font-medium">Estado</dt><dd>{user.isActive ? 'Activo' : 'Inactivo'}</dd></div>
      <div><dt className="font-medium">Acceso</dt><dd>{user.credentialStatus === 'PENDING_FIRST_ACCESS' ? 'Pendiente de primer acceso' : 'Contraseña establecida'}</dd></div>
    </dl>
    <div className="flex flex-wrap items-start gap-3">
      {can('users.role.update') && <form aria-label={`Cambiar rol de ${user.username}`} onSubmit={event => {
        event.preventDefault(); if (role === user.role) return;
        void action.run(async () => {
          await apiRequest(`users/${user.id}/role`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role }) });
          if (self) { const refreshed = await session.refetch(); await clearForbiddenAdministration(client, refreshed.data ?? null); }
          await client.invalidateQueries({ queryKey: ['users', identity.id] });
        });
      }}><label htmlFor={`role-${user.id}`} className="mr-2">Nuevo rol</label><select id={`role-${user.id}`} value={role} disabled={action.pending}
        onChange={event => setRole(event.target.value as typeof role)} className="min-h-11 rounded border px-2">
        {roles.map(value => <option key={value} value={value}>{roleLabels[value]}</option>)}</select>
        <button className="ml-2 min-h-11 underline" disabled={action.pending || role === user.role}>Guardar rol</button></form>}
      {can('users.status.update') && <div><button className="min-h-11 rounded border px-3" disabled={action.pending} onClick={() => setConfirm(true)}>
        {user.isActive ? 'Desactivar' : 'Reactivar'}</button>
        {confirm && <div role="group" aria-label="Confirmar cambio de estado"><p>{user.isActive
          ? 'La persona perderá acceso a CECASEM Conecta. Sus acciones institucionales permanecerán en el historial; podrás reactivar la cuenta después.'
          : 'La cuenta volverá a poder iniciar sesión con sus credenciales actuales. Su historial institucional se conserva.'}</p>
          <button className="min-h-11 underline" disabled={action.pending} onClick={() => void action.run(async () => {
            await apiRequest(`users/${user.id}/${user.isActive ? 'deactivate' : 'reactivate'}`, { method: 'POST' });
            setConfirm(false);
            if (self && user.isActive) {
              await client.cancelQueries(); client.clear(); client.setQueryData(AUTH_QUERY_KEY, null); navigate('/login', { replace: true });
            } else await client.invalidateQueries({ queryKey: ['users', identity.id] });
          })}>{user.isActive ? 'Confirmar desactivación' : 'Confirmar reactivación'}</button><button className="ml-3 min-h-11 underline" onClick={() => setConfirm(false)}>Cancelar</button></div>}
      </div>}
      {user.isActive && user.credentialStatus === 'PENDING_FIRST_ACCESS' && can('auth.first_access.issue') && <TemporaryCredential userId={user.id} kind="first-access" />}
      {user.isActive && user.credentialStatus === 'ESTABLISHED' && can('auth.password_reset.issue') && <TemporaryCredential userId={user.id} kind="password-reset" />}
      {can('users.mailboxes.manage') && <button className="min-h-11 rounded border px-3" onClick={() => setMailboxes(!mailboxes)}>{mailboxes ? 'Cerrar buzones' : 'Gestionar buzones'}</button>}
    </div>
    {action.error && <p role="alert">{action.error}</p>}
    {mailboxes && can('users.mailboxes.manage') && <MailboxesPanel actorId={identity.id} userId={user.id} />}
  </article>;
}
