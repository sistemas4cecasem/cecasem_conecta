import { useState } from 'react';
import { Link,useParams } from 'react-router';
import { useSession } from '../auth/session';
import { type Person } from './contracts';
import { usePerson,useDirectoryMutation } from './queries';
import { buttonClass,MutationError,QueryState } from './directory-ui';
import { dateLabel } from './date-label';
import { PersonForm } from './person-form';
import { PersonRelations } from './person-relations';
import { OrganizationHistory } from './organization-history';
import { ContactSection } from './contact-section';
export function PersonDetailPage() {
  const {id=''}=useParams();const identity=useSession().data;const detail=usePerson(identity,id);const mutation=useDirectoryMutation(identity);
  const [editing,setEditing]=useState<Person|null>(null);
  if(!identity?.permissions.includes('directory.read')) return <p role="alert">No tienes permiso para consultar personas.</p>;
  if(!detail.data) return <QueryState pending={detail.isPending} error={detail.isError} retry={detail.refetch}/>;
  const row=detail.data;
  if(editing) return <section className="space-y-4"><h1 className="text-2xl font-semibold">Editar persona</h1><PersonForm identity={identity} initial={editing} saved={()=>setEditing(null)} cancel={()=>setEditing(null)}
    reload={async()=>{const response=await detail.refetch();if(!response.isSuccess)return;setEditing(response.data);return response.data;}}/></section>;
  return <section className="min-w-0 space-y-6 break-words"><Link className="inline-flex min-h-11 underline" to="/people">Volver a personas</Link>
    <h1 className="text-2xl font-semibold">{row.displayName}</h1><p>Estado: {row.isActive?'Activa':'Inactiva'}</p>
    {!row.currentRelationsCount&&<p>Sin vínculos vigentes: persona independiente o institución aún no identificada. Los episodios históricos se conservan abajo.</p>}
    <div className="flex flex-wrap gap-3">{identity.permissions.includes('directory.write')&&<button className={buttonClass} onClick={()=>setEditing(row)}>Editar persona</button>}
      {identity.permissions.includes('directory.status.update')&&<button className={buttonClass} disabled={mutation.isPending} onClick={()=>{void mutation.mutateAsync({path:'people/'+id+'/status',method:'PATCH',body:{isActive:!row.isActive,expectedVersion:row.version}}).catch(()=>undefined);}}>{row.isActive?'Desactivar persona':'Reactivar persona'}</button>}</div>
    <MutationError error={mutation.error} reload={async()=>{await detail.refetch();mutation.reset();}}/>
    <dl className="grid gap-3 sm:grid-cols-2">{[['Nombres',row.givenNames??'Sin dato'],['Apellidos',row.familyNames??'Sin dato'],['Creación',dateLabel(row.createdAt)],['Modificación',dateLabel(row.updatedAt)],['Última verificación',dateLabel(row.lastVerifiedAt)]].map(([label,value])=><div key={label}><dt className="font-semibold">{label}</dt><dd>{value}</dd></div>)}</dl>
    <PersonRelations key={id} identity={identity} personId={id}/>
    <ContactSection key={'contacts-'+id} identity={identity} actorPath={'people/'+id}/>
    {identity.permissions.includes('directory.history.read')&&<OrganizationHistory key={'history-'+id} identity={identity} path={'people/'+id+'/history'}/>}
  </section>;
}
