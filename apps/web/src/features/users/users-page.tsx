import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ActionLink, Button } from '../../components/ui/actions';
import { PageHeader, FilterBar, Surface } from '../../components/ui/layout';
import { FormField, Select } from '../../components/ui/forms';
import { StatusBadge, EmptyState, QueryFeedback } from '../../components/ui/feedback';
import './users.css';
import { apiRequest, ApiError } from '../../lib/api/client';
import { useSession, type AuthIdentity } from '../auth/session';
import { hasPermission } from '../auth/permissions';
import { roleLabels, userSchema, type AdministrativeUser } from './contracts';
import { UserCreationForm } from './user-creation-form';
import { UserCard } from './user-card';

type UsersScreen = { type: 'list' } | { type: 'create' } | { type: 'user'; userId: string };

export function UsersPage() {
  const { data: identity } = useSession();
  if (!identity || !hasPermission(identity.permissions, 'users.read')) return <section className="users-page"><PageHeader title="Acceso denegado" eyebrow="Administración"/>
    <p className="mt-3">Tu cuenta no tiene permiso para consultar usuarios.</p><ActionLink to="/">Regresar a Inicio</ActionLink></section>;
  // Cambiar identidad/capabilities desmonta controles y credenciales efímeras.
  return <AuthorizedUsers key={`${identity.id}:${identity.permissions.join(',')}`} identity={identity} />;
}

function AuthorizedUsers({ identity }: { identity: AuthIdentity }) {
  const [status, setStatus] = useState('active');
  const [screen, setScreen] = useState<UsersScreen>({ type: 'list' });
  const session = useSession(); const refreshed = useRef(false);
  const can = (permission: string) => hasPermission(identity.permissions, permission);
  const users = useQuery({ queryKey: ['users', identity.id, status], queryFn: async ({ signal }) => userSchema.array().parse(await apiRequest(`users?status=${status}`, { signal })) });
  const activeAdministratorCount = users.data?.filter(user => user.isActive && user.role === 'ADMINISTRATOR').length ?? 0;
  useEffect(() => {
    if (!refreshed.current && users.error instanceof ApiError && users.error.status === 403) { refreshed.current = true; void session.refetch(); }
  }, [users.error, session]);

  const selectedUser = screen.type === 'user' ? users.data?.find(user => user.id === screen.userId) : undefined;
  if (screen.type === 'create') return <section className="users-page users-create-view">
    <PageHeader title="Crear usuario" eyebrow="Administración" description="Registra una cuenta y define su acceso inicial."
      actions={<Button variant="ghost" onClick={() => setScreen({ type: 'list' })}>Volver al listado</Button>} />
    {can('users.create') && <UserCreationForm actorId={identity.id} onCancel={() => setScreen({ type: 'list' })}
      onCreated={() => setScreen({ type: 'list' })} />}
  </section>;

  if (screen.type === 'user') return <section className="users-page users-detail-view">
    <QueryFeedback pending={users.isPending} pendingMessage="Cargando usuario…" error={users.isError}
      errorMessage={users.error instanceof ApiError ? users.error.message : 'No se pudo cargar el usuario.'} retry={users.refetch}/>
    {selectedUser ? <UserCard key={selectedUser.id} user={selectedUser} identity={identity}
      protectsLastAdministrator={selectedUser.isActive && selectedUser.role === 'ADMINISTRATOR' && activeAdministratorCount <= 1}
      onBack={() => setScreen({ type: 'list' })} /> : !users.isPending && !users.isError && <EmptyState title="No se encontró el usuario en este listado."
        description="Regresa al listado y elige otro estado para consultar esta cuenta."
        action={<Button onClick={() => setScreen({ type: 'list' })}>Volver al listado</Button>} />}
  </section>;

  return <section className="users-page">
    <PageHeader title="Usuarios" eyebrow="Administración" description="Administra las cuentas y los permisos de acceso a CECASEM Conecta."
      primaryAction={can('users.create') && <Button variant="primary" onClick={() => setScreen({ type: 'create' })}>Crear usuario</Button>} />
    {can('users.deactivated.read') && <FilterBar aria-label="Consulta de usuarios"><FormField label="Mostrar usuarios" id="users-status">{control =>
      <Select {...control} value={status} onChange={event => setStatus(event.target.value)}>
        <option value="active">Activos</option><option value="inactive">Inactivos</option><option value="all">Todos</option></Select>}
    </FormField></FilterBar>}
    <Surface className="users-results" aria-label="Usuarios registrados" heading="Usuarios registrados">
      <QueryFeedback pending={users.isPending} pendingMessage="Cargando usuarios…" error={users.isError}
        errorMessage={users.error instanceof ApiError ? users.error.message : 'No se pudieron cargar los usuarios.'} retry={users.refetch}/>
      {users.data && !users.isError && <>{!users.data.length ? <EmptyState title="No hay usuarios en este estado."/> :
        <UsersTable users={users.data} canAdminister={['users.profile.update', 'users.role.update', 'users.password.reset', 'users.status.update', 'users.mailboxes.manage'].some(can)}
          onSelect={user => setScreen({ type: 'user', userId: user.id })}/>}</>}
    </Surface>
  </section>;
}

function UsersTable({ users, canAdminister, onSelect }: {
  users: AdministrativeUser[]; canAdminister: boolean; onSelect: (user: AdministrativeUser) => void;
}) {
  return <div className="users-table-scroll"><table className="users-table">
    <caption className="sr-only">Listado de usuarios registrados</caption>
    <thead><tr><th scope="col">Usuario</th><th scope="col">Rol</th><th scope="col">Estado</th><th scope="col">Acceso</th><th scope="col"><span className="sr-only">Administración</span></th></tr></thead>
    <tbody>{users.map(user => <tr key={user.id}>
      <td data-label="Usuario"><div className="users-table-identity"><span className="users-table-name">{user.givenNames} {user.familyNames}</span>
        <span>{user.username}</span><span>{user.email}</span></div></td>
      <td data-label="Rol">{roleLabels[user.role]}</td>
      <td data-label="Estado"><StatusBadge tone={user.isActive ? 'success' : 'neutral'}>{user.isActive ? 'Activo' : 'Inactivo'}</StatusBadge></td>
      <td data-label="Acceso"><StatusBadge tone={user.credentialStatus !== 'ESTABLISHED' ? 'warning' : 'neutral'}>{
        user.credentialStatus === 'NO_PASSWORD' ? 'Sin contraseña asignada' : user.credentialStatus === 'CHANGE_REQUIRED' ? 'Debe cambiar la contraseña' : 'Contraseña establecida'}</StatusBadge></td>
      <td data-label="Administración"><Button className="users-admin-button" variant="ghost" onClick={() => onSelect(user)}
        aria-label={`${canAdminister ? 'Administrar' : 'Ver'} usuario ${user.givenNames} ${user.familyNames}`}>
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">{canAdminister
          ? <><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></>
          : <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>}</svg>
        {canAdminister ? 'Administrar' : 'Ver usuario'}
      </Button></td>
    </tr>)}</tbody>
  </table></div>;
}
