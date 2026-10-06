import { z } from 'zod';
import { pageSchema } from './contracts';
const organizationIdentity = z.object({ id: z.uuid(), name: z.string(), isActive: z.boolean(),
  duplicateOf: z.object({ id: z.uuid(), name: z.string(), isActive: z.boolean() }).nullable() });
const personIdentity = z.object({ id: z.uuid(), displayName: z.string(), isActive: z.boolean(),
  duplicateOf: z.object({ id: z.uuid(), displayName: z.string(), isActive: z.boolean() }).nullable() });
const organizationResult = organizationIdentity.extend({ type: z.literal('ORGANIZATION'), alias: z.string().nullable(), country: z.string().nullable(),
  parent: z.object({ id: z.uuid(), name: z.string(), isActive: z.boolean() }).nullable() });
const personResult = personIdentity.extend({ type: z.literal('PERSON'), currentRelationsTotal: z.number().int().nonnegative(),
  currentRelations: z.array(z.object({ id: z.uuid(), positionTitle: z.string().nullable(),
    organization: z.object({ id: z.uuid(), name: z.string(), isActive: z.boolean() }) })) });
function context<T extends z.ZodType>(item: T) {
  return z.object({ items: z.array(item), total: z.number().int().nonnegative(), limit: z.number().int().positive() });
}
const processResult = z.object({ type: z.literal('PROCESS'), id: z.uuid(), purpose: z.string(),
  state: z.enum(['PREPARATION', 'IN_PROGRESS', 'WAITING_RESPONSE', 'NEGOTIATION', 'CLOSED']),
  target: z.object({ kind: z.enum(['ORGANIZATION', 'PERSON']), id: z.uuid(), label: z.string(), isActive: z.boolean() }) });
const emailCommunication = z.object({ type: z.literal('COMMUNICATION'), id: z.uuid(), matchedAddress: z.string(),
  direction: z.enum(['SENT', 'RECEIVED']), validity: z.enum(['VALID', 'INVALIDATED']), occurredAt: z.iso.datetime(),
  registeredBy: z.object({ id: z.uuid(), displayName: z.string(), isActive: z.boolean() }), process: processResult });
const importedHistoryRecord = z.object({ type: z.literal('IMPORTED_HISTORICAL_RECORD'), id: z.uuid(), kind: z.enum(['SENT','RECEIVED','OTHER','UNKNOWN']),
  occurredOn: z.string().nullable(), subject: z.string().nullable(), body: z.string().nullable(), originalObservation: z.string().nullable(), lastVerifiedAt: z.string().nullable(),
  batch: z.object({ id: z.uuid(), originalFilename: z.string(), createdAt: z.string() }),
  organization: z.object({ id: z.uuid(), name: z.string() }).nullable(), person: z.object({ id: z.uuid(), displayName: z.string() }).nullable() });
export const searchResponseSchema = z.object({ query: z.string(), organizations: pageSchema(organizationResult), people: pageSchema(personResult),
  processes: pageSchema(processResult).nullable().default(null),
  emailHistory: pageSchema(emailCommunication).extend({ address: z.string(), lastValidContact: emailCommunication.nullable(), importedRecords: pageSchema(importedHistoryRecord).optional().default({items:[],total:0,page:1,pageSize:25}) }).nullable().default(null),
  email: z.object({ type: z.literal('EMAIL'), id: z.uuid(), value: z.string(), condition: z.enum(['USABLE', 'UNUSABLE']),
    people: context(z.object({ id: z.uuid(), isActive: z.boolean(), person: personIdentity })),
    organizations: context(z.object({ id: z.uuid(), isActive: z.boolean(), organization: organizationIdentity })) }).nullable() });
export type DirectorySearchResponse = z.infer<typeof searchResponseSchema>;
export function searchPermissionKey(identity: { permissions: string[] }) {
  return identity.permissions.filter(permission => ['directory.read', 'relationships.process.read', 'communications.read'].includes(permission)).sort().join(',');
}
export function validSearchQuery(q: string) {
  const value = q.trim();
  if (value.length < 2 || value.length > 254) return false;
  if (value.includes('@')) return z.email().safeParse(value.toLowerCase()).success;
  const name = value.normalize('NFD').replace(/[\u0300-\u036f]/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  return name.length >= 2 && name.split(/\s+/u).length <= 12;
}
