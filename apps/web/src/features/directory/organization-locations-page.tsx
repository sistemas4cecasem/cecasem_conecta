import { type Organization } from './contracts';
import { useState } from 'react';

import { ActionLink, Button } from '../../components/ui/actions';
import { Surface } from '../../components/ui/layout';
import { StatusBadge } from '../../components/ui/feedback';
import { DataList, DataListItem } from '../../components/ui/lists';
import { useOrganizations } from './queries';
import { Pagination, QueryState } from './directory-ui';
import { useOrganizationWorkspace } from './organization-workspace-context';

const pageSize=10;

function BranchCard({branch,ownerId}:{branch:Organization;ownerId:string}) {
  return <DataListItem className="organization-location-row organization-branch-card">
    <div className="organization-episode-heading"><h3 className="organization-location-name"><ActionLink appearance="normal" to={`/organizations/${ownerId}/locations/${branch.id}`}>{branch.name}</ActionLink></h3>
      <StatusBadge tone={branch.isActive?'success':'neutral'}>{branch.isActive?'Activa':'Inactiva'}</StatusBadge>
    </div>
    <dl className="organization-episode-fields"><div><dt>Lugar de la sede</dt><dd>{branch.country??'Sin registrar'}</dd></div>
      {branch.description&&<div><dt>Descripción</dt><dd>{branch.description}</dd></div>}
    </dl>
  </DataListItem>;
}

export function OrganizationLocationsPage() {
  const { identity, organization, readOnly, addBranch } = useOrganizationWorkspace();
  const [page,setPage]=useState(1);
  const branches=useOrganizations(identity,`organizations/${organization.id}/branches?status=all&page=${page}&pageSize=${pageSize}`);
  const owner=organization.branchOf;
  return <div className="organization-locations-layout">
    <Surface heading="Organización referente" className="organization-section-surface">
      {owner?<p><ActionLink to={'/organizations/'+owner.id}>{owner.name}</ActionLink>{!owner.isActive&&<> · <StatusBadge>Inactiva</StatusBadge></>}</p>
        :<p>Esta organización no tiene una organización referente registrada.</p>}
    </Surface>
    <Surface className="organization-section-surface">
      <div className="organization-people-heading"><div><h2 className="text-xl font-semibold">Sedes y representaciones</h2>
        {branches.data&&<p>{branches.data.total.toLocaleString('es-BO')} {branches.data.total===1?'registro':'registros'}</p>}</div>
        {!readOnly&&identity.permissions.includes('directory.write')&&<Button onClick={addBranch}>Añadir sede o representación</Button>}</div>
      <QueryState pending={branches.isPending} error={branches.isError} failure={branches.error} retry={branches.refetch}/>
      {branches.data?.total===0&&<p>No hay sedes o representaciones registradas.</p>}
      <DataList className="organization-location-list">{branches.data?.items.map(branch=><BranchCard key={branch.id} branch={branch} ownerId={organization.id}/>)}</DataList>
      {branches.data&&branches.data.total>0&&<Pagination page={page} total={branches.data.total} pageSize={pageSize} onPage={setPage}/>}
    </Surface>
  </div>;
}
