import type { MeetingEventType, NotificationType, OpportunityEventType, Prisma, UserRole, ProcessEventType, ProcessState, ProcessResult } from '../../generated/prisma/client';
import { hasPermission } from '../auth/authorization/role-permissions';
import { PERMISSIONS } from '../auth/authorization/permission';

export const MATERIAL_MEETING_FIELDS = ['scheduledAt', 'timezone', 'modality', 'meetingUrl', 'location'] as const;
export function materialMeetingChange(changes: Prisma.JsonValue): boolean {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) return false;
  const { previous, next } = changes;
  if (!previous || !next || typeof previous !== 'object' || typeof next !== 'object' || Array.isArray(previous) || Array.isArray(next)) return false;
  return MATERIAL_MEETING_FIELDS.some(field => Object.hasOwn(previous, field) && Object.hasOwn(next, field) && previous[field] !== next[field]);
}
export function opportunityNotificationType(kind: OpportunityEventType): NotificationType | null {
  return kind === 'CREATED' ? 'OPPORTUNITY_CREATED' : kind === 'DISCARDED' ? 'OPPORTUNITY_DISCARDED' : kind === 'FINISHED' ? 'OPPORTUNITY_FINISHED' : null;
}
export function meetingNotificationType(kind: MeetingEventType, changes: Prisma.JsonValue, internalUserId: string | null): NotificationType | null {
  switch (kind) {
    case 'CREATED': return 'MEETING_CREATED';
    case 'CANCELLED': return 'MEETING_CANCELLED';
    case 'COMPLETED': return 'MEETING_COMPLETED';
    case 'PARTICIPANT_ADDED': return internalUserId ? 'MEETING_PARTICIPANT_ADDED' : null;
    case 'UPDATED': return materialMeetingChange(changes) ? 'MEETING_RESCHEDULED' : null;
    default: return null;
  }
}
export function canReceiveMeeting(role: UserRole, context: { processId: string | null; opportunityId: string | null }): boolean {
  return hasPermission(role, PERMISSIONS.NOTIFICATION_READ) && hasPermission(role, PERMISSIONS.MEETING_READ) &&
    (!context.processId || hasPermission(role, PERMISSIONS.PROCESS_READ)) &&
    (!context.opportunityId || hasPermission(role, PERMISSIONS.OPPORTUNITY_READ));
}
export function processNotificationType(kind: ProcessEventType, state: ProcessState, result: ProcessResult | null): NotificationType | null {
  return kind === 'CLOSED' && state === 'CLOSED' && result === 'ACHIEVED' ? 'PROCESS_ACHIEVED' : null;
}
export function canReceiveProcess(role: UserRole): boolean {
  return hasPermission(role, PERMISSIONS.NOTIFICATION_READ) && hasPermission(role, PERMISSIONS.PROCESS_READ);
}
/** P0 conserva al actor institucional; P1 evita avisos por la propia acción. */
export function excludeNotificationActor(type: NotificationType): boolean { return type !== 'OPPORTUNITY_CREATED'; }
