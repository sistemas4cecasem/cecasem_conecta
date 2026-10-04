import { createHash } from 'node:crypto';
import { isUUID } from 'class-validator';
import { ContactType } from '../../generated/prisma/client';
import { contactFields } from '../directory/contacts.rules';
export type ReferralErrorCode = 'INVALID_REFERRAL' | 'REFERRAL_NOT_FOUND' | 'REFERRAL_REFERENCE_UNAVAILABLE' | 'REFERRAL_SOURCE_INVALIDATED' | 'REQUEST_CONFLICT' | 'FORBIDDEN';
export class ReferralError extends Error {
  constructor(public readonly code: ReferralErrorCode) { super(code); }
}
export interface ReferralInput {
  recommendedName?: string | null; recommendedRole?: string | null; organizationNameSnapshot?: string | null;
  mediumType?: ContactType | null; mediumValue?: string | null; notes?: string | null;
  personId?: string | null; organizationId?: string | null; contactMethodId?: string | null;
}
function text(value: unknown, max: number): string | null {
  if (value == null) return null;
  if (typeof value !== 'string' || value.length > max || !value.trim() || value.includes('\0')) throw new ReferralError('INVALID_REFERRAL');
  return value.trim();
}
function reference(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== 'string' || !isUUID(value)) throw new ReferralError('INVALID_REFERRAL');
  return value.toLowerCase();
}
export function referralFields(input: ReferralInput) {
  const value = { recommendedName: text(input.recommendedName, 300), recommendedRole: text(input.recommendedRole, 300),
    organizationNameSnapshot: text(input.organizationNameSnapshot, 300), notes: text(input.notes, 5000),
    personId: reference(input.personId), organizationId: reference(input.organizationId), contactMethodId: reference(input.contactMethodId),
    mediumType: input.mediumType ?? null, mediumValue: text(input.mediumValue, 2048) };
  if ((value.mediumType === null) !== (value.mediumValue === null) || (value.contactMethodId && !value.mediumValue)) throw new ReferralError('INVALID_REFERRAL');
  if (value.mediumType && value.mediumValue) {
    try { contactFields({ type: value.mediumType, value: value.mediumValue, label: value.mediumType === 'OTHER' ? value.mediumValue.slice(0, 150) : null }); }
    catch { throw new ReferralError('INVALID_REFERRAL'); }
  }
  if (!value.personId && !value.recommendedName && !value.organizationId && !value.organizationNameSnapshot && !value.mediumValue) throw new ReferralError('INVALID_REFERRAL');
  return value;
}
export function referralFingerprint(sourceCommunicationId: string, fields: ReturnType<typeof referralFields>, key: string) {
  if (!isUUID(sourceCommunicationId) || !isUUID(key)) throw new ReferralError('INVALID_REFERRAL');
  return createHash('sha256').update(JSON.stringify({ sourceCommunicationId: sourceCommunicationId.toLowerCase(), ...fields })).digest('hex');
}
