import { z } from 'zod';
import { processStateSchema, processResultSchema } from './process-contracts';
import { communicationSummarySchema } from '../communications/contracts';
const historyItemSchema = communicationSummarySchema.safeExtend({ sender: z.string(), process: z.object({ id: z.uuid(), purpose: z.string() }),
  recipients: z.array(z.object({ type: z.enum(['TO', 'CC', 'BCC']), addressOriginal: z.string(), position: z.number().int().nonnegative() })).max(10), recipientTotal: z.number().int().nonnegative() });
const targetSchema = z.object({ kind: z.enum(['ORGANIZATION', 'PERSON']), id: z.uuid(), label: z.string(), isActive: z.boolean() });
const userSchema = z.object({ id: z.uuid(), displayName: z.string(), isActive: z.boolean() });
const restrictionSchema = z.object({ id: z.uuid(), reason: z.string(), createdAt: z.iso.datetime() });
const intentSchema = z.object({ id: z.uuid(), purpose: z.string(), target: targetSchema, author: userSchema, createdAt: z.iso.datetime(), lastActivityAt: z.iso.datetime() });
const processSchema = z.object({ id: z.uuid(), purpose: z.string(), target: targetSchema, createdBy: userSchema, state: processStateSchema,
  createdAt: z.iso.datetime(), lastActivityAt: z.iso.datetime(), result: processResultSchema.nullable(), closedAt: z.iso.datetime().nullable() });
const actorSchema = z.object({ target: targetSchema, restriction: restrictionSchema.nullable(), contactAllowed: z.boolean(),
  activeIntents: z.object({ items: z.array(intentSchema), total: z.number().int().nonnegative() }),
  activeProcesses: z.object({ items: z.array(processSchema), total: z.number().int().nonnegative() }),
  recentClosedProcesses: z.object({ items: z.array(processSchema), total: z.number().int().nonnegative() }),
  hasRelationshipHistory: z.boolean(), hasRegisteredCommunicationHistory: z.boolean(),
  communicationSummary: z.object({ total: z.number().int().nonnegative(), lastOccurredAt: z.iso.datetime().nullable(), lastDirection: z.enum(['SENT', 'RECEIVED']).nullable() }),
  recentCommunications: z.array(historyItemSchema).max(5) });
export const relationshipContextSchema = actorSchema.extend({ relatedOrganizationContext: z.object({ items: z.array(actorSchema), total: z.number().int().nonnegative() }) });
export type ActorContext = z.infer<typeof actorSchema>;
export type RelationshipContext = z.infer<typeof relationshipContextSchema>;
