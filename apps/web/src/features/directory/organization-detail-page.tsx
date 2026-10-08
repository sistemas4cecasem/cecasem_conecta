import { DuplicatePanel } from './duplicate-panel';
import { VerificationPanel } from './verification-panel';
import { useRef, useState } from 'react';
import { useParams } from 'react-router';
import { useSession } from '../auth/session';
import { organizationSchema, type Organization } from './contracts';
import { useDirectoryMutation, useOrganization, useOrganizations } from './queries';
import { MutationError, Pagination, QueryState } from './directory-ui';
import { dateLabel } from './date-label';
import { ActionLink as Link, Button } from '../../components/ui/actions';
import { PageHeader, Surface } from '../../components/ui/layout';
import { Alert, ConfirmationPanel, StatusBadge } from '../../components/ui/feedback';
import { Metadata } from '../../components/ui/lists';
import './directory-detail.css';
import { OrganizationForm } from './organization-form';
import { DirectoryHistory } from './directory-history';
import { PersonRelations } from './person-relations';
import { ContactSection } from './contact-section';
export function OrganizationDetailPage() {
  const { id = '' } = useParams(); const session = useSession(); const identity = session.data;
  const statusAction = useRef<HTMLButtonElement>(null);
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
  return <section className="directory-detail">
    <Link className="inline-flex min-h-11 items-center underline" to="/organizations">Volver al directorio</Link>
    <PageHeader eyebrow="Directorio / Organizaciones" title={row.name}
      metadata={<StatusBadge tone={row.isActive?'success':'neutral'}>{row.isActive?'Activa':'Inactiva'}</StatusBadge>}
      actions={<>{!row.duplicateOfId && identity.permissions.includes('directory.write') && <Button onClick={() => setEditing(row)}>Editar ficha</Button>}
      {!row.duplicateOfId && identity.permissions.includes('directory.status.update') && <Button ref={statusAction} variant="ghost" disabled={mutation.isPending} onClick={() => { mutation.reset(); setConfirmStatusChange(true); }}>{row.isActive ? 'Desactivar organización' : 'Reactivar organización'}</Button>}</>} />
    {row.dataImportBatch && <Alert role="status" tone="info">Dato importado desde Excel · pendiente de verificación · lote {row.dataImportBatch.id} · {row.dataImportBatch.originalFilename}</Alert>}
    {row.duplicateOf && <Alert role="status" tone="warning">Este registro fue consolidado en: <Link className="underline" to={'/organizations/'+row.duplicateOf.id}>{row.duplicateOf.name}</Link>. Su historial permanece disponible.</Alert>}
    {!!row.consolidatedRecords?.length && <p>Fichas consolidadas: {row.consolidatedRecords.map(item=><Link key={item.id} className="inline-flex min-h-11 items-center px-2 underline" to={'/organizations/'+item.id}>{item.name}</Link>)}</p>}

    {!row.duplicateOfId && identity.permissions.includes('directory.status.update') && confirmStatusChange && <ConfirmationPanel role="group" title={row.isActive ? 'Confirmar desactivación de organización' : 'Confirmar reactivación de organización'}>
      <p>{row.isActive ? 'La ficha quedará inactiva. Sus datos y gestiones históricas se conservarán; podrás reactivarla después.' : 'La ficha volverá a estar activa para nuevas gestiones. Su historial se conservará.'}</p>
      <div className="flex flex-wrap gap-3"><Button disabled={mutation.isPending || !!mutation.error} onClick={() => void changeStatus()}>{mutation.isPending ? 'Actualizando…' : row.isActive ? 'Confirmar desactivación' : 'Confirmar reactivación'}</Button>
        <Button disabled={mutation.isPending} onClick={() => { setConfirmStatusChange(false); statusAction.current?.focus(); }}>Volver sin cambiar estado</Button></div>
    </ConfirmationPanel>}
    <MutationError modern error={mutation.error} reload={async () => { await detail.refetch(); mutation.reset(); }} />
    <div className="directory-detail-main">
    <Surface heading="Información institucional" className="directory-detail-summary"><Metadata items={[
      {label:'País',value:row.country??'Sin dato'}, {label:'Sigla/nombre alternativo',value:row.alias??'Sin dato'},
      {label:'Descripción',value:row.description??'Sin dato'}, {label:'Sitio oficial',value:row.officialWebsite??'Sin dato'},
      {label:'Organización matriz',value:row.parent?<Link to={'/organizations/'+row.parent.id}>{row.parent.name}</Link>:'Sin matriz'},
      {label:'Categorías',value:row.categories.map(category=>category.name+(category.isActive?'':' (inactiva)')).join(', ')||'Sin categorías'},
      {label:'Creación',value:<time dateTime={row.createdAt}>{dateLabel(row.createdAt)}</time>},
      {label:'Modificación',value:<time dateTime={row.updatedAt}>{dateLabel(row.updatedAt)}</time>},
      {label:'Última verificación',value:row.lastVerifiedAt?<time dateTime={row.lastVerifiedAt}>{dateLabel(row.lastVerifiedAt)}</time>:dateLabel(null)}
    ]}/></Surface>
    <Surface className="directory-detail-verification"><VerificationPanel modern identity={identity} readOnly={!!row.duplicateOfId} path={'organizations/'+id} label={'organización '+row.name}/></Surface>
    <Surface className="directory-detail-contacts"><ContactSection key={'contacts-'+id} identity={identity} actorPath={'organizations/'+id} readOnly={!!row.duplicateOfId}/></Surface>
    </div>
    <Surface className="space-y-3"><h2 className="text-xl font-semibold">Sedes y representaciones</h2>
      <QueryState pending={children.isPending} error={children.isError} retry={children.refetch} />
      {children.data?.total === 0 && <p>No tiene sedes registradas.</p>}
      <ul>{children.data?.items.map(child => <li key={child.id}><Link className="inline-flex min-h-11 items-center underline" to={'/organizations/' + child.id}>{child.name}</Link>{!child.isActive && ' (inactiva)'}</li>)}</ul>
      {children.data && <Pagination page={page} total={children.data.total} onPage={setPage} />}
    </Surface>
    <Surface><PersonRelations key={'people-'+id} identity={identity} organizationId={id} readOnly={!!row.duplicateOfId}/></Surface>
    <Surface className="directory-detail-duplicates"><DuplicatePanel key={'duplicates-'+id} identity={identity} actorPath={'organizations/'+id}/></Surface>
    {identity.permissions.includes('directory.history.read') && <Surface className="directory-detail-history"><DirectoryHistory modern key={id} identity={identity} path={'organizations/' + id + '/history'} /></Surface>}
  </section>;
}
