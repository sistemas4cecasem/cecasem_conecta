import type { InstitutionalTarget } from '../directory/directory-target.service';
import { PERMISSIONS } from '../auth/authorization/permission';
export const CONTEXT_READ_PERMISSIONS = [PERMISSIONS.DIRECTORY_READ, PERMISSIONS.INTENT_READ, PERMISSIONS.PROCESS_READ, PERMISSIONS.RESTRICTION_READ, PERMISSIONS.COMMUNICATION_READ] as const;
export const CONTEXT_ITEM_LIMIT = 5;
export const CONTEXT_ORGANIZATION_LIMIT = 5;
export class ContextError extends Error {
  constructor(public readonly code: 'INVALID_CONTEXT_TARGET' | 'CONTEXT_TARGET_NOT_FOUND' | 'FORBIDDEN') { super(code); }
}
export function contextTarget(input: { organizationId?: string; personId?: string }): InstitutionalTarget {
  if (!!input.organizationId === !!input.personId) throw new ContextError('INVALID_CONTEXT_TARGET');
  return input.organizationId ? { organizationId: input.organizationId } : { personId: input.personId! };
}
