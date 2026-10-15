import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api/client';
import type { AuthIdentity } from '../auth/session';
import { personProfileSchema } from './person-profile.contracts';
export function usePersonProfile(identity:AuthIdentity|null|undefined,id:string,organizationId?:string) {
  return useQuery({queryKey:['directory',identity?.id,'person-profile',id,organizationId],enabled:!!identity?.permissions.includes('directory.read'),retry:false,
    queryFn:async({signal})=>personProfileSchema.parse(await apiRequest('people/'+id+'/profile'+(organizationId?'?organizationId='+encodeURIComponent(organizationId):''),{signal}))});
}
