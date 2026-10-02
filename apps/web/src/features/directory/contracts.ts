import { z } from 'zod';
export const categorySchema = z.object({ id: z.string(), name: z.string(), isActive: z.boolean(), version: z.number().int().positive(), createdAt: z.string(), updatedAt: z.string() });
export const organizationSchema = z.object({ id: z.string(), name: z.string(), country: z.string().nullable(), alias: z.string().nullable(),
  description: z.string().nullable(), officialWebsite: z.string().nullable(), isActive: z.boolean(), version: z.number().int().positive(),
  parentId: z.string().nullable(), parent: z.object({ id: z.string(), name: z.string(), isActive: z.boolean() }).nullable(),
  categories: z.array(categorySchema), createdAt: z.string(), updatedAt: z.string(), lastVerifiedAt: z.string().nullable() });
export const historySchema = z.object({ id: z.string(), operationId: z.string(), field: z.string(),
  previousValue: z.union([z.string(), z.boolean(), z.array(z.string()), z.null()]),
  newValue: z.union([z.string(), z.boolean(), z.array(z.string()), z.null()]), createdAt: z.string(),
  actor: z.object({ id: z.string(), givenNames: z.string(), familyNames: z.string() }) });
export const pageSchema = <T extends z.ZodType>(item: T) => z.object({ items: z.array(item), total: z.number().int().nonnegative(), page: z.number().int().positive(), pageSize: z.number().int().positive() });
export const historyPageSchema = pageSchema(historySchema).extend({ references: z.record(z.string(), z.string()).default({}) });
export type Organization = z.infer<typeof organizationSchema>;
export type Category = z.infer<typeof categorySchema>;
export type HistoryEntry = z.infer<typeof historySchema>;
const text = (max: number) => z.string().trim().transform(value => value.replace(/\s+/gu, ' ')).pipe(z.string().max(max, `El máximo es ${max} caracteres.`));
export const organizationFormSchema = z.object({
  name: text(250).pipe(z.string().min(1, 'El nombre es obligatorio.')), country: text(150), alias: text(150), description: text(5000),
  officialWebsite: text(2048).refine(value => {
    if (!value) return true;
    try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !!url.hostname && !url.username && !url.password; } catch { return false; }
  }, 'Introduce un sitio http o https válido.'), parentId: z.string(), categoryIds: z.array(z.string()).max(100),
});
export type OrganizationFormValues = z.infer<typeof organizationFormSchema>;
export const categoryFormSchema = z.object({ name: text(150).pipe(z.string().min(1, 'El nombre es obligatorio.')) });
