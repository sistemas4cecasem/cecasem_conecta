import { useRef, useState } from 'react';
import { Link, NavLink, Outlet, useParams } from 'react-router';
import { useSession } from '../auth/session';
import { organizationSchema, type Organization } from './contracts';
import { useDirectoryMutation, useOrganization } from './queries';
import { MutationError, QueryState } from './directory-ui';
import { ActionLink, Button } from '../../components/ui/actions';
import { PageHeader, Surface } from '../../components/ui/layout';
import { Alert, ConfirmationPanel, StatusBadge } from '../../components/ui/feedback';
import { OrganizationForm } from './organization-form';
import { type OrganizationWorkspaceContext } from './organization-workspace-context';
import './directory-detail.css';
import './organization-presentation.css';

const sections = [
  { label: 'Resumen', path: '.', end: true },
  { label: 'Personas', path: 'people' },
  { label: 'Contactos', path: 'contacts' },
  { label: 'Sedes', path: 'locations' },
  { label: 'Control', path: 'control' },
] as const;

export function OrganizationDetailPage() {
  const { id = '' } = useParams();
  const identity = useSession().data;
  const statusAction = useRef<HTMLButtonElement>(null);
  const detail = useOrganization(identity, id);
  const mutation = useDirectoryMutation(identity);
  const [editing, setEditing] = useState<Organization | null>(null);
  const [creatingBranch, setCreatingBranch] = useState(false);
  const [confirmStatusChange, setConfirmStatusChange] = useState(false);

  if (!identity?.permissions.includes('directory.read')) return <p role="alert">No tienes permiso para consultar el directorio.</p>;
  if (!detail.data) return <section className="space-y-4"><ActionLink appearance="list" to="/organizations">Volver al directorio</ActionLink>
    <QueryState pending={detail.isPending} error={detail.isError} failure={detail.error} retry={detail.refetch} /></section>;

  const organization = detail.data;
  async function changeStatus() {
    try {
      organizationSchema.parse(await mutation.mutateAsync({ path: 'organizations/' + id + '/status', method: 'PATCH',
        body: { isActive: !organization.isActive, expectedVersion: organization.version } }));
      setConfirmStatusChange(false);
    } catch { /* El error visible conserva la confirmación. */ }
  }

  return <section className="directory-detail organization-detail organization-workspace">
    <ActionLink appearance="list" to="/organizations">Volver a Organizaciones</ActionLink>
    <PageHeader eyebrow="Directorio / Organizaciones" title={organization.name}
      metadata={<div className="organization-header-metadata">
        <StatusBadge tone={organization.isActive ? 'success' : 'neutral'}>{organization.isActive ? 'Activa' : 'Inactiva'}</StatusBadge>
        {organization.country && <span>{organization.country}</span>}
      </div>}
      actions={<>{!organization.duplicateOfId && identity.permissions.includes('directory.write') && <Button onClick={() => setEditing(organization)}>Editar ficha</Button>}
        {!organization.duplicateOfId && identity.permissions.includes('directory.status.update') && <Button ref={statusAction} variant="ghost" disabled={mutation.isPending}
          onClick={() => { mutation.reset(); setConfirmStatusChange(true); }}>{organization.isActive ? 'Desactivar organización' : 'Reactivar organización'}</Button>}</>} />

    {organization.dataImportBatch && <Alert role="status" tone="info">Dato importado desde Excel · lote {organization.dataImportBatch.id} · {organization.dataImportBatch.originalFilename}</Alert>}
    {organization.duplicateOf && <Alert role="status" tone="warning">Este registro fue consolidado en: <Link className="underline" to={'/organizations/' + organization.duplicateOf.id}>{organization.duplicateOf.name}</Link>. Su historial permanece disponible.</Alert>}
    {!!organization.consolidatedRecords?.length && <p>Fichas consolidadas: {organization.consolidatedRecords.map(item => <Link key={item.id} className="inline-flex min-h-11 items-center px-2 underline" to={'/organizations/' + item.id}>{item.name}</Link>)}</p>}

    {!organization.duplicateOfId && identity.permissions.includes('directory.status.update') && confirmStatusChange && <ConfirmationPanel role="group"
      title={organization.isActive ? 'Confirmar desactivación de organización' : 'Confirmar reactivación de organización'}>
      <p>{organization.isActive ? 'La ficha quedará inactiva. Sus datos y gestiones históricas se conservarán; podrás reactivarla después.' : 'La ficha volverá a estar activa para nuevas gestiones. Su historial se conservará.'}</p>
      <div className="flex flex-wrap gap-3"><Button disabled={mutation.isPending || !!mutation.error} onClick={() => void changeStatus()}>
        {mutation.isPending ? 'Actualizando…' : organization.isActive ? 'Confirmar desactivación' : 'Confirmar reactivación'}</Button>
        <Button disabled={mutation.isPending} onClick={() => { setConfirmStatusChange(false); statusAction.current?.focus(); }}>Volver sin cambiar estado</Button></div>
    </ConfirmationPanel>}
    <MutationError modern error={mutation.error} reload={async () => { await detail.refetch(); mutation.reset(); }} />

    <nav className="organization-section-nav" aria-label="Secciones de la organización">
      {sections.map(section => <NavLink key={section.label} to={section.path} end={'end' in section ? section.end : undefined}
        className={({ isActive }) => isActive ? 'organization-section-link is-active' : 'organization-section-link'}>{section.label}</NavLink>)}
    </nav>

    {(editing || creatingBranch) ? <Surface className="organization-workspace-content organization-form-surface" heading={editing ? 'Editar ficha institucional' : 'Añadir sede o representación'}>
      <OrganizationForm identity={identity} initial={editing ?? undefined} branchOfId={creatingBranch ? id : undefined}
        saved={() => { setEditing(null); setCreatingBranch(false); }} cancel={() => { setEditing(null); setCreatingBranch(false); }}
        reload={async () => { const response = await detail.refetch(); if (!response.isSuccess) return undefined; setEditing(response.data); return response.data; }} />
    </Surface> : <div className="organization-workspace-content"><Outlet context={{ identity, organization, readOnly: !!organization.duplicateOfId,
      addBranch: () => setCreatingBranch(true) } satisfies OrganizationWorkspaceContext} /></div>}
  </section>;
}
