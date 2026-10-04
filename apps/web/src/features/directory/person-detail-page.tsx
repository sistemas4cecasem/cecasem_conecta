import { DuplicatePanel } from './duplicate-panel';
import { VerificationPanel } from './verification-panel';
import { useState } from 'react';
import { Link,useParams } from 'react-router';
import { useSession } from '../auth/session';
import { type Person } from './contracts';
import { usePerson,useDirectoryMutation } from './queries';
import { buttonClass,MutationError,QueryState } from './directory-ui';
import { dateLabel } from './date-label';
import { PersonForm } from './person-form';
import { PersonRelations } from './person-relations';
import { DirectoryHistory } from './directory-history';
import { ContactSection } from './contact-section';
import { RelationshipContextPanel } from '../relationships/relationship-context-panel';
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
    <RelationshipContextPanel identity={identity} target={{kind:'PERSON',id:row.id,label:row.displayName}} />
    {row.duplicateOf&&<p role="status" className="rounded border border-amber-500 p-3">Este registro fue consolidado en: <Link className="underline" to={'/people/'+row.duplicateOf.id}>{row.duplicateOf.displayName}</Link>. Su historial permanece disponible.</p>}
    {!!row.consolidatedRecords?.length&&<p>Fichas consolidadas: {row.consolidatedRecords.map(item=><Link key={item.id} className="inline-flex min-h-11 items-center px-2 underline" to={'/people/'+item.id}>{item.displayName}</Link>)}</p>}
    <DuplicatePanel key={'duplicates-'+id} identity={identity} actorPath={'people/'+id}/>
    {!row.currentRelationsCount&&<p>Sin vínculos vigentes: persona independiente o institución aún no identificada. Los episodios históricos se conservan abajo.</p>}
    <div className="flex flex-wrap gap-3">{!row.duplicateOfId&&identity.permissions.includes('directory.write')&&<button className={buttonClass} onClick={()=>setEditing(row)}>Editar persona</button>}
      {!row.duplicateOfId&&identity.permissions.includes('directory.status.update')&&<button className={buttonClass} disabled={mutation.isPending} onClick={()=>{void mutation.mutateAsync({path:'people/'+id+'/status',method:'PATCH',body:{isActive:!row.isActive,expectedVersion:row.version}}).catch(()=>undefined);}}>{row.isActive?'Desactivar persona':'Reactivar persona'}</button>}</div>
    <MutationError error={mutation.error} reload={async()=>{await detail.refetch();mutation.reset();}}/>
    <dl className="grid gap-3 sm:grid-cols-2">{[['Nombres',row.givenNames??'Sin dato'],['Apellidos',row.familyNames??'Sin dato'],['Creación',dateLabel(row.createdAt)],['Modificación',dateLabel(row.updatedAt)],['Última verificación',dateLabel(row.lastVerifiedAt)]].map(([label,value])=><div key={label}><dt className="font-semibold">{label}</dt><dd>{value}</dd></div>)}</dl>
    <VerificationPanel identity={identity} readOnly={!!row.duplicateOfId} path={'people/'+id} label={'persona '+row.displayName}/>
    <PersonRelations key={id} identity={identity} personId={id} readOnly={!!row.duplicateOfId}/>
    <ContactSection key={'contacts-'+id} identity={identity} actorPath={'people/'+id} readOnly={!!row.duplicateOfId}/>
    {identity.permissions.includes('directory.history.read')&&<DirectoryHistory key={'history-'+id} identity={identity} path={'people/'+id+'/history'}/>}
  </section>;
}
