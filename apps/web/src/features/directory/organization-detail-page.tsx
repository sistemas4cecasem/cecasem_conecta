import { DuplicatePanel } from './duplicate-panel';
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
  const [editing, setEditing] = useState<Organization | null>(null); const [page, setPage] = useState(1); const [confirmStatusChange, setConfirmStatusChange] = useState(false);
  const children = useOrganizations(identity, `organizations/${id}/children?status=all&page=${page}`);
  if (!identity?.permissions.includes('directory.read')) return <p role="alert">No tienes permiso para consultar el directorio.</p>;
  if (!detail.data) return <section className="space-y-4"><Link className="inline-flex min-h-11 items-center underline" to="/organizations">Volver al directorio</Link>
    <QueryState pending={detail.isPending} error={detail.isError} failure={detail.error} retry={detail.refetch} /></section>;
  const row = detail.data;
  async function changeStatus() {
    try {
      organizationSchema.parse(await mutation.mutateAsync({ path: 'organizations/' + id + '/status', method: 'PATCH', body: { isActive: !row.isActive, expectedVersion: row.version } }));
      setConfirmStatusChange(false);
    } catch { /* Mostrar error y conservar la confirmación. */ }
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
    {row.dataImportBatch && <p role="status" className="rounded border p-3">Dato importado desde Excel · pendiente de verificación · lote {row.dataImportBatch.id} · {row.dataImportBatch.originalFilename}</p>}
    {row.duplicateOf && <p role="status" className="rounded border border-amber-500 p-3">Este registro fue consolidado en: <Link className="underline" to={'/organizations/'+row.duplicateOf.id}>{row.duplicateOf.name}</Link>. Su historial permanece disponible.</p>}
    {!!row.consolidatedRecords?.length && <p>Fichas consolidadas: {row.consolidatedRecords.map(item=><Link key={item.id} className="inline-flex min-h-11 items-center px-2 underline" to={'/organizations/'+item.id}>{item.name}</Link>)}</p>}
    <DuplicatePanel key={'duplicates-'+id} identity={identity} actorPath={'organizations/'+id}/>
    <div className="flex flex-wrap gap-3">
      {!row.duplicateOfId && identity.permissions.includes('directory.write') && <button className={buttonClass} onClick={() => setEditing(row)}>Editar ficha</button>}
      {!row.duplicateOfId && identity.permissions.includes('directory.status.update') && <button disabled={mutation.isPending} className={buttonClass} onClick={() => { mutation.reset(); setConfirmStatusChange(true); }}>{row.isActive ? 'Desactivar organización' : 'Reactivar organización'}</button>}
    </div>
    {!row.duplicateOfId && identity.permissions.includes('directory.status.update') && confirmStatusChange && <div role="group" aria-label={row.isActive ? 'Confirmar desactivación de organización' : 'Confirmar reactivación de organización'} className="space-y-2 rounded border border-amber-600 p-3">
      <p>{row.isActive ? 'La ficha quedará inactiva. Sus datos y gestiones históricas se conservarán; podrás reactivarla después.' : 'La ficha volverá a estar activa para nuevas gestiones. Su historial se conservará.'}</p>
      <div className="flex flex-wrap gap-3"><button disabled={mutation.isPending || !!mutation.error} className={buttonClass} onClick={() => void changeStatus()}>{mutation.isPending ? 'Actualizando…' : row.isActive ? 'Confirmar desactivación' : 'Confirmar reactivación'}</button>
        <button disabled={mutation.isPending} className={buttonClass} onClick={() => setConfirmStatusChange(false)}>Volver sin cambiar estado</button></div>
    </div>}
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
    <VerificationPanel identity={identity} readOnly={!!row.duplicateOfId} path={'organizations/'+id} label={'organización '+row.name}/>
    <PersonRelations key={'people-'+id} identity={identity} organizationId={id} readOnly={!!row.duplicateOfId}/>
    <ContactSection key={'contacts-'+id} identity={identity} actorPath={'organizations/'+id} readOnly={!!row.duplicateOfId}/>
    {identity.permissions.includes('directory.history.read') && <DirectoryHistory key={id} identity={identity} path={'organizations/' + id + '/history'} />}
  </section>;
}
