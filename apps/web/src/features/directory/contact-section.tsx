import { useState } from 'react';
import type { AuthIdentity } from '../auth/session';
import { useContactAssociations } from './contacts.queries';
import { ContactAssociationCard } from './contact-associations';
import { ContactCreateForm } from './contact-create-form';
import { buttonClass,Pagination,QueryState } from './directory-ui';
export function ContactSection({identity,actorPath}:{identity:AuthIdentity;actorPath:string}) {
  const [page,setPage]=useState(1),[creating,setCreating]=useState(false);const query=useContactAssociations(identity,actorPath+'/contacts?page='+page);
  return <section className="min-w-0 space-y-4 break-words"><h2 className="text-xl font-semibold">Medios de contacto</h2>
    {identity.permissions.includes('directory.write')&&<button className={buttonClass} onClick={()=>setCreating(true)}>Registrar medio de contacto</button>}
    {creating&&<ContactCreateForm identity={identity} actorPath={actorPath} saved={()=>setCreating(false)} cancel={()=>setCreating(false)}/>}
    <QueryState pending={query.isPending} error={query.isError} retry={query.refetch}/>{query.data?.total===0&&<p>No hay medios de contacto asociados.</p>}
    <ul className="space-y-3">{query.data?.items.map(row=><ContactAssociationCard key={row.id} identity={identity} row={row}/>)}</ul>
    {query.data&&<Pagination page={page} total={query.data.total} onPage={setPage}/>}</section>;
}
