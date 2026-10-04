import { createHash } from 'node:crypto';
import { isISO8601, isUUID } from 'class-validator';
import { OpportunityStatus } from '../../generated/prisma/client';
export type OpportunityErrorCode = 'INVALID_OPPORTUNITY' | 'INVALID_OPPORTUNITY_ORIGIN' | 'OPPORTUNITY_ORGANIZATION_UNAVAILABLE' | 'OPPORTUNITY_NOT_FOUND' | 'INVALID_OPPORTUNITY_TRANSITION' | 'VERSION_CONFLICT' | 'REQUEST_CONFLICT' | 'FORBIDDEN' | 'INVALID_OPPORTUNITY_CURSOR';
export class OpportunityError extends Error {
  constructor(public readonly code: OpportunityErrorCode) { super(code); }
}
export const OPPORTUNITY_TRANSITIONS: Readonly<Record<OpportunityStatus, readonly OpportunityStatus[]>> = {
  PENDING_REVIEW: ['PREPARING', 'DISCARDED'], PREPARING: ['SUBMITTED', 'DISCARDED'], SUBMITTED: ['FINISHED'], DISCARDED: [], FINISHED: [],
};
export function requireOpportunityTransition(previous: OpportunityStatus, next: OpportunityStatus) {
  if (!OPPORTUNITY_TRANSITIONS[previous]?.includes(next))
    throw new OpportunityError('INVALID_OPPORTUNITY_TRANSITION');
}
export function opportunityVersion(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value >= 2147483647)
    throw new OpportunityError('INVALID_OPPORTUNITY');
  return value;
}
export function opportunityText(value: unknown, max: number, required = false): string | null {
  if (value === undefined || value === null) {
    if (required)
      throw new OpportunityError('INVALID_OPPORTUNITY');
    return null;
  }
  if (typeof value !== 'string' || value.includes('\0'))
    throw new OpportunityError('INVALID_OPPORTUNITY');
  const text = value.trim();
  if (text.length > max || (required && !text))
    throw new OpportunityError('INVALID_OPPORTUNITY');
  return text || null;
}
export function opportunityDeadline(value: unknown): string | null {
  if (value === undefined || value === null || value === '')
    return null;
  if (typeof value !== 'string' || (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) || !isISO8601(value, { strict: true }) || !Number.isFinite(+new Date(value)) || new Date(value).toISOString().slice(0, 10) !== value)
    throw new OpportunityError('INVALID_OPPORTUNITY');
  return value;
}
export function opportunityOrigin(input: {
  processId?: unknown;
  communicationId?: unknown;
}) {
  const id = (value: unknown) => { if (value === undefined || value === null)
    return null; if (typeof value !== 'string' || !isUUID(value))
    throw new OpportunityError('INVALID_OPPORTUNITY_ORIGIN'); return value.toLowerCase(); };
  return { processId: id(input.processId), communicationId: id(input.communicationId) };
}
export function opportunityOrganizations(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100 || value.some(id => typeof id !== 'string' || !isUUID(id)))
    throw new OpportunityError('INVALID_OPPORTUNITY');
  const ids = (value as string[]).map(id => id.toLowerCase()).sort();
  if (new Set(ids).size !== ids.length)
    throw new OpportunityError('INVALID_OPPORTUNITY');
  return ids;
}
export interface OpportunityDescriptions {
  name: string;
  description: string | null;
  url: string | null;
  deadline: string | null;
  requirements: string | null;
  organizationIds: string[];
}
export function opportunityDescriptions(input: Partial<Record<keyof OpportunityDescriptions, unknown>>, previous?: OpportunityDescriptions): OpportunityDescriptions {
  const value = (key: keyof OpportunityDescriptions) => input[key] === undefined ? previous?.[key] : input[key];
  const name = opportunityText(value('name'), 300, true)!;
  if ([...name].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127))
    throw new OpportunityError('INVALID_OPPORTUNITY');
  let url = opportunityText(value('url'), 2048);
  if (url) {
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password)
        throw new Error();
      url = parsed.href;
      if (url.length > 2048) throw new Error();
    }
    catch {
      throw new OpportunityError('INVALID_OPPORTUNITY');
    }
  }
  return { name, description: opportunityText(value('description'), 10000), url, deadline: opportunityDeadline(value('deadline')), requirements: opportunityText(value('requirements'), 10000), organizationIds: opportunityOrganizations(value('organizationIds')) };
}
export function opportunityFingerprint(descriptions: OpportunityDescriptions, origin: ReturnType<typeof opportunityOrigin>) { return createHash('sha256').update(JSON.stringify([descriptions, origin])).digest('hex'); }
export type OpportunityHistoryCursor = {
  createdAt: Date;
  source: 'EVENT' | 'FILE';
  id: string;
};
export function decodeOpportunityCursor(value?: string): OpportunityHistoryCursor | undefined {
  if (value === undefined)
    return undefined;
  try {
    if (!/^[a-zA-Z0-9_-]+$/.test(value) || value.length > 1024)
      throw new Error();
    const row: unknown = JSON.parse(Buffer.from(value, 'base64url').toString());
    if (!row || typeof row !== 'object' || !('createdAt' in row) || typeof row.createdAt !== 'string' || new Date(row.createdAt).toISOString() !== row.createdAt || !('id' in row) || typeof row.id !== 'string' || !isUUID(row.id) || !('source' in row) || !['EVENT', 'FILE'].includes(String(row.source)))
      throw new Error();
    return { createdAt: new Date(row.createdAt), id: row.id, source: row.source as 'EVENT' | 'FILE' };
  }
  catch {
    throw new OpportunityError('INVALID_OPPORTUNITY_CURSOR');
  }
}
export function opportunityHistorySeek(after: OpportunityHistoryCursor | undefined, source: 'EVENT' | 'FILE') {
  if (!after)
    return {};
  return { OR: [{ createdAt: { gt: after.createdAt } }, ...(source > after.source ? [{ createdAt: after.createdAt }] : source === after.source ? [{ createdAt: after.createdAt, id: { gt: after.id } }] : [])] };
}
