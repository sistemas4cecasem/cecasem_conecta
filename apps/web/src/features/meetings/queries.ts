import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { z } from 'zod';
import { apiRequest } from '../../lib/api/client';
import { AUTH_QUERY_KEY, type AuthIdentity } from '../auth/session';
import { meetingSchema } from './contracts';
import { invalidateDashboard } from '../home/dashboard-queries';
export const meetingIdentityKey=(identity:AuthIdentity)=>['meetings',identity.id,identity.role,identity.permissions.filter(p=>p.startsWith('meetings.')||['relationships.process.read','opportunities.read'].includes(p)).sort().join(',')] as const;
function assertIdentity(client:QueryClient,identity:AuthIdentity,permission:string){const current=client.getQueryData<AuthIdentity|null>(AUTH_QUERY_KEY);if(!current||!current.permissions.includes(permission)||meetingIdentityKey(current).some((part,index)=>part!==meetingIdentityKey(identity)[index]))throw new DOMException('La sesión cambió.','AbortError');}
export function useMeetingQuery<T extends z.ZodType>(identity:AuthIdentity,path:string,schema:T,enabled=true,permission='meetings.read'){
 const client=useQueryClient();return useQuery({queryKey:[...meetingIdentityKey(identity),path],enabled:enabled&&identity.permissions.includes(permission),retry:false,
 queryFn:async({signal}):Promise<z.infer<T>>=>{assertIdentity(client,identity,permission);const data=await apiRequest(path,{signal});assertIdentity(client,identity,permission);return schema.parse(data);}});
}
export function useMeetingCommand(identity:AuthIdentity,permission:string){
 const client=useQueryClient(),attempt=useRef<{serialized:string;key:string}|null>(null);
 return useMutation({retry:false,mutationFn:async({path,body,method='POST'}:{path:string;body:object;method?:'POST'|'PATCH'})=>{
  assertIdentity(client,identity,permission);const serialized=JSON.stringify({path,body,method});if(attempt.current?.serialized!==serialized)attempt.current={serialized,key:crypto.randomUUID()};
  const data=await apiRequest(path,{method,headers:{'Content-Type':'application/json','Idempotency-Key':attempt.current.key},body:JSON.stringify(body)});assertIdentity(client,identity,permission);return meetingSchema.parse(data);
 },onSuccess:async(row)=>{assertIdentity(client,identity,permission);attempt.current=null;client.setQueryData([...meetingIdentityKey(identity),'meetings/'+row.id],row);
  await Promise.all(['meetings','relationship-processes','relationship-timeline'].map(prefix=>client.invalidateQueries({queryKey:[prefix,identity.id]})));await invalidateDashboard(client,identity);
 }});
}
export async function clearForbiddenMeetings(client:QueryClient,identity:AuthIdentity|null){const prefix=identity?meetingIdentityKey(identity):null;const predicate=(query:{queryKey:readonly unknown[]})=>query.queryKey[0]==='meetings'&&(!identity?.permissions.includes('meetings.read')||!prefix||prefix.some((part,index)=>part!==query.queryKey[index]));await client.cancelQueries({predicate});client.removeQueries({predicate});}
