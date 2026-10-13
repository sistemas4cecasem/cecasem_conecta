import { DuplicatePanel } from './duplicate-panel';
import { useState } from 'react';
import { useOutletContext, useParams } from 'react-router';
import { useSession } from '../auth/session';
import { type Person } from './contracts';
import { usePerson,useDirectoryMutation } from './queries';
import { MutationError,QueryState } from './directory-ui';
import { dateLabel } from './date-label';
import { ActionLink, Button } from '../../components/ui/actions';
import { PageHeader, Surface } from '../../components/ui/layout';
import { Alert, ConfirmationPanel, StatusBadge } from '../../components/ui/feedback';
import { Metadata } from '../../components/ui/lists';
import './directory-detail.css';
import { PersonForm } from './person-form';
import { PersonRelations } from './person-relations';
import { DirectoryHistory } from './directory-history';
import { ContactSection } from './contact-section';
import { RelationshipContextPanel } from '../relationships/relationship-context-panel';
import type { OrganizationWorkspaceContext } from './organization-workspace-context';
export function PersonDetailPage() {
  const {id: routeId='',personId: nestedPersonId}=useParams();
  const personId=nestedPersonId??routeId;const organizationContext=useOutletContext<OrganizationWorkspaceContext|null>();
  const organization=organizationContext?.organization;const identity=useSession().data??organizationContext?.identity;const detail=usePerson(identity,personId);const mutation=useDirectoryMutation(identity);
  const backTo=organization?`/organizations/${organization.id}/people`:'/people';
  const backLabel=organization?`Volver a ${organization.name} · Personas`:'Volver a personas';
  const eyebrow=organization?`Directorio / Organizaciones / ${organization.name} / Personas`:'Directorio / Personas externas';
  const [editing,setEditing]=useState<Person|null>(null);const [confirmStatusChange,setConfirmStatusChange]=useState(false);
  if(!identity?.permissions.includes('directory.read')) return <p role="alert">No tienes permiso para consultar personas.</p>;
  if(!detail.data) return <section className="space-y-4"><ActionLink appearance="back" to={backTo}>{backLabel}</ActionLink>
    <QueryState pending={detail.isPending} error={detail.isError} failure={detail.error} retry={detail.refetch}/></section>;
  const row=detail.data;
  if(editing) return <section className="ui-editor-page"><PageHeader eyebrow={eyebrow} title="Editar persona" back={<ActionLink appearance="back" to={backTo}>{backLabel}</ActionLink>} /><Surface><PersonForm identity={identity} initial={editing} saved={()=>setEditing(null)} cancel={()=>setEditing(null)}
    reload={async()=>{const response=await detail.refetch();if(!response.isSuccess)return;setEditing(response.data);return response.data;}}/></Surface></section>;
  return <section className="directory-detail">
    <PageHeader back={<ActionLink appearance="back" to={backTo}>{backLabel}</ActionLink>} eyebrow={eyebrow} title={row.displayName} description={row.currentRelationsCount ? `Vínculos vigentes: ${row.currentRelationsCount}. Consulta los episodios institucionales.` : undefined}
      metadata={<StatusBadge tone={row.isActive?'success':'neutral'}>{row.isActive?'Activa':'Inactiva'}</StatusBadge>}
      actions={<>{!row.duplicateOfId&&identity.permissions.includes('directory.write')&&<Button onClick={()=>setEditing(row)}>Editar persona</Button>}
      {!row.duplicateOfId&&identity.permissions.includes('directory.status.update')&&<Button variant="ghost" disabled={mutation.isPending} onClick={()=>{mutation.reset();setConfirmStatusChange(true);}}>{row.isActive?'Desactivar persona':'Reactivar persona'}</Button>}</>} />
    {row.dataImportBatch&&<Alert role="status" tone="info">Dato importado desde Excel · lote {row.dataImportBatch.id} · {row.dataImportBatch.originalFilename}</Alert>}
    {row.duplicateOf&&<Alert role="status" tone="warning">Este registro fue consolidado en: <ActionLink appearance="normal" to={'/people/'+row.duplicateOf.id}>{row.duplicateOf.displayName}</ActionLink>. Su historial permanece disponible.</Alert>}
    {!!row.consolidatedRecords?.length&&<p>Fichas consolidadas: {row.consolidatedRecords.map(item=><ActionLink key={item.id} className="inline-flex min-h-11 items-center px-2" to={'/people/'+item.id}>{item.displayName}</ActionLink>)}</p>}

    {!row.currentRelationsCount&&<p>Sin vínculos vigentes: persona independiente o institución aún no identificada. Los episodios históricos se conservan abajo.</p>}
    {!row.duplicateOfId&&identity.permissions.includes('directory.status.update')&&confirmStatusChange&&<ConfirmationPanel role="group" title={row.isActive?'Confirmar desactivación de persona':'Confirmar reactivación de persona'}>
      <p>{row.isActive?'La ficha quedará inactiva. Sus datos, vínculos e historial institucional se conservarán; podrás reactivarla después.':'La ficha volverá a estar activa para nuevas gestiones. Su historial y vínculos se conservarán.'}</p>
      <div className="flex flex-wrap gap-3"><Button disabled={mutation.isPending||!!mutation.error} onClick={()=>{void mutation.mutateAsync({path:'people/'+personId+'/status',method:'PATCH',body:{isActive:!row.isActive,expectedVersion:row.version}}).then(()=>setConfirmStatusChange(false)).catch(()=>undefined);}}>{mutation.isPending?(row.isActive?'Desactivando…':'Reactivando…'):row.isActive?'Confirmar desactivación':'Confirmar reactivación'}</Button>
        <Button disabled={mutation.isPending} onClick={()=>setConfirmStatusChange(false)}>Volver sin cambiar estado</Button></div>
    </ConfirmationPanel>}
    <MutationError modern error={mutation.error} reload={async()=>{await detail.refetch();mutation.reset();}}/>
    <div className="directory-detail-main">
      <Surface heading="Información personal" className="directory-detail-summary"><Metadata layout="grid" items={[
        {label:'Nombres',value:row.givenNames??'Sin dato'}, {label:'Apellidos',value:row.familyNames??'Sin dato'},
        {label:'Creación',value:<time dateTime={row.createdAt}>{dateLabel(row.createdAt)}</time>},
        {label:'Modificación',value:<time dateTime={row.updatedAt}>{dateLabel(row.updatedAt)}</time>}
      ]}/></Surface>
      <Surface className="directory-detail-contacts"><ContactSection key={'contacts-'+personId} identity={identity} actorPath={'people/'+personId} readOnly={!!row.duplicateOfId}/></Surface>
    </div>
    <Surface><PersonRelations key={personId} identity={identity} personId={personId} readOnly={!!row.duplicateOfId}/></Surface>
    <RelationshipContextPanel identity={identity} target={{kind:'PERSON',id:row.id,label:row.displayName}} />
    <Surface className="directory-detail-duplicates"><DuplicatePanel key={'duplicates-'+personId} identity={identity} actorPath={'people/'+personId}/></Surface>
    {identity.permissions.includes('directory.history.read')&&<Surface className="directory-detail-history"><DirectoryHistory modern key={'history-'+personId} identity={identity} path={'people/'+personId+'/history'}/></Surface>}
  </section>;
}
