import { isUUID } from 'class-validator';
import { createHash } from 'node:crypto';
import type { UserRole } from '../../generated/prisma/client';
export class AmendmentError extends Error {
  constructor(public readonly code: 'INVALID_AMENDMENT' | 'ALREADY_INVALIDATED' | 'FORBIDDEN' | 'REQUEST_CONFLICT' | 'COMMUNICATION_NOT_FOUND') { super(code); }
}
export type AmendmentType = 'CORRECTION' | 'ANNOTATION' | 'INVALIDATION';
export function canInvalidate(role: UserRole, actorId: string, registeredByUserId: string): boolean {
  return role === 'ADMINISTRATOR' || role === 'BOARD' || (['RESEARCH', 'PLANNING'].includes(role) && actorId === registeredByUserId);
}
export function amendmentContent(type: AmendmentType, content: unknown, requestKey: string): string {
  if (!['CORRECTION', 'ANNOTATION', 'INVALIDATION'].includes(type) || typeof content !== 'string' || !content.trim() || content.length > 5000 || content.includes('\0') || !isUUID(requestKey)) throw new AmendmentError('INVALID_AMENDMENT');
  return content;
}
export function amendmentFingerprint(id: string, type: AmendmentType, content: string): string {
  return createHash('sha256').update(JSON.stringify([id.toLowerCase(), type, content])).digest('hex');
}
export function assertAmendmentAllowed(type: AmendmentType, validity: string) {
  if (validity === 'INVALIDATED' && type !== 'ANNOTATION') throw new AmendmentError('ALREADY_INVALIDATED');
}
