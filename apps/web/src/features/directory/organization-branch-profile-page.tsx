import { useState } from 'react';
import { Navigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ActionLink, Button, ExternalLink } from '../../components/ui/actions';
import { PageHeader, Surface } from '../../components/ui/layout';
import { StatusBadge } from '../../components/ui/feedback';
import { Metadata } from '../../components/ui/lists';
import { apiRequest } from '../../lib/api/client';
import { QueryState } from './directory-ui';
import { useOrganizationWorkspace } from './organization-workspace-context';
import { branchProfileSchema } from './organization-branch-profile.contracts';
import { OrganizationBranchProfileForm } from './organization-branch-profile-form';
import { ProfileContacts } from './profile-contacts';
import { canReadDirectoryHistory } from './directory-permissions';
import { DirectoryHistory } from './directory-history';
import { dateLabel } from './date-label';

export function OrganizationBranchProfilePage() {
  const {branchId=''}=useParams(),{identity,organization,readOnly}=useOrganizationWorkspace();
  const [editing,setEditing]=useState<string|null>(null);
  const isEditing=editing===branchId;
  const query=useQuery({queryKey:['directory',identity.id,'branch-profile',organization.id,branchId],retry:false,
    enabled:identity.permissions.includes('directory.read'),queryFn:async({signal})=>branchProfileSchema.parse(await apiRequest(`organizations/${organization.id}/branches/${branchId}/profile`,{signal}))});
  const back=<ActionLink appearance="back" to={`/organizations/${organization.id}/locations`}>Volver a {organization.name} · Sedes</ActionLink>;
  if(!query.data)return <section className="space-y-4">{back}<QueryState pending={query.isPending} error={query.isError} failure={query.error} retry={query.refetch}/></section>;
  const {branch,contacts}=query.data;
  return <section className="ui-detail-page"><PageHeader title={branch.name} back={back} metadata={<StatusBadge tone={branch.isActive?'success':'neutral'}>{branch.isActive?'Activa':'Inactiva'}</StatusBadge>}
    actions={!isEditing&&!readOnly&&!branch.duplicateOfId&&identity.permissions.includes('directory.write')?<Button onClick={()=>setEditing(branchId)}>Editar sede</Button>:undefined}/>
    {isEditing?<Surface><OrganizationBranchProfileForm key={branchId} identity={identity} ownerId={organization.id} initial={query.data} saved={()=>setEditing(null)} cancel={()=>setEditing(null)} reload={async()=>{const result=await query.refetch();return result.isSuccess?result.data:undefined;}}/></Surface>:<>
      <Surface heading="Información de la sede"><Metadata layout="grid" items={[
        {label:'Lugar de la sede',value:branch.country??'Sin registrar'},
        {label:'Sigla o nombre alternativo',value:branch.alias??'Sin dato'},
        {label:'Descripción',value:branch.description??'Sin dato',wide:true},
        {label:'Sitio oficial',value:branch.officialWebsite?<ExternalLink href={branch.officialWebsite}>{branch.officialWebsite}</ExternalLink>:'Sin dato'},
        {label:'Última actualización',value:<time dateTime={branch.updatedAt}>{dateLabel(branch.updatedAt)}</time>},
      ]}/></Surface>
      <ProfileContacts contacts={contacts} showContext/>
      {canReadDirectoryHistory(identity)&&<DirectoryHistory identity={identity} path={`organizations/${branchId}/history`}/>}
    </>}
  </section>;
}

export function OrganizationBranchContactRedirect() {
  const {id='',branchId=''}=useParams();
  return <Navigate replace to={`/organizations/${id}/locations/${branchId}`}/>;
}
