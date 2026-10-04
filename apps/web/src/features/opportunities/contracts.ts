import { z } from 'zod';
export const STATUS_LABELS = { PENDING_REVIEW: 'Pendiente de revisión', PREPARING: 'En preparación', SUBMITTED: 'Postulada', DISCARDED: 'Descartada', FINISHED: 'Finalizada' };
export const statusSchema = z.enum(['PENDING_REVIEW', 'PREPARING', 'SUBMITTED', 'DISCARDED', 'FINISHED']);
const authorSchema = z.object({ id: z.uuid(), displayName: z.string(), isActive: z.boolean() });
export const opportunitySchema = z.object({ id: z.uuid(), name: z.string(), description: z.string().nullable(), url: z.string().nullable(), deadline: z.string().nullable(), requirements: z.string().nullable(), status: statusSchema, discardReason: z.string().nullable(), finalResult: z.string().nullable(), version: z.number().int().positive(), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(), createdBy: authorSchema,
  organizations: z.array(z.object({ id: z.uuid(), name: z.string(), isActive: z.boolean() })), process: z.object({ id: z.uuid(), purpose: z.string() }).nullable(), communication: z.object({ id: z.uuid(), subject: z.string(), processId: z.uuid(), validity: z.string() }).nullable(), allowedStatuses: z.array(statusSchema), canEdit: z.boolean() });
export type Opportunity = z.infer<typeof opportunitySchema>;
export const opportunityPageSchema = z.object({ items: z.array(opportunitySchema), total: z.number().int().nonnegative(), page: z.number().int(), pageSize: z.number().int() });
export const historySchema = z.object({ items: z.array(z.object({ id: z.uuid(), source: z.enum(['EVENT', 'FILE']), kind: z.enum(['CREATED', 'UPDATED', 'STATUS_CHANGED', 'DISCARDED', 'FINISHED', 'FILES_ATTACHED']), createdAt: z.iso.datetime(), actor: authorSchema, previousStatus: statusSchema.nullable(), newStatus: statusSchema.nullable(), changes: z.record(z.string(), z.unknown()) })), nextCursor: z.string().nullable() });
export const descriptionFormSchema = z.object({ name: z.string().trim().min(1, 'Escribe un nombre.').max(300), description: z.string().max(10000), requirements: z.string().max(10000), url: z.string().max(2048).refine(value => { if (!value.trim())
    return true; try {
    const url = new URL(value.trim());
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  }
  catch {
    return false;
  } }, 'Usa una URL HTTP o HTTPS válida.'), deadline: z.string().refine(value => !value || (/^\d{4}-\d{2}-\d{2}$/.test(value) && !value.startsWith('0000') && !Number.isNaN(+new Date(value)) && new Date(value).toISOString().slice(0, 10) === value), 'Usa una fecha válida.'), organizationIds: z.array(z.uuid()).min(1, 'Agrega al menos una organización.').max(100).refine(value => new Set(value).size === value.length, 'No repitas organizaciones.') });
export const stateFormSchema = z.object({ status: statusSchema, reason: z.string().max(5000), finalResult: z.string().max(5000) }).refine(value => value.status !== 'DISCARDED' || !!value.reason.trim(), { path: ['reason'], message: 'Explica el motivo del descarte.' });
export function deadlineLabel(value: string | null) { return value ? value.split('-').reverse().join('/') : 'Sin fecha límite'; }
