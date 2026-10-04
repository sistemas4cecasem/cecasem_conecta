import { isEmail, isISO8601, isUUID } from 'class-validator';
import { createHash } from 'node:crypto';
export class CommunicationError extends Error {
  constructor(public readonly code: 'INVALID_COMMUNICATION' | 'FORBIDDEN' | 'MAILBOX_UNAVAILABLE' | 'PROCESS_CLOSED' | 'COMMUNICATION_NOT_FOUND' | 'REQUEST_CONFLICT') { super(code); }
}
export interface SentOriginal { emailAccountId: string; to: string[]; cc: string[]; bcc: string[]; subject: string; body: string; sentAt: string }
export interface ReceivedOriginal { sender: string; to: string[]; cc: string[]; bcc: string[]; subject: string; body: string; receivedAt: string }
function validateContent(input: Pick<SentOriginal, 'to' | 'cc' | 'bcc' | 'subject' | 'body'>) {
  if (!Array.isArray(input.to) || input.to.length < 1 || !Array.isArray(input.cc) || !Array.isArray(input.bcc)) throw new CommunicationError('INVALID_COMMUNICATION');
  const addresses = [...input.to, ...input.cc, ...input.bcc];
  if (addresses.length > 100 || addresses.some(address => typeof address !== 'string' || address !== address.trim() || address.length > 254 || !isEmail(address))) throw new CommunicationError('INVALID_COMMUNICATION');
  if (typeof input.subject !== 'string' || !input.subject.trim() || input.subject.length > 998 || /[\r\n\0]/.test(input.subject)
    || typeof input.body !== 'string' || !input.body.trim() || input.body.length > 200000 || input.body.includes('\0')) throw new CommunicationError('INVALID_COMMUNICATION');
}
function validateDate(value: string, now: Date) {
  if (typeof value !== 'string' || !isISO8601(value, { strict: true, strictSeparator: true }) || !/(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    || !Number.isFinite(+new Date(value)) || +new Date(value) > +now) throw new CommunicationError('INVALID_COMMUNICATION');
}
export function validateSentOriginal(input: SentOriginal, now = new Date()): SentOriginal {
  if (!isUUID(input.emailAccountId)) throw new CommunicationError('INVALID_COMMUNICATION');
  validateContent(input); validateDate(input.sentAt, now);
  return input;
}
export function validateReceivedOriginal(input: ReceivedOriginal, now = new Date()): ReceivedOriginal {
  if (typeof input.sender !== 'string' || input.sender !== input.sender.trim() || input.sender.length > 254 || !isEmail(input.sender)) throw new CommunicationError('INVALID_COMMUNICATION');
  validateContent(input); validateDate(input.receivedAt, now); return input;
}
export function receivedRequestFingerprint(processId: string, input: ReceivedOriginal): string {
  return createHash('sha256').update(JSON.stringify(['RECEIVED', processId.toLowerCase(), input.sender, input.to, input.cc, input.bcc, input.subject, input.body, new Date(input.receivedAt).toISOString()])).digest('hex');
}
export function requestFingerprint(processId: string, input: SentOriginal): string {
  return createHash('sha256').update(JSON.stringify([processId.toLowerCase(), input.emailAccountId.toLowerCase(), input.to, input.cc, input.bcc, input.subject, input.body, new Date(input.sentAt).toISOString()])).digest('hex');
}
