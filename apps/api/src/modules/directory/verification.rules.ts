import { Prisma } from '../../generated/prisma/client';
export type VerificationStatus = 'NEVER_VERIFIED' | 'REVIEW_DUE' | 'CURRENT';

/** Última verificación, versión y meses calendario UTC; equivalente a verificationCondition. */
export function organizationVerificationPredicate(status: VerificationStatus, id: Prisma.Sql, version: Prisma.Sql, months: number, now: Date): Prisma.Sql {
  const latest = Prisma.sql`SELECT v."verifiedAt", v."objectVersion" FROM "Verification" v
    WHERE v."organizationId" = ${id} ORDER BY v."verifiedAt" DESC, v.id DESC LIMIT 1`;
  if (status === 'NEVER_VERIFIED') return Prisma.sql`NOT EXISTS (${latest})`;
  const due = Prisma.sql`v."objectVersion" <> ${version} OR
    ((v."verifiedAt" AT TIME ZONE 'UTC') + make_interval(months => ${months}::int)) <= (${now}::timestamptz AT TIME ZONE 'UTC')`;
  return Prisma.sql`EXISTS (SELECT 1 FROM (${latest}) v WHERE ${status === 'REVIEW_DUE' ? due : Prisma.sql`NOT (${due})`})`;
}

export const verificationTargets = {
  organization: { table: 'Organization', column: 'organizationId', classification: 'institutional' },
  person: { table: 'Person', column: 'personId', classification: 'personal' },
  relation: { table: 'PersonOrganizationRelation', column: 'personRelationId', classification: 'personal' },
  personContact: { table: 'PersonContact', column: 'personContactId', classification: 'personal' },
  organizationContact: { table: 'OrganizationContact', column: 'organizationContactId', classification: 'institutional' },
  importedHistory: { table: 'ImportedHistoricalRecord', column: 'importedHistoryId', classification: 'institutional' },
} as const;
export type VerificationKind = keyof typeof verificationTargets;
export function addCalendarMonths(at: Date, months: number): Date {
  const first = new Date(at); first.setUTCDate(1); first.setUTCMonth(first.getUTCMonth() + months);
  const last = new Date(first); last.setUTCMonth(last.getUTCMonth() + 1); last.setUTCDate(0);
  first.setUTCDate(Math.min(at.getUTCDate(), last.getUTCDate())); return first;
}
export function verificationCondition(latest: { verifiedAt: Date; objectVersion: number; contactValueVersion: number | null } | null,
  current: { version: number; contactValueVersion: number | null }, months: number, now: Date) {
  const nextReviewAt = latest ? addCalendarMonths(latest.verifiedAt, months) : null;
  const changedSinceVerification = !!latest && (latest.objectVersion !== current.version || latest.contactValueVersion !== current.contactValueVersion);
  const timeReviewDue = !!nextReviewAt && now >= nextReviewAt;
  return { verificationStatus: !latest ? 'NEVER_VERIFIED' as const : changedSinceVerification || timeReviewDue ? 'REVIEW_DUE' as const : 'CURRENT' as const,
    nextReviewAt, changedSinceVerification, timeReviewDue };
}
