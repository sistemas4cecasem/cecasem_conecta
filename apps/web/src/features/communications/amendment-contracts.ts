import { z } from 'zod';
export const amendmentSchema = z.object({ id: z.uuid(), communicationId: z.uuid(), type: z.enum(['CORRECTION', 'ANNOTATION', 'INVALIDATION']), content: z.string(), createdAt: z.iso.datetime(),
  author: z.object({ id: z.uuid(), displayName: z.string(), isActive: z.boolean() }) });
export const amendmentsPageSchema = z.object({ items: z.array(amendmentSchema).max(25), total: z.number().int().nonnegative(), page: z.number().int().positive(), pageSize: z.literal(25) });
export const amendmentFormSchema = z.object({ content: z.string().min(1, 'Incluye el contenido o motivo.').max(5000, 'Máximo 5000 caracteres.').refine(value => !!value.trim() && !value.includes('\0'), 'Incluye contenido significativo.') });
export type Amendment = z.infer<typeof amendmentSchema>;
