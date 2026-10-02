import { z } from 'zod';
import { organizationFormSchema, pageSchema } from './contracts';
const authorSchema = z.object({ id: z.string(), givenNames: z.string(), familyNames: z.string(), isActive: z.boolean() });
export const verificationConditionSchema = z.object({ objectType: z.string(), classification: z.enum(['personal','institutional']), intervalMonths: z.number().int().positive(),
  verificationStatus: z.enum(['NEVER_VERIFIED','CURRENT','REVIEW_DUE']), lastVerifiedAt: z.string().nullable(), lastVerifiedBy: authorSchema.nullable(),
  nextReviewAt: z.string().nullable(), changedSinceVerification: z.boolean(), timeReviewDue: z.boolean(), version: z.number().int().positive(), contactValueVersion: z.number().int().positive().nullable() });
export const verificationHistorySchema = pageSchema(z.object({ id: z.string(), objectType: z.string(), verifiedAt: z.string(), actor: authorSchema,
  sourceDescription: z.string().nullable(), sourceUrl: z.string().nullable() }));
export const verificationFormSchema = z.object({ sourceDescription: z.string().trim().max(1000, 'El máximo es 1000 caracteres.'), sourceUrl: organizationFormSchema.shape.officialWebsite,
  confirmed: z.boolean().refine(value => value, 'Confirme que corroboró la información de este objeto.') });
export type VerificationCondition = z.infer<typeof verificationConditionSchema>;
export const verificationLabels = { NEVER_VERIFIED: 'Nunca verificado', CURRENT: 'Verificado', REVIEW_DUE: 'Revisión pendiente' };
