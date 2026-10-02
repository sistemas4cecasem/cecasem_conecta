import { VerificationPanel } from './verification-panel';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useSession } from '../auth/session';
import { organizationSchema, type Organization } from './contracts';
import { useDirectoryMutation, useOrganization, useOrganizations } from './queries';
import { buttonClass, MutationError, Pagination, QueryState } from './directory-ui';
import { dateLabel } from './date-label';
import { OrganizationForm } from './organization-form';
import { DirectoryHistory } from './directory-history';
import { PersonRelations } from './person-relations';
import { ContactSection } from './contact-section';
export function OrganizationDetailPage() {
  const { id = '' } = useParams(); const session = useSession(); const identity = session.data;
  const detail = useOrganization(identity, id); const mutation = useDirectoryMutation(identity);
  const [editing, setEditing] = useState<Organization | null>(null); const [page, setPage] = useState(1);
  const children = useOrganizations(identity, `organizations/${id}/children?status=all&page=${page}`);
  if (!identity?.permissions.includes('directory.read')) return <p role="alert">No tienes permiso para consultar el directorio.</p>;
  if (!detail.data) return <QueryState pending={detail.isPending} error={detail.isError} retry={detail.refetch} />;
  const row = detail.data;
  async function changeStatus() {
    try { organizationSchema.parse(await mutation.mutateAsync({ path: 'organizations/' + id + '/status', method: 'PATCH', body: { isActive: !row.isActive, expectedVersion: row.version } })); } catch { /* Mostrar error. */ }
  }
  if (editing) return <section className="space-y-4"><h1 className="text-2xl font-semibold">Editar organización</h1>
    <OrganizationForm identity={identity} initial={editing} saved={() => setEditing(null)} cancel={() => setEditing(null)}
      reload={async () => {
        const response = await detail.refetch();
        if (!response.isSuccess) return undefined;
        setEditing(response.data); return response.data;
      }} /></section>;
  return <section className="min-w-0 space-y-6 break-words">
    <Link className="inline-flex min-h-11 items-center underline" to="/organizations">Volver al directorio</Link>
    <h1 className="text-2xl font-semibold">{row.name}</h1>
    <p>Estado: {row.isActive ? 'Activa' : 'Inactiva'}</p>
    <div className="flex flex-wrap gap-3">
      {identity.permissions.includes('directory.write') && <button className={buttonClass} onClick={() => setEditing(row)}>Editar ficha</button>}
      {identity.permissions.includes('directory.status.update') && <button disabled={mutation.isPending} className={buttonClass} onClick={() => void changeStatus()}>{row.isActive ? 'Desactivar organización' : 'Reactivar organización'}</button>}
    </div>
    <MutationError error={mutation.error} reload={async () => { await detail.refetch(); mutation.reset(); }} />
    <dl className="grid gap-3 sm:grid-cols-2">
      {[['País', row.country], ['Sigla/nombre alternativo', row.alias], ['Descripción', row.description],
        ['Sitio oficial', row.officialWebsite], ['Creación', dateLabel(row.createdAt)], ['Modificación', dateLabel(row.updatedAt)],
        ['Última verificación', dateLabel(row.lastVerifiedAt)]].map(([label, value]) => <div key={label}><dt className="font-semibold">{label}</dt><dd className="whitespace-pre-wrap">{value ?? 'Sin dato'}</dd></div>)}
      <div><dt className="font-semibold">Organización matriz</dt><dd>{row.parent ? <Link className="underline" to={'/organizations/' + row.parent.id}>{row.parent.name}</Link> : 'Sin matriz'}</dd></div>
      <div><dt className="font-semibold">Categorías</dt><dd>{row.categories.map(category => category.name + (category.isActive ? '' : ' (inactiva)')).join(', ') || 'Sin categorías'}</dd></div>
    </dl>
    <section className="space-y-3"><h2 className="text-xl font-semibold">Sedes y representaciones</h2>
      <QueryState pending={children.isPending} error={children.isError} retry={children.refetch} />
      {children.data?.total === 0 && <p>No tiene sedes registradas.</p>}
      <ul>{children.data?.items.map(child => <li key={child.id}><Link className="inline-flex min-h-11 items-center underline" to={'/organizations/' + child.id}>{child.name}</Link>{!child.isActive && ' (inactiva)'}</li>)}</ul>
      {children.data && <Pagination page={page} total={children.data.total} onPage={setPage} />}
    </section>
    <VerificationPanel identity={identity} path={'organizations/'+id} label={'organización '+row.name}/>
    <PersonRelations key={'people-'+id} identity={identity} organizationId={id}/>
    <ContactSection key={'contacts-'+id} identity={identity} actorPath={'organizations/'+id}/>
    {identity.permissions.includes('directory.history.read') && <DirectoryHistory key={id} identity={identity} path={'organizations/' + id + '/history'} />}
  </section>;
}
