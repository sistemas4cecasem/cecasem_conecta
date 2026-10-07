import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useSession } from '../auth/session';
import { usePeople } from './queries';
import { ActionLink } from '../../components/ui/actions';
import { EmptyState, QueryFeedback, StatusBadge } from '../../components/ui/feedback';
import { FormField, Input, Select } from '../../components/ui/forms';
import { FilterBar, PageHeader, Surface } from '../../components/ui/layout';
import { DataList, DataListItem, Metadata, Pagination } from '../../components/ui/lists';
import './directory-pages.css';
import { PersonForm } from './person-form';
export function PeoplePage() {
  const identity=useSession().data;const [page,setPage]=useState(1),[name,setName]=useState(''),[status,setStatus]=useState('active');
  const people=usePeople(identity,`people?page=${page}&name=${encodeURIComponent(name)}&status=${status}`);
  if(!identity?.permissions.includes('directory.read')) return <p role="alert">No tienes permiso para consultar personas.</p>;
  return <section className="directory-page directory-people">
    <PageHeader eyebrow="Directorio" title="Personas externas" description="Consulta las personas registradas y sus vínculos institucionales."
      primaryAction={identity.permissions.includes('directory.write') && <ActionLink appearance="action" className="directory-primary-action" to="/people/new">Crear persona</ActionLink>} />
    <FilterBar aria-label="Filtros de personas">
      <FormField label="Filtrar personas por nombre">{control => <Input {...control} value={name} onChange={e=>{setName(e.target.value);setPage(1);}}/>}</FormField>
      <FormField label="Estado">{control => <Select {...control} value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}}><option value="active">Activas</option><option value="inactive">Inactivas</option><option value="all">Todas</option></Select>}</FormField>
    </FilterBar>
    <Surface aria-label="Resultados de personas"><header className="ui-section-heading"><h2>Resultados</h2></header>
    {people.data && <p className="ui-description">{people.data.total} personas</p>}
    <QueryFeedback pending={people.isPending} error={people.isError} retry={people.refetch}/>
    {people.data?.total===0&&<EmptyState title="No hay personas que coincidan."/>}
    {!!people.data?.items.length && <DataList>{people.data.items.map(person=><DataListItem key={person.id}>
      <div className="directory-row-heading"><ActionLink appearance="list" to={'/people/'+person.id}>{person.displayName}</ActionLink>
        <StatusBadge tone={person.isActive?'success':'neutral'}>{person.isActive?'Activa':'Inactiva'}</StatusBadge></div>
      <Metadata items={[{label:'Contexto institucional',value:person.currentRelationsCount?`${person.currentRelationsCount} vínculos vigentes`:'Sin vínculos vigentes; persona independiente o institución no identificada.'}]} />
    </DataListItem>)}</DataList>}
    {people.data&&<Pagination page={page} total={people.data.total} onPage={setPage}/>}
    </Surface>
  </section>;
}
export function PersonCreationPage() {
  const identity=useSession().data;const navigate=useNavigate();
  if(!identity?.permissions.includes('directory.write')) return <p role="alert">No tienes permiso para crear personas.</p>;
  return <section className="space-y-4"><h1 className="text-2xl font-semibold">Crear persona externa</h1><PersonForm identity={identity} saved={row=>navigate('/people/'+row.id)} cancel={()=>navigate('/people')}/></section>;
}
