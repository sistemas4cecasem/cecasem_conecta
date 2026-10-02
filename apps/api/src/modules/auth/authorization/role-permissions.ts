import { UserRole } from '../../../generated/prisma/client';
import { isPermission, PERMISSIONS, type Permission } from './permission';

const DIRECTORY_PERMISSIONS = [PERMISSIONS.DIRECTORY_READ, PERMISSIONS.DIRECTORY_WRITE, PERMISSIONS.DIRECTORY_HISTORY_READ] as const;

const ROLE_PERMISSIONS: Readonly<Record<UserRole, readonly Permission[]>> = Object.freeze({
  [UserRole.ADMINISTRATOR]: Object.freeze([PERMISSIONS.FIRST_ACCESS_ISSUE, PERMISSIONS.PASSWORD_RESET_ISSUE,
    PERMISSIONS.USERS_READ, PERMISSIONS.USERS_DEACTIVATED_READ, PERMISSIONS.USERS_CREATE,
    PERMISSIONS.USERS_ROLE_UPDATE, PERMISSIONS.USERS_STATUS_UPDATE, PERMISSIONS.USERS_MAILBOXES_MANAGE,
    ...DIRECTORY_PERMISSIONS, PERMISSIONS.DIRECTORY_STATUS_UPDATE]),
  [UserRole.BOARD]: Object.freeze([PERMISSIONS.USERS_READ, ...DIRECTORY_PERMISSIONS]),
  [UserRole.RESEARCH]: Object.freeze([...DIRECTORY_PERMISSIONS]),
  [UserRole.PLANNING]: Object.freeze([...DIRECTORY_PERMISSIONS]),
});
const NO_PERMISSIONS: readonly Permission[] = Object.freeze([]);

export function getRolePermissions(role: string): readonly Permission[] {
  return Object.hasOwn(ROLE_PERMISSIONS, role) ? ROLE_PERMISSIONS[role as UserRole] : NO_PERMISSIONS;
}

export function hasPermission(role: string, permission: string): boolean {
  return hasAllPermissions(getRolePermissions(role), [permission]);
}

export function hasAllPermissions(granted: readonly Permission[], required: readonly string[]): boolean {
  return required.length > 0 && Array.from(required).every(permission => isPermission(permission) && granted.includes(permission));
}
