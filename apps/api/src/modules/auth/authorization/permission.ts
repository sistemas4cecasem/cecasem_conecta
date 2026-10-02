export const PERMISSIONS = {
  FIRST_ACCESS_ISSUE: 'auth.first_access.issue',
  PASSWORD_RESET_ISSUE: 'auth.password_reset.issue',
} as const;

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];
export const REQUIRED_PERMISSIONS_KEY = 'cecasem:required-permissions';

export function isPermission(value: unknown): value is Permission {
  return typeof value === 'string' && Object.values(PERMISSIONS).some(permission => permission === value);
}
