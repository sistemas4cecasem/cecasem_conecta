import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ActionLink } from '../../components/ui/actions';
import { PageHeader, FilterBar } from '../../components/ui/layout';
import { FormField, Select } from '../../components/ui/forms';
import { DataList, DataListItem } from '../../components/ui/lists';
import { EmptyState, QueryFeedback } from '../../components/ui/feedback';
import './users.css';
import { apiRequest, ApiError } from '../../lib/api/client';
import { useSession, type AuthIdentity } from '../auth/session';
import { hasPermission } from '../auth/permissions';
import { userSchema } from './contracts';
import { UserCreationForm } from './user-creation-form';
import { UserCard } from './user-card';

export function UsersPage() {
  const { data: identity } = useSession();
  if (!identity || !hasPermission(identity.permissions, 'users.read')) return <section className="users-page"><PageHeader title="Acceso denegado" eyebrow="Administración"/>
    <p className="mt-3">Tu cuenta no tiene permiso para consultar usuarios.</p><ActionLink to="/">Regresar a Inicio</ActionLink></section>;
  // Cambiar identidad/capabilities desmonta controles y credenciales efímeras.
  return <AuthorizedUsers key={`${identity.id}:${identity.permissions.join(',')}`} identity={identity} />;
}

function AuthorizedUsers({ identity }: { identity: AuthIdentity }) {
  const [status, setStatus] = useState('active'); const session = useSession(); const refreshed = useRef(false);
  const can = (permission: string) => hasPermission(identity.permissions, permission);
  const users = useQuery({ queryKey: ['users', identity.id, status], queryFn: async ({ signal }) => userSchema.array().parse(await apiRequest(`users?status=${status}`, { signal })) });
  useEffect(() => {
    if (!refreshed.current && users.error instanceof ApiError && users.error.status === 403) { refreshed.current = true; void session.refetch(); }
  }, [users.error, session]);
  return <section className="users-page">
    <PageHeader title="Usuarios" eyebrow="Administración" description="Administra las cuentas y los permisos de acceso a CECASEM Conecta."/>
    {can('users.create') && <UserCreationForm actorId={identity.id} />}
    {can('users.deactivated.read') && <FilterBar aria-label="Consulta de usuarios"><FormField label="Mostrar usuarios" id="users-status">{control =>
      <Select {...control} value={status} onChange={event => setStatus(event.target.value)}>
        <option value="active">Activos</option><option value="inactive">Inactivos</option><option value="all">Todos</option></Select>}
    </FormField></FilterBar>}
    <QueryFeedback pending={users.isPending} pendingMessage="Cargando usuarios…" error={users.isError}
      errorMessage={users.error instanceof ApiError ? users.error.message : 'No se pudieron cargar los usuarios.'} retry={users.refetch}/>
    {users.data && !users.isError && <>{!users.data.length ? <EmptyState title="No hay usuarios en este estado."/> :
      <DataList aria-label="Usuarios registrados">{users.data.map(user => <DataListItem key={`${user.id}:${user.role}:${user.isActive}`}>
        <UserCard user={user} identity={identity}/></DataListItem>)}</DataList>}</>}
  </section>;
}
