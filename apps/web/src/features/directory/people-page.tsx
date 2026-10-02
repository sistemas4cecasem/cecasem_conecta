import { useState } from 'react';
import { Link,useNavigate } from 'react-router';
import { useSession } from '../auth/session';
import { usePeople } from './queries';
import { Field,inputClass,Pagination,QueryState } from './directory-ui';
import { PersonForm } from './person-form';
export function PeoplePage() {
  const identity=useSession().data;const [page,setPage]=useState(1),[name,setName]=useState(''),[status,setStatus]=useState('active');
  const people=usePeople(identity,`people?page=${page}&name=${encodeURIComponent(name)}&status=${status}`);
  if(!identity?.permissions.includes('directory.read')) return <p role="alert">No tienes permiso para consultar personas.</p>;
  return <section className="space-y-4"><Link to="/organizations" className="inline-flex min-h-11 underline">Organizaciones del directorio</Link>
    <h1 className="text-2xl font-semibold">Personas externas</h1>
    {identity.permissions.includes('directory.write')&&<Link to="/people/new" className="inline-flex min-h-11 underline">Crear persona</Link>}
    <Field label="Filtrar personas por nombre"><input className={inputClass} value={name} onChange={e=>{setName(e.target.value);setPage(1);}}/></Field>
    <Field label="Estado"><select className={inputClass} value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}}><option value="active">Activas</option><option value="inactive">Inactivas</option><option value="all">Todas</option></select></Field>
    <QueryState pending={people.isPending} error={people.isError} retry={people.refetch}/>
    {people.data?.total===0&&<p>No hay personas que coincidan.</p>}
    <ul className="space-y-3">{people.data?.items.map(person=><li key={person.id} className="rounded border p-3 break-words"><Link to={'/people/'+person.id} className="inline-flex min-h-11 underline">{person.displayName}</Link>
      <p>{person.isActive?'Activa':'Inactiva'} · {person.currentRelationsCount?`${person.currentRelationsCount} vínculos vigentes`:'Sin vínculos vigentes; persona independiente o institución no identificada.'}</p></li>)}</ul>
    {people.data&&<Pagination page={page} total={people.data.total} onPage={setPage}/>}
  </section>;
}
export function PersonCreationPage() {
  const identity=useSession().data;const navigate=useNavigate();
  if(!identity?.permissions.includes('directory.write')) return <p role="alert">No tienes permiso para crear personas.</p>;
  return <section className="space-y-4"><h1 className="text-2xl font-semibold">Crear persona externa</h1><PersonForm identity={identity} saved={row=>navigate('/people/'+row.id)} cancel={()=>navigate('/people')}/></section>;
}
