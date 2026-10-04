import { z } from 'zod';
import { amendmentSchema } from '../communications/amendment-contracts';
import { processStateSchema, processResultSchema } from './process-contracts';
const base = { id: z.uuid(), occurredAt: z.iso.datetime(), registeredAt: z.iso.datetime(), summary: z.string(),
  actor: z.object({ id: z.uuid(), displayName: z.string(), isActive: z.boolean() }) };
export const timelineItemSchema = z.discriminatedUnion('kind', [
  z.object({ ...base, kind: z.enum(['SENT_COMMUNICATION', 'RECEIVED_COMMUNICATION']), payload: z.object({ validity: z.enum(['VALID', 'INVALIDATED']).default('VALID'), invalidation: amendmentSchema.nullable().default(null), communicationId: z.uuid(), sender: z.string(), subject: z.string(),
    recipients: z.array(z.object({ type: z.enum(['TO', 'CC', 'BCC']), addressOriginal: z.string(), position: z.number().int().nonnegative() })).max(10), recipientTotal: z.number().int().nonnegative() }) }),
  z.object({ ...base, kind: z.enum(['PROCESS_CREATED', 'PROCESS_STATE_CHANGED', 'PROCESS_CLOSED', 'PROCESS_REOPENED']), payload: z.object({ eventId: z.uuid(),
    previousState: processStateSchema.nullable(), newState: processStateSchema, result: processResultSchema.nullable(), observation: z.string().nullable() }) }),
  z.object({ ...base, kind: z.enum(['COMMUNICATION_CORRECTED', 'COMMUNICATION_ANNOTATED', 'COMMUNICATION_INVALIDATED']), payload: z.object({ amendmentId: z.uuid(), communicationId: z.uuid(), content: z.string() }) }),
  z.object({ ...base, kind: z.literal('FILES_ATTACHED'), payload: z.object({ uploadId: z.uuid(), communicationId: z.uuid().nullable(), names: z.array(z.string()).min(1).max(10) }) }),
  z.object({ ...base, kind: z.literal('INTERNAL_NOTE'), payload: z.object({ noteId: z.uuid(), body: z.string() }) }),
]);
export const timelinePageSchema = z.object({ items: z.array(timelineItemSchema).max(100), nextCursor: z.string().nullable() });
export type TimelineItem = z.infer<typeof timelineItemSchema>;
export const noteFormSchema = z.object({ body: z.string().min(1, 'Incluye el contexto interno.').max(5000, 'Máximo 5000 caracteres.').refine(value => !!value.trim() && !value.includes('\0'), 'Incluye una nota válida.') });
