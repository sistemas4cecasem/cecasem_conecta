import { z } from 'zod';
import { pageSchema } from '../directory/contracts';
export const processStateSchema = z.enum(['PREPARATION', 'IN_PROGRESS', 'WAITING_RESPONSE', 'NEGOTIATION', 'CLOSED']);
export const processResultSchema = z.enum(['ACHIEVED', 'REJECTED', 'NO_RESPONSE', 'CECASEM_WITHDREW', 'OTHER']);
const userSchema = z.object({ id: z.uuid(), displayName: z.string(), isActive: z.boolean() });
export const processParticipantSchema = z.object({ user: userSchema, joinedAt: z.iso.datetime(), origin: z.enum(['PROCESS_CREATOR', 'SENT_COMMUNICATION', 'RECEIVED_COMMUNICATION', 'MEETING_CREATED']) });
export const PARTICIPANT_ORIGIN_LABELS = { PROCESS_CREATOR: 'Creador del proceso', SENT_COMMUNICATION: 'Comunicación enviada', RECEIVED_COMMUNICATION: 'Comunicación recibida', MEETING_CREATED: 'Actuación formal de reunión' };
export const processEventSchema = z.object({ id: z.uuid(), type: z.enum(['CREATED', 'STATE_CHANGED', 'CLOSED', 'REOPENED']), previousState: processStateSchema.nullable(), newState: processStateSchema,
  result: processResultSchema.nullable(), observation: z.string().nullable(), actor: userSchema, authority: z.enum(['PARTICIPANT', 'BOARD', 'ADMINISTRATOR']), version: z.number().int().positive(), createdAt: z.iso.datetime() });
export const processSchema = z.object({ id: z.uuid(), purpose: z.string(), state: processStateSchema, version: z.number().int().positive(), sourceIntentId: z.uuid().nullable(),
  target: z.object({ kind: z.enum(['ORGANIZATION', 'PERSON']), id: z.uuid(), label: z.string(), isActive: z.boolean() }), createdBy: userSchema,
  createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(), lastActivityAt: z.iso.datetime(), currentResult: processResultSchema.nullable(), closureObservation: z.string().nullable(), closedAt: z.iso.datetime().nullable(), closedBy: userSchema.nullable(),
  allowedStates: z.array(processStateSchema), canClose: z.boolean(), canReopen: z.boolean(), exceptionalAdministration: z.boolean() });
export const processDetailSchema = processSchema.extend({ participants: z.array(processParticipantSchema), events: z.array(processEventSchema), eventsTotal: z.number().int().nonnegative() });
export const processesPageSchema = pageSchema(processSchema), processEventsPageSchema = pageSchema(processEventSchema);
export type RelationshipProcess = z.infer<typeof processSchema>;
export type ProcessDetail = z.infer<typeof processDetailSchema>;
export type ProcessEvent = z.infer<typeof processEventSchema>;
export const PROCESS_STATE_LABELS = { PREPARATION: 'En preparación', IN_PROGRESS: 'En curso', WAITING_RESPONSE: 'Esperando respuesta', NEGOTIATION: 'En negociación', CLOSED: 'Cerrado' };
export const PROCESS_RESULT_LABELS = { ACHIEVED: 'Concretado', REJECTED: 'No aceptado', NO_RESPONSE: 'Sin respuesta', CECASEM_WITHDREW: 'Desistido por CECASEM', OTHER: 'Otro' };
export const OPEN_STATES = ['PREPARATION', 'IN_PROGRESS', 'WAITING_RESPONSE', 'NEGOTIATION'] as const;
export const processCreateSchema = z.object({ purpose: z.string().trim().min(1, 'Describe el propósito.').max(5000, 'Máximo 5000 caracteres.'), targetId: z.uuid('Selecciona un actor del Directorio.'), targetKind: z.enum(['ORGANIZATION', 'PERSON']) });
export const processCloseSchema = z.object({ result: z.enum(processResultSchema.options, { error: 'Selecciona un resultado.' }), observation: z.string().trim().max(5000, 'Máximo 5000 caracteres.') }).refine(value => value.result !== 'OTHER' || !!value.observation, { path: ['observation'], message: 'Explica el resultado Otro.' });
export const processStateFormSchema = z.object({ state: z.enum(OPEN_STATES, { error: 'Selecciona un estado abierto.' }), reason: z.string().trim().max(5000, 'Máximo 5000 caracteres.') });
export const processReopenSchema = processStateFormSchema.extend({ reason: z.string().trim().min(1, 'Explica por qué corresponde reabrir este mismo proceso.').max(5000, 'Máximo 5000 caracteres.') });
