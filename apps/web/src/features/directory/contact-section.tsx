import { useState } from 'react';
import type { AuthIdentity } from '../auth/session';
import { useContactAssociations } from './contacts.queries';
import { ContactAssociationCard } from './contact-associations';
import { ContactCreateForm } from './contact-create-form';
import { Pagination,QueryState } from './directory-ui';
import { Button } from '../../components/ui/actions';
import { DataList } from '../../components/ui/lists';
export function ContactSection({identity,actorPath,readOnly=false,presentation='default'}:{identity:AuthIdentity;actorPath:string;readOnly?:boolean;presentation?:'default'|'organization'}) {
  const [page,setPage]=useState(1),[creating,setCreating]=useState(false);const query=useContactAssociations(identity,actorPath+'/contacts?page='+page);
  const organizationPresentation=presentation==='organization';
  return <section className={`min-w-0 space-y-4 break-words ${organizationPresentation?'organization-contact-section':''}`}><h2 className="text-xl font-semibold">Medios de contacto</h2>
    {!readOnly&&identity.permissions.includes('directory.write')&&<Button onClick={()=>setCreating(true)}>Registrar medio de contacto</Button>}
    {creating&&<ContactCreateForm identity={identity} actorPath={actorPath} organizationPresentation={organizationPresentation} saved={()=>setCreating(false)} cancel={()=>setCreating(false)}/>}
    <QueryState pending={query.isPending} error={query.isError} retry={query.refetch}/>{query.data?.total===0&&<p>No hay medios de contacto asociados.</p>}
    <DataList className="directory-contact-list">{query.data?.items.map(row=><ContactAssociationCard modern key={row.id} identity={identity} row={row} readOnly={readOnly} organizationPresentation={organizationPresentation} hideEmptyHistoryPagination={organizationPresentation}/>)}</DataList>
    {query.data&&(!organizationPresentation||query.data.total>0)&&<Pagination page={page} total={query.data.total} onPage={setPage}/>}</section>;
}
