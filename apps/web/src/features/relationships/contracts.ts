import { z } from 'zod';
import { pageSchema } from '../directory/contracts';
const authorSchema = z.object({ id: z.uuid(), displayName: z.string(), isActive: z.boolean() });
export const intentSchema = z.object({ id: z.uuid(), purpose: z.string(), state: z.enum(['ACTIVE', 'CONVERTED', 'CANCELLED', 'CLOSED']),
  version: z.number().int().positive(), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(), lastActivityAt: z.iso.datetime(),
  cancelledAt: z.iso.datetime().nullable(), author: authorSchema, cancelledBy: authorSchema.nullable(),
  target: z.object({ kind: z.enum(['ORGANIZATION', 'PERSON']), id: z.uuid(), label: z.string(), isActive: z.boolean() }), canCancel: z.boolean(),
  canConvert: z.boolean(), processId: z.uuid().nullable() });
export const intentsPageSchema = pageSchema(intentSchema);
export type ContactIntent = z.infer<typeof intentSchema>;
export const intentFormSchema = z.object({ purpose: z.string().trim().min(1, 'Describe el propósito.').max(5000, 'Máximo 5000 caracteres.'),
  targetId: z.uuid('Selecciona un objetivo del Directorio.'), targetKind: z.enum(['ORGANIZATION', 'PERSON']) });
export const INTENT_LABELS = { ACTIVE: 'Activa', CONVERTED: 'Convertida', CANCELLED: 'Cancelada', CLOSED: 'Cerrada' };
