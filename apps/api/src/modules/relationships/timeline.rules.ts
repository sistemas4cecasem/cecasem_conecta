import { isUUID } from 'class-validator';
import type { TimelineItem } from './timeline.dto';
export type TimelineSource = 'AMENDMENT' | 'COMMUNICATION' | 'EVENT' | 'FILE' | 'NOTE';
export type TimelinePosition = { occurredAt: Date; registeredAt: Date; source: TimelineSource; id: string };
export class TimelineError extends Error {
  constructor(public readonly code: 'INVALID_TIMELINE_CURSOR' | 'INVALID_INTERNAL_NOTE') { super(code); }
}
export function timelineSource(kind: TimelineItem['kind']): TimelineSource {
  if (kind === 'FILES_ATTACHED') return 'FILE';
  if (['COMMUNICATION_CORRECTED', 'COMMUNICATION_ANNOTATED', 'COMMUNICATION_INVALIDATED'].includes(kind)) return 'AMENDMENT';
  return kind === 'INTERNAL_NOTE' ? 'NOTE' : kind === 'SENT_COMMUNICATION' || kind === 'RECEIVED_COMMUNICATION' ? 'COMMUNICATION' : 'EVENT';
}
export function compareTimeline(a: TimelineItem, b: TimelineItem): number {
  return a.occurredAt.localeCompare(b.occurredAt) || a.registeredAt.localeCompare(b.registeredAt)
    || timelineSource(a.kind).localeCompare(timelineSource(b.kind)) || a.id.localeCompare(b.id);
}
export function encodeTimelineCursor(processId: string, item: TimelineItem): string {
  return Buffer.from(JSON.stringify({ processId, occurredAt: item.occurredAt, registeredAt: item.registeredAt, source: timelineSource(item.kind), id: item.id })).toString('base64url');
}
export function decodeTimelineCursor(processId: string, value?: string): TimelinePosition | undefined {
  if (value === undefined) return undefined;
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length > 1024) throw new Error();
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString());
    if (!parsed || typeof parsed !== 'object' || !('processId' in parsed) || parsed.processId !== processId
      || !('id' in parsed) || typeof parsed.id !== 'string' || !isUUID(parsed.id)
      || !('source' in parsed) || typeof parsed.source !== 'string' || !['AMENDMENT', 'COMMUNICATION', 'EVENT', 'FILE', 'NOTE'].includes(parsed.source)
      || !('occurredAt' in parsed) || typeof parsed.occurredAt !== 'string' || new Date(parsed.occurredAt).toISOString() !== parsed.occurredAt
      || !('registeredAt' in parsed) || typeof parsed.registeredAt !== 'string' || new Date(parsed.registeredAt).toISOString() !== parsed.registeredAt) throw new Error();
    return { id: parsed.id, source: parsed.source as TimelineSource, occurredAt: new Date(parsed.occurredAt), registeredAt: new Date(parsed.registeredAt) };
  } catch { throw new TimelineError('INVALID_TIMELINE_CURSOR'); }
}
/** Keyset por fecha real, registro, fuente e ID; cada propietario consulta solo su fuente. */
export function timelineSeek(after: TimelinePosition | undefined, source: TimelineSource, occurredField: 'occurredAt' | 'createdAt') {
  if (!after) return {};
  if (occurredField === 'createdAt') {
    const sameDate = { createdAt: after.occurredAt };
    const samePosition = source > after.source ? [sameDate] : source === after.source ? [{ ...sameDate, id: { gt: after.id } }] : [];
    return { OR: [{ createdAt: { gt: after.occurredAt } }, ...(+after.occurredAt > +after.registeredAt ? [sameDate] : +after.occurredAt === +after.registeredAt ? samePosition : [])] };
  }
  const sameDates = { [occurredField]: after.occurredAt, createdAt: after.registeredAt };
  return { OR: [
    { [occurredField]: { gt: after.occurredAt } },
    { [occurredField]: after.occurredAt, createdAt: { gt: after.registeredAt } },
    ...(source > after.source ? [sameDates] : source === after.source ? [{ ...sameDates, id: { gt: after.id } }] : []),
  ] };
}
export function internalNoteBody(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 5000 || value.includes('\0')) throw new TimelineError('INVALID_INTERNAL_NOTE');
  return value;
}
