import { ContactIntentState, UserRole } from '../../generated/prisma/client';
import type { InstitutionalTarget } from '../directory/directory-target.service';

export type IntentErrorCode = 'FORBIDDEN' | 'INVALID_INTENT' | 'INTENT_NOT_FOUND' | 'INTENT_TARGET_UNAVAILABLE' | 'VERSION_CONFLICT' | 'INTENT_NOT_ACTIVE';
export class IntentError extends Error {
  constructor(public readonly code: IntentErrorCode) { super(code); }
}
export function intentTarget(input: { organizationId?: string; personId?: string }): InstitutionalTarget {
  if (!!input.organizationId === !!input.personId) throw new IntentError('INVALID_INTENT');
  return input.organizationId ? { organizationId: input.organizationId } : { personId: input.personId! };
}
export function intentPurpose(value: string): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 5000) throw new IntentError('INVALID_INTENT');
  return value.trim();
}
export function canCancelIntent(role: UserRole, userId: string, authorUserId: string): boolean {
  return role === UserRole.ADMINISTRATOR || role === UserRole.BOARD ||
    ((role === UserRole.RESEARCH || role === UserRole.PLANNING) && userId === authorUserId);
}
export function requireActiveIntent(state: ContactIntentState, version: number, expectedVersion: number): void {
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw new IntentError('INVALID_INTENT');
  if (version !== expectedVersion) throw new IntentError('VERSION_CONFLICT');
  if (state !== ContactIntentState.ACTIVE) throw new IntentError('INTENT_NOT_ACTIVE');
}
