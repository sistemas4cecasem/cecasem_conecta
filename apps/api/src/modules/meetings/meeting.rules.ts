import { createHash } from 'node:crypto';
import { isUUID } from 'class-validator';
import type { MeetingModality, MeetingStatus } from '../../generated/prisma/client';
export type MeetingErrorCode = 'INVALID_MEETING' | 'MEETING_NOT_FOUND' | 'INVALID_MEETING_ORIGIN' | 'INVALID_TIMEZONE' | 'NONEXISTENT_LOCAL_TIME' | 'AMBIGUOUS_LOCAL_TIME' | 'MEETING_REFERENCE_UNAVAILABLE' | 'DUPLICATE_PARTICIPANT' | 'MEETING_STATE_CONFLICT' | 'VERSION_CONFLICT' | 'REQUEST_CONFLICT' | 'FORBIDDEN';
export class MeetingError extends Error { constructor(public readonly code: MeetingErrorCode) { super(code); } }
export function meetingText(value: unknown, maximum: number, required = false): string | null {
  if (value == null && !required) return null;
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || value.includes('\0')) throw new MeetingError('INVALID_MEETING');
  return value.trim();
}
export function meetingId(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== 'string' || !isUUID(value)) throw new MeetingError('INVALID_MEETING'); return value.toLowerCase();
}
function formatter(zone: string) {
  if (typeof zone !== 'string' || zone.length > 100 || !/^(?:UTC|[A-Za-z_]+(?:\/[A-Za-z0-9_+.-]+)+)$/.test(zone)) throw new MeetingError('INVALID_TIMEZONE');
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }); }
  catch { throw new MeetingError('INVALID_TIMEZONE'); }
}
function localEpoch(format: Intl.DateTimeFormat, instant: number) {
  const parts = Object.fromEntries(format.formatToParts(instant).map(p => [p.type, p.value]));
  return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
}
/** Resuelve hora de pared con Intl/IANA. Nunca utiliza la zona del servidor. */
export function meetingInstant(local: string, timezone: string, disambiguation?: 'earlier' | 'later') {
  if (typeof local !== 'string' || !/^[1-9]\d{3}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local) || (disambiguation != null && !['earlier', 'later'].includes(disambiguation))) throw new MeetingError('INVALID_MEETING');
  const nominal = Date.parse(local + ':00Z');
  if (!Number.isFinite(nominal) || new Date(nominal).toISOString().slice(0, 16) !== local) throw new MeetingError('INVALID_MEETING');
  const format = formatter(timezone), offsets = new Set<number>();
  // Ambos lados de las transiciones, incluidos desplazamientos de 30 minutos y saltos de un día.
  for (let hours = -36; hours <= 36; hours += 6) { const instant = nominal + hours * 3600000; offsets.add(localEpoch(format, instant) - instant); }
  const matches = [...offsets].map(offset => nominal - offset).filter(instant => localEpoch(format, instant) === nominal).sort((a, b) => a - b);
  if (!matches.length) throw new MeetingError('NONEXISTENT_LOCAL_TIME');
  if (matches.length > 1 && !disambiguation) throw new MeetingError('AMBIGUOUS_LOCAL_TIME');
  return new Date(disambiguation === 'later' ? matches[matches.length - 1] : matches[0]);
}
export function meetingLocal(instant: Date, timezone: string) { return new Date(localEpoch(formatter(timezone), +instant)).toISOString().slice(0, 16); }
export interface PlanningInput { scheduledLocal: string; timezone: string; disambiguation?: 'earlier' | 'later'; modality: MeetingModality; meetingUrl?: string | null; location?: string | null; purpose: string }
export function meetingPlanning(input: PlanningInput) {
  const scheduledAt = meetingInstant(input.scheduledLocal, input.timezone, input.disambiguation), timezone = input.timezone;
  if (!['ONLINE', 'IN_PERSON', 'HYBRID'].includes(input.modality)) throw new MeetingError('INVALID_MEETING');
  const meetingUrl = meetingText(input.meetingUrl, 2048), location = meetingText(input.location, 500), purpose = meetingText(input.purpose, 5000, true)!;
  if ((input.modality === 'ONLINE' && location) || (input.modality === 'IN_PERSON' && meetingUrl)) throw new MeetingError('INVALID_MEETING');
  if (meetingUrl) { try { const url = new URL(meetingUrl); if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error(); } catch { throw new MeetingError('INVALID_MEETING'); } }
  return { scheduledAt, timezone, modality: input.modality, meetingUrl, location, purpose };
}
export function meetingOrigin(input: { processId?: string | null; opportunityId?: string | null }) {
  const processId = meetingId(input.processId), opportunityId = meetingId(input.opportunityId);
  if (!processId && !opportunityId) throw new MeetingError('INVALID_MEETING_ORIGIN'); return { processId, opportunityId };
}
export function meetingVersion(version: number) { if (!Number.isInteger(version) || version < 1) throw new MeetingError('INVALID_MEETING'); }
export function meetingFingerprint(value: unknown, key: string) { if (!isUUID(key)) throw new MeetingError('INVALID_MEETING'); return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
export function requireFuture(status: MeetingStatus, scheduledAt: Date, now: Date) { if (status !== 'SCHEDULED' || +scheduledAt <= +now) throw new MeetingError('MEETING_STATE_CONFLICT'); }
export function requireResults(status: MeetingStatus) { if (status !== 'COMPLETED') throw new MeetingError('MEETING_STATE_CONFLICT'); }
export function canAttachMeeting(status: MeetingStatus) { return status !== 'CANCELLED'; }
export interface ParticipantInput { userId?: string | null; personId?: string | null; nameSnapshot?: string | null; organizationSnapshot?: string | null; roleSnapshot?: string | null }
export function meetingParticipant(input: ParticipantInput) {
  const userId = meetingId(input.userId), personId = meetingId(input.personId), nameSnapshot = meetingText(input.nameSnapshot, 400);
  if (userId && personId || !userId && !personId && !nameSnapshot) throw new MeetingError('INVALID_MEETING');
  return { userId, personId, nameSnapshot, organizationSnapshot: meetingText(input.organizationSnapshot, 300), roleSnapshot: meetingText(input.roleSnapshot, 300) };
}
