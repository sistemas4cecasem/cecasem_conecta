import { z } from 'zod';
export const mediumTypes = ['EMAIL', 'PHONE', 'LINKEDIN', 'FORM', 'WEB', 'OTHER'] as const;
export const mediumLabels = { EMAIL: 'Correo electrónico', PHONE: 'Teléfono', LINKEDIN: 'LinkedIn', FORM: 'Formulario web', WEB: 'Sitio web', OTHER: 'Otro' };
const reference = z.object({ id: z.uuid(), label: z.string(), isActive: z.boolean(), currentId: z.uuid() });
export const referralSchema = z.object({ id: z.uuid(), sourceCommunicationId: z.uuid(), createdAt: z.iso.datetime(),
  createdBy: z.object({ id: z.uuid(), displayName: z.string(), isActive: z.boolean() }),
  recommendedName: z.string().nullable(), recommendedRole: z.string().nullable(), organizationNameSnapshot: z.string().nullable(),
  mediumType: z.enum(mediumTypes).nullable(), mediumValue: z.string().nullable(), notes: z.string().nullable(),
  source: z.object({ id: z.uuid(), subject: z.string(), processId: z.uuid(), validity: z.enum(['VALID', 'INVALIDATED']) }),
  person: reference.nullable(), organization: reference.nullable(),
  contactMethod: z.object({ id: z.uuid(), type: z.enum(mediumTypes), value: z.string(), condition: z.enum(['USABLE', 'UNUSABLE']) }).nullable() });
export const referralsPageSchema = z.object({ items: z.array(referralSchema).max(100), total: z.number().int().nonnegative(), page: z.number().int().positive(), pageSize: z.number().int().positive() });
export type Referral = z.infer<typeof referralSchema>;
export const referralFormSchema = z.object({ recommendedName: z.string().max(300), recommendedRole: z.string().max(300), organizationNameSnapshot: z.string().max(300),
  mediumType: z.enum(['', ...mediumTypes]), mediumValue: z.string().max(2048), notes: z.string().max(5000),
  personId: z.uuid().nullable(), organizationId: z.uuid().nullable(), contactMethodId: z.uuid().nullable() }).superRefine((value, ctx) => {
    if (!value.personId && !value.organizationId && !value.recommendedName.trim() && !value.organizationNameSnapshot.trim() && !value.mediumValue.trim())
      ctx.addIssue({ code: 'custom', path: ['recommendedName'], message: 'Incluye un nombre, una organización o un medio recomendado.' });
    if (!!value.mediumType !== !!value.mediumValue.trim()) ctx.addIssue({ code: 'custom', path: ['mediumValue'], message: 'Indica el tipo y el valor del medio, o deja ambos vacíos.' });
    if (value.mediumType === 'EMAIL' && !z.email().safeParse(value.mediumValue.trim()).success) ctx.addIssue({ code: 'custom', path: ['mediumValue'], message: 'Revisa el correo recomendado.' });
    for (const field of ['recommendedName', 'recommendedRole', 'organizationNameSnapshot', 'mediumValue', 'notes'] as const)
      if (value[field].includes('\0') || (value[field] && !value[field].trim())) ctx.addIssue({ code: 'custom', path: [field], message: 'Incluye texto significativo o deja el campo vacío.' });
  });
export type ReferralForm = z.infer<typeof referralFormSchema>;
export function referralBody(value: ReferralForm) {
  return { recommendedName: value.recommendedName.trim() || null, recommendedRole: value.recommendedRole.trim() || null,
    organizationNameSnapshot: value.organizationNameSnapshot.trim() || null, mediumType: value.mediumType || null,
    mediumValue: value.mediumValue.trim() || null, notes: value.notes.trim() || null, personId: value.personId, organizationId: value.organizationId, contactMethodId: value.contactMethodId };
}
