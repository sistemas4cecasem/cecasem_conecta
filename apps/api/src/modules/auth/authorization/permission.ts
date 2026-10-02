export const PERMISSIONS = {
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
