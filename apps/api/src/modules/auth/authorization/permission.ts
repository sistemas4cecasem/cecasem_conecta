export const PERMISSIONS = {
  COMMUNICATION_AMEND: 'communications.amend',
  COMMUNICATION_INVALIDATE: 'communications.invalidate',
  INTERNAL_NOTE_CREATE: 'relationships.note.create',
  RECEIVED_COMMUNICATION_CREATE: 'communications.received.create',
  COMMUNICATION_READ: 'communications.read',
  SENT_COMMUNICATION_CREATE: 'communications.sent.create',
  RESTRICTION_READ: 'relationships.restriction.read',
  RESTRICTION_CREATE: 'relationships.restriction.create',
  RESTRICTION_LIFT: 'relationships.restriction.lift',
  PROCESS_READ: 'relationships.process.read',
  PROCESS_CREATE: 'relationships.process.create',
  PROCESS_STATE_CHANGE: 'relationships.process.state.change',
  PROCESS_CLOSE: 'relationships.process.close',
  PROCESS_REOPEN: 'relationships.process.reopen',
  INTENT_READ: 'relationships.intent.read',
  INTENT_CREATE: 'relationships.intent.create',
  INTENT_CANCEL: 'relationships.intent.cancel',
  INTENT_CONVERT: 'relationships.intent.convert',
  DIRECTORY_DUPLICATES_DISMISS: 'directory.duplicates.dismiss',
  DIRECTORY_DUPLICATES_MANAGE: 'directory.duplicates.manage',
  DIRECTORY_VERIFY: 'directory.verify',
  SETTINGS_VERIFICATION_UPDATE: 'settings.verification.update',
  DIRECTORY_READ: 'directory.read',
  DIRECTORY_WRITE: 'directory.write',
  DIRECTORY_HISTORY_READ: 'directory.history.read',
  DIRECTORY_STATUS_UPDATE: 'directory.status.update',
  FIRST_ACCESS_ISSUE: 'auth.first_access.issue',
  PASSWORD_RESET_ISSUE: 'auth.password_reset.issue',
  USERS_READ: 'users.read',
  USERS_DEACTIVATED_READ: 'users.deactivated.read',
  USERS_CREATE: 'users.create',
  USERS_ROLE_UPDATE: 'users.role.update',
  USERS_STATUS_UPDATE: 'users.status.update',
  USERS_MAILBOXES_MANAGE: 'users.mailboxes.manage',
} as const;

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];
export const REQUIRED_PERMISSIONS_KEY = 'cecasem:required-permissions';

export function isPermission(value: unknown): value is Permission {
  return typeof value === 'string' && Object.values(PERMISSIONS).some(permission => permission === value);
}
