import { RestrictionState } from '../../generated/prisma/client';
import type { InstitutionalTarget } from '../directory/directory-target.service';
export type RestrictionErrorCode = 'FORBIDDEN' | 'INVALID_RESTRICTION' | 'RESTRICTION_NOT_FOUND' | 'RESTRICTION_TARGET_UNAVAILABLE' | 'CONTACT_RESTRICTED' | 'RESTRICTION_ALREADY_ACTIVE' | 'RESTRICTION_ALREADY_LIFTED' | 'VERSION_CONFLICT';
export class RestrictionError extends Error {
  constructor(public readonly code: RestrictionErrorCode) { super(code); }
}
export function restrictionTarget(input: { organizationId?: string; personId?: string }): InstitutionalTarget {
  if (!!input.organizationId === !!input.personId) throw new RestrictionError('INVALID_RESTRICTION');
  return input.organizationId ? { organizationId: input.organizationId } : { personId: input.personId! };
}
export function restrictionReason(reason: string): string {
  if (typeof reason !== 'string' || !reason.trim() || reason.trim().length > 5000) throw new RestrictionError('INVALID_RESTRICTION');
  return reason.trim();
}
export function requireActiveRestriction(state: RestrictionState, version: number, expectedVersion: number): void {
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw new RestrictionError('INVALID_RESTRICTION');
  if (version !== expectedVersion) throw new RestrictionError('VERSION_CONFLICT');
  if (state !== RestrictionState.ACTIVE) throw new RestrictionError('RESTRICTION_ALREADY_LIFTED');
}
