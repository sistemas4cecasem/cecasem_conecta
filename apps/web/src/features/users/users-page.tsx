import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { apiRequest, ApiError } from '../../lib/api/client';
import { useSession, type AuthIdentity } from '../auth/session';
import { hasPermission } from '../auth/permissions';
import { userSchema } from './contracts';
import { UserCreationForm } from './user-creation-form';
import { UserCard } from './user-card';

export function UsersPage() {
  const { data: identity } = useSession();
  if (!identity || !hasPermission(identity.permissions, 'users.read')) return <section><h1 className="text-3xl font-semibold">Acceso denegado</h1>
    <p className="mt-3">Tu cuenta no tiene permiso para consultar usuarios.</p><Link className="inline-flex min-h-11 items-center underline" to="/">Regresar a Inicio</Link></section>;
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
  return <section className="w-full" aria-labelledby="users-title"><h1 id="users-title" className="text-3xl font-semibold">Usuarios</h1>
    {can('users.deactivated.read') && <div className="my-4"><label htmlFor="users-status" className="mr-3">Mostrar usuarios</label>
      <select id="users-status" value={status} onChange={event => setStatus(event.target.value)} className="min-h-11 rounded border px-2">
        <option value="active">Activos</option><option value="inactive">Inactivos</option><option value="all">Todos</option></select></div>}
    {can('users.create') && <UserCreationForm actorId={identity.id} />}
    {users.isPending && <p role="status">Cargando usuarios…</p>}
    {users.isError && <div><p role="alert">{users.error instanceof ApiError ? users.error.message : 'No se pudieron cargar los usuarios.'}</p>
      <button className="min-h-11 underline" onClick={() => void users.refetch()}>Reintentar</button></div>}
    {users.data && !users.isError && <div className="mt-6 grid gap-4">{!users.data.length ? <p>No hay usuarios en este estado.</p> :
      users.data.map(user => <UserCard key={`${user.id}:${user.role}:${user.isActive}`} user={user} identity={identity} />)}</div>}
  </section>;
}
