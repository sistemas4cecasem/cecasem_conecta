export const verificationTargets = {
  organization: { table: 'Organization', column: 'organizationId', classification: 'institutional' },
  person: { table: 'Person', column: 'personId', classification: 'personal' },
  relation: { table: 'PersonOrganizationRelation', column: 'personRelationId', classification: 'personal' },
  personContact: { table: 'PersonContact', column: 'personContactId', classification: 'personal' },
  organizationContact: { table: 'OrganizationContact', column: 'organizationContactId', classification: 'institutional' },
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
