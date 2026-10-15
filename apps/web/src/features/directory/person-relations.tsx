import { useState } from 'react';
import type { AuthIdentity } from '../auth/session';
import type { Person, PersonRelation } from './contracts';
import { usePersonRelations } from './queries';
import { Field, inputClass, Pagination, QueryState } from './directory-ui';
import { DataList, DataListItem } from '../../components/ui/lists';
import { ActionLink, Button } from '../../components/ui/actions';
import { StatusBadge } from '../../components/ui/feedback';
import { OrganizationPersonForm } from './organization-person-form';

function RelationCard({row}:{row:PersonRelation}) {
  return <DataListItem className="organization-episode-row">
    <div className="organization-episode-heading">
      <ActionLink appearance="normal" className="organization-episode-person" to={`/organizations/${row.organizationId}/people/${row.personId}`}>{row.person.displayName}</ActionLink>
      <StatusBadge tone={row.isCurrent?'success':'neutral'}>{row.isCurrent?'Vigente':'Histórico'}</StatusBadge>
    </div>
    <dl className="organization-episode-fields">
      <div><dt>Cargo</dt><dd>{row.positionTitle??'Sin registrar'}</dd></div>
      {row.area&&<div><dt>Área o función</dt><dd>{row.area}</dd></div>}
    </dl>
  </DataListItem>;
}

export function PersonRelations({identity,organizationId,readOnly=false}:{identity:AuthIdentity;organizationId:string;readOnly?:boolean}) {
  const [status,setStatus]=useState('all'),[page,setPage]=useState(1),[creating,setCreating]=useState(false),[name,setName]=useState('');
  const [createdPerson,setCreatedPerson]=useState<Person|null>(null);
  const pageSize=10;
  const queryName=name.trim()?`&name=${encodeURIComponent(name.trim())}`:'';
  const relationPath=('organizations/'+organizationId+'/people')+`?status=${status}&page=${page}&pageSize=${pageSize}${queryName}`;
  const relations=usePersonRelations(identity,relationPath);
  const canAddOrganizationPerson=!readOnly&&identity.permissions.includes('directory.write');
  return <section className="space-y-4 organization-people-section" aria-label="Personas vinculadas">
    <div className="organization-people-heading"><div><h2 className="text-xl font-semibold">Personas vinculadas</h2>
      {relations.data&&<p>{relations.data.total.toLocaleString('es-BO')} {relations.data.total===1?'vínculo registrado':'vínculos registrados'}</p>}</div>
      {canAddOrganizationPerson&&!creating&&<Button onClick={()=>{setCreatedPerson(null);setCreating(true);}}>Añadir persona</Button>}
    </div>
    {createdPerson&&organizationId&&<p className="organization-person-success" role="status">Persona vinculada correctamente. <ActionLink to={`/organizations/${organizationId}/people/${createdPerson.id}`}>Abrir ficha de {createdPerson.displayName}</ActionLink></p>}
    {creating&&organizationId&&<OrganizationPersonForm identity={identity} organizationId={organizationId} cancel={()=>setCreating(false)} saved={person=>{setCreating(false);setCreatedPerson(person);}}/>}
    {(!creating)&&<>
    {<div className="organization-people-filters"><Field label="Buscar por nombre"><input className={inputClass} value={name} onChange={event=>{setName(event.target.value);setPage(1);}} /></Field>
      <Field label="Vigencia del vínculo"><select className={inputClass} value={status} onChange={event=>{setStatus(event.target.value);setPage(1);}}><option value="all">Todos</option><option value="current">Vigentes</option><option value="historical">Históricos</option></select></Field></div>
      }
    <QueryState pending={relations.isPending} error={relations.isError} retry={relations.refetch}/>
    {relations.data?.total===0&&<p>No hay vínculos en esta selección.</p>}
    <DataList className="directory-episode-list">{relations.data?.items.map(row=><RelationCard key={row.id} row={row}/>)}</DataList>
    {relations.data&&(relations.data.total>0)&&<Pagination page={page} total={relations.data.total} pageSize={pageSize} onPage={setPage}/>}
    </>}</section>;
}
