import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import type { AuthIdentity } from '../auth/session';
import { apiRequest } from '../../lib/api/client';
import { pageSchema } from './contracts';
import { contactAssociationSchema, contactMethodSchema } from './contacts.contracts';
export function useContactMethod(identity:AuthIdentity|null|undefined,id:string|undefined) {
  return useQuery({queryKey:['directory',identity?.id,'contact-method',id],enabled:!!id&&!!identity?.permissions.includes('directory.read'),
    queryFn:async({signal})=>contactMethodSchema.parse(await apiRequest('contact-methods/'+id,{signal})),retry:false});
}
export function useContactMethods(identity:AuthIdentity|null|undefined,path:string|undefined) {
  return useQuery({queryKey:['directory',identity?.id,'contact-methods',path],enabled:!!path&&!!identity?.permissions.includes('directory.read'),
    queryFn:async({signal})=>pageSchema(contactMethodSchema).parse(await apiRequest(path!,{signal})),retry:false});
}
export function useContactAssociations(identity:AuthIdentity|null|undefined,path:string|undefined) {
  return useQuery({queryKey:['directory',identity?.id,'contact-associations',path],enabled:!!path&&!!identity?.permissions.includes('directory.read'),
    queryFn:async({signal})=>pageSchema(contactAssociationSchema).parse(await apiRequest(path!,{signal})),retry:false});
}
export function useExactContactEmail(identity:AuthIdentity|null|undefined,value:string,enabled:boolean) {
  const normalized=value.trim().toLowerCase();const [settled,setSettled]=useState('');
  useEffect(()=>{const timeout=setTimeout(()=>setSettled(normalized),350);return()=>clearTimeout(timeout);},[normalized]);
  return useQuery({queryKey:['directory',identity?.id,'contact-email',enabled?normalized:null],enabled:enabled&&settled===normalized&&z.email().safeParse(normalized).success&&!!identity?.permissions.includes('directory.read'),
    queryFn:async({signal})=>z.object({contact:contactMethodSchema.nullable()}).parse(await apiRequest('contact-methods/email?email='+encodeURIComponent(normalized),{signal})),retry:false});
}
