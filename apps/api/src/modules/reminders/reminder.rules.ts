import { hasPermission } from '../auth/authorization/role-permissions';
import { PERMISSIONS } from '../auth/authorization/permission';
import type { InactivityKind } from '../relationships/inactivity-sources.service';

export const REMINDER_INTERVAL_MAX = 36500; // Límite técnico: 100 años, no regla de negocio.
export const REMINDER_POLL_MS = 60 * 60 * 1000;
export function reminderDueAt(anchor: Date, intervalDays: number): Date {
  if (!Number.isInteger(intervalDays) || intervalDays < 1 || intervalDays > REMINDER_INTERVAL_MAX || !Number.isFinite(+anchor)) throw new Error('Intervalo de recordatorio inválido.');
  return new Date(+anchor + intervalDays * 86400000);
}
export function reminderType(kind: InactivityKind) {
  return kind === 'intent' ? 'INTENT_INACTIVITY_REMINDER' as const : 'PROCESS_INACTIVITY_REMINDER' as const;
}
export function canReceiveReminder(role: string, kind: InactivityKind) {
  return hasPermission(role, PERMISSIONS.NOTIFICATION_READ) && hasPermission(role, kind === 'intent' ? PERMISSIONS.INTENT_READ : PERMISSIONS.PROCESS_READ)
    && hasPermission(role, kind === 'intent' ? PERMISSIONS.INTENT_CONVERT : PERMISSIONS.PROCESS_STATE_CHANGE);
}
