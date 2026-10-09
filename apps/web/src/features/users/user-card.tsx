import { Metadata } from '../../components/ui/lists';
import { StatusBadge, Alert, ConfirmationPanel } from '../../components/ui/feedback';
import { FormField, Select, FormActions } from '../../components/ui/forms';
import { Button } from '../../components/ui/actions';
import { PageHeader, Surface } from '../../components/ui/layout';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import type { AuthIdentity } from '../auth/session';
import { AUTH_QUERY_KEY, useSession } from '../auth/session';
import { hasPermission } from '../auth/permissions';
import { apiRequest } from '../../lib/api/client';
import { roleLabels, roles, type AdministrativeUser } from './contracts';
import { useAdministrationAction } from './use-administration-action';
import { UserProfileForm } from './user-profile-form';
import { AdminPasswordResetForm } from './admin-password-reset-form';
import { MailboxesPanel } from './mailboxes-panel';
import { clearForbiddenAdministration } from './administration-cache';

export function UserCard({ user, identity, protectsLastAdministrator = false, onBack }: {
  user: AdministrativeUser; identity: AuthIdentity; protectsLastAdministrator?: boolean; onBack: () => void;
}) {
  const [role, setRole] = useState(user.role); const [confirm, setConfirm] = useState(false);
  const [passwordResetState, setPasswordResetState] = useState<'closed' | 'open' | 'saved'>('closed');
  const [mailboxPanelState, setMailboxPanelState] = useState<'not-opened' | 'open' | 'closed'>('not-opened');
  const action = useAdministrationAction(); const client = useQueryClient(); const session = useSession(); const navigate = useNavigate();
  const can = (permission: string) => hasPermission(identity.permissions, permission);
  const self = user.id === identity.id;
  const canEditProfile = can('users.profile.update');
  const canManageAccess = ['users.role.update', 'users.mailboxes.manage', 'users.password.reset'].some(can);
  const mailboxPanelId = `user-mailboxes-panel-${user.id}`;
  const passwordResetPanelId = `user-password-reset-panel-${user.id}`;
  const passwordResetOpen = passwordResetState === 'open';
  const passwordResetSaved = passwordResetState === 'saved';
  const mailboxPanelMounted = mailboxPanelState !== 'not-opened';
  const mailboxPanelOpen = mailboxPanelState === 'open';
  const accessStatus = user.credentialStatus === 'NO_PASSWORD' ? 'Sin contraseña asignada' :
    user.credentialStatus === 'CHANGE_REQUIRED' ? 'Debe cambiar la contraseña' : 'Contraseña establecida';

  return <article aria-label={`${user.givenNames} ${user.familyNames}`} className="user-admin-view">
    <PageHeader eyebrow="Administración de usuarios" title={`${user.givenNames} ${user.familyNames}`}
      description={`Identificador: ${user.username}`} metadata={<Metadata items={[
        { label: 'Rol', value: roleLabels[user.role] },
        { label: 'Estado', value: <StatusBadge tone={user.isActive ? 'success' : 'neutral'}>{user.isActive ? 'Activo' : 'Inactivo'}</StatusBadge> },
        { label: 'Acceso', value: <StatusBadge tone={user.credentialStatus !== 'ESTABLISHED' ? 'warning' : 'neutral'}>{accessStatus}</StatusBadge> },
      ]} />} actions={<Button variant="ghost" onClick={onBack}>Volver al listado</Button>} />

    <div className={`user-admin-grid${canEditProfile && canManageAccess ? '' : ' user-admin-grid-single'}`}>
      <Surface className="user-profile-panel" heading="Información personal">
        {canEditProfile ? <UserProfileForm user={user} actorId={identity.id} /> : <Metadata items={[
          { label: 'Nombre de usuario', value: user.username },
          { label: 'Nombres', value: user.givenNames },
          { label: 'Apellidos', value: user.familyNames },
          { label: 'Correo electrónico', value: user.email },
        ]} />}
      </Surface>

      {canManageAccess && <Surface className="user-access-panel" aria-label={`Acceso y seguridad de ${user.username}`} heading="Acceso y seguridad">
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
        {(can('users.password.reset') || can('users.mailboxes.manage')) && <div className="user-access-actions">
          {can('users.password.reset') && <Button type="button" aria-expanded={passwordResetOpen}
            aria-controls={passwordResetOpen || passwordResetSaved ? passwordResetPanelId : undefined}
            onClick={() => setPasswordResetState('open')}>
            Restablecer contraseña
          </Button>}
          {can('users.mailboxes.manage') && <Button type="button" aria-expanded={mailboxPanelOpen}
            aria-controls={mailboxPanelMounted ? mailboxPanelId : undefined}
            onClick={() => setMailboxPanelState(state => state === 'open' ? 'closed' : 'open')}>
            {mailboxPanelOpen ? 'Cerrar buzones' : 'Gestionar buzones'}
          </Button>}
        </div>}
      </Surface>}
    </div>

    {can('users.password.reset') && <AdminPasswordResetForm userId={user.id} actorId={identity.id}
      open={passwordResetOpen} saved={passwordResetSaved} onClose={() => setPasswordResetState('closed')}
      onSaved={() => setPasswordResetState('saved')} panelId={passwordResetPanelId} />}
    {can('users.mailboxes.manage') && mailboxPanelMounted && <Surface id={mailboxPanelId} className="user-auxiliary-panel user-mailbox-panel"
      hidden={!mailboxPanelOpen} heading="Gestión de buzones">
      <MailboxesPanel actorId={identity.id} userId={user.id} />
    </Surface>}

    {can('users.status.update') && <Surface className="user-state-panel" aria-label={`Estado de cuenta de ${user.username}`} heading="Estado de cuenta">
      <Button variant={user.isActive ? 'danger' : 'secondary'} disabled={action.pending || protectsLastAdministrator} onClick={() => setConfirm(true)}>
        {user.isActive ? 'Desactivar' : 'Reactivar'}</Button>
      {protectsLastAdministrator && <p className="ui-field-help">Debe permanecer al menos un Administrador activo.</p>}
      {confirm && <ConfirmationPanel role="group" aria-label="Confirmar cambio de estado" title={user.isActive ? "Desactivar cuenta" : "Reactivar cuenta"} tone={user.isActive ? "danger" : "warning"}><p>{user.isActive
        ? 'La persona perderá acceso a CECASEM Conecta. Sus acciones institucionales permanecerán en el historial; podrás reactivar la cuenta después.'
        : 'La cuenta volverá a poder iniciar sesión con sus credenciales actuales. Su historial institucional se conserva.'}</p>
        <Button variant={user.isActive ? "danger" : "secondary"} pending={action.pending} disabled={action.pending} onClick={() => void action.run(async () => {
          await apiRequest(`users/${user.id}/${user.isActive ? 'deactivate' : 'reactivate'}`, { method: 'POST' });
          setConfirm(false);
          if (self && user.isActive) {
            await client.cancelQueries(); client.clear(); client.setQueryData(AUTH_QUERY_KEY, null); navigate('/login', { replace: true });
          } else {
            onBack();
            await client.invalidateQueries({ queryKey: ['users', identity.id] });
          }
        })}>{user.isActive ? 'Confirmar desactivación' : 'Confirmar reactivación'}</Button><Button onClick={() => setConfirm(false)}>Cancelar</Button></ConfirmationPanel>}
    </Surface>}
    {action.error && <Alert tone="danger" role="alert">{action.error}</Alert>}
  </article>;
}
