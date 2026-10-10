import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/ui/actions';
import { Surface } from '../../components/ui/layout';
import { StatusBadge } from '../../components/ui/feedback';
import { DataList, DataListItem } from '../../components/ui/lists';
import { useOrganizations } from './queries';
import { Pagination, QueryState } from './directory-ui';
import { useOrganizationWorkspace } from './organization-workspace-context';

const pageSize=10;

export function OrganizationLocationsPage() {
  const { identity, organization, readOnly, addBranch } = useOrganizationWorkspace();
  const [page,setPage]=useState(1);
  const branches=useOrganizations(identity,`organizations/${organization.id}/branches?status=all&page=${page}&pageSize=${pageSize}`);
  const owner=organization.branchOf;
  return <div className="organization-locations-layout">
    <Surface heading="Organización referente" className="organization-section-surface">
      {owner?<p><Link className="underline" to={'/organizations/'+owner.id}>{owner.name}</Link>{!owner.isActive&&<> · <StatusBadge>Inactiva</StatusBadge></>}</p>
        :<p>Esta organización no tiene una organización referente registrada.</p>}
    </Surface>
    <Surface className="organization-section-surface">
      <div className="organization-people-heading"><div><h2 className="text-xl font-semibold">Sedes y representaciones</h2>
        {branches.data&&<p>{branches.data.total.toLocaleString('es-BO')} {branches.data.total===1?'registro':'registros'}</p>}</div>
        {!readOnly&&identity.permissions.includes('directory.write')&&<Button onClick={addBranch}>Añadir sede o representación</Button>}</div>
      <QueryState pending={branches.isPending} error={branches.isError} failure={branches.error} retry={branches.refetch}/>
      {branches.data?.total===0&&<p>No hay sedes o representaciones registradas.</p>}
      <DataList className="organization-location-list">{branches.data?.items.map(branch=><DataListItem key={branch.id} className="organization-location-row">
        <div className="organization-location-primary"><Link className="organization-location-name" to={'/organizations/'+branch.id}>{branch.name}</Link>
          <span>{branch.country??'País sin registrar'}</span></div>
        <div className="organization-location-status">{branch.isActive?<StatusBadge tone="success">Activa</StatusBadge>:<StatusBadge>Inactiva</StatusBadge>}
          <span>Sede o representación de {organization.name}</span></div>
      </DataListItem>)}</DataList>
      {branches.data&&branches.data.total>0&&<Pagination page={page} total={branches.data.total} pageSize={pageSize} onPage={setPage}/>}
    </Surface>
  </div>;
}
