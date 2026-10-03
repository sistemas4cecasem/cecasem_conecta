import { z } from 'zod';
import { pageSchema } from './contracts';

export const duplicateActorSchema = z.object({ id: z.string(), version: z.number().int().positive(), duplicateOfId: z.string().nullable(),
  name: z.string().optional(), displayName: z.string().optional(), alias: z.string().nullable().optional(), country: z.string().nullable().optional(),
  givenNames: z.string().nullable().optional(), familyNames: z.string().nullable().optional(), parentId: z.string().nullable().optional(),
  parent: z.object({ id: z.string(), name: z.string() }).nullable().optional(), isActive: z.boolean(), lastVerifiedAt: z.string().nullable() });
export const duplicateCandidateSchema = z.object({ id: z.string(), kind: z.enum(['organization', 'person']), a: duplicateActorSchema, b: duplicateActorSchema,
  score: z.number().min(0).max(1), signals: z.array(z.string()), state: z.enum(['PENDING', 'NOT_DUPLICATE', 'CONSOLIDATED']),
  version: z.number().int().positive(), examinedVersionA: z.number().int().positive(), examinedVersionB: z.number().int().positive(),
  detectedAt: z.string(), stale: z.boolean(), resolvedAt: z.string().nullable(), principalId: z.string().nullable(),
  resolvedBy: z.object({ id: z.string(), givenNames: z.string(), familyNames: z.string(), isActive: z.boolean() }).nullable() });
export const duplicatePageSchema = pageSchema(duplicateCandidateSchema);
const contextSchema = z.object({ sourceDescription: z.string().nullable(), sourceUrl: z.string().nullable(), notes: z.string().nullable() });
const previewActorSchema = duplicateActorSchema.extend({
  label: z.string(), officialWebsite: z.string().nullable().optional(),
  children: z.array(z.object({ id: z.string(), name: z.string() })).optional(),
  categories: z.array(z.object({ categoryId: z.string(), category: z.object({ id: z.string(), name: z.string(), isActive: z.boolean() }) })).optional(),
  contacts: z.array(contextSchema.extend({ id: z.string(), isActive: z.boolean(), lastVerifiedAt: z.string().nullable(),
    contactMethod: z.object({ id: z.string(), type: z.string(), value: z.string(), condition: z.string() }) })),
  relations: z.array(contextSchema.extend({ id: z.string(), isCurrent: z.boolean(), positionTitle: z.string().nullable(), area: z.string().nullable(),
    startDate: z.string().nullable(), endDate: z.string().nullable(), lastVerifiedAt: z.string().nullable(),
    person: z.object({ id: z.string(), displayName: z.string() }), organization: z.object({ id: z.string(), name: z.string() }) })),
  verifications: z.array(z.object({ id: z.string(), verifiedAt: z.string(), objectVersion: z.number(),
    actor: z.object({ id: z.string(), givenNames: z.string(), familyNames: z.string() }) })),
});
export const consolidationPreviewSchema = z.object({ candidate: duplicateCandidateSchema, principal: previewActorSchema, duplicate: previewActorSchema,
  previewToken: z.string(), blockers: z.array(z.string()), effects: z.array(z.string()),
  contacts: z.array(z.object({ sourceId: z.string(), targetId: z.string().nullable(), value: z.string(), outcome: z.enum(['CREATED', 'REUSED', 'KEPT_PRINCIPAL']),
    contextConflict: z.boolean(), reactivate: z.boolean(), sourceContext: contextSchema, principalContext: contextSchema.nullable() })),
  relations: z.array(z.object({ sourceId: z.string(), targetId: z.string().nullable(), outcome: z.enum(['CREATED', 'REUSED']),
    positionTitle: z.string().nullable(), area: z.string().nullable() })),
  categories: z.array(z.object({ id: z.string(), name: z.string(), isActive: z.boolean() })),
});
export type DuplicateCandidate = z.infer<typeof duplicateCandidateSchema>;
export type DuplicateActor = z.infer<typeof duplicateActorSchema>;
export type ConsolidationPreview = z.infer<typeof consolidationPreviewSchema>;
export function duplicateActorLabel(actor: DuplicateActor): string { return actor.name ?? actor.displayName ?? actor.id; }
