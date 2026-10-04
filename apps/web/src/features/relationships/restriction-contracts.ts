import { z } from 'zod';
import { pageSchema } from '../directory/contracts';
const userSchema = z.object({ id: z.uuid(), displayName: z.string(), isActive: z.boolean() });
export const restrictionSchema = z.object({ id: z.uuid(), reason: z.string(), state: z.enum(['ACTIVE', 'LIFTED']), version: z.number().int().positive(),
  target: z.object({ kind: z.enum(['ORGANIZATION', 'PERSON']), id: z.uuid(), label: z.string(), isActive: z.boolean() }),
  registeredBy: userSchema, createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(), liftedAt: z.iso.datetime().nullable(), liftedBy: userSchema.nullable(),
  liftReason: z.string().nullable(), canLift: z.boolean() });
export const restrictionsPageSchema = pageSchema(restrictionSchema);
export type ContactRestriction = z.infer<typeof restrictionSchema>;
export const restrictionReasonSchema = z.object({ reason: z.string().trim().min(1, 'Describe el motivo.').max(5000, 'Máximo 5000 caracteres.') });
export const restrictionCreateSchema = restrictionReasonSchema.extend({ targetId: z.uuid('Selecciona un objetivo del Directorio.'), targetKind: z.enum(['ORGANIZATION', 'PERSON']) });
