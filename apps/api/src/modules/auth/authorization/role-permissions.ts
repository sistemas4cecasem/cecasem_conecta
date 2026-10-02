import { UserRole } from '../../../generated/prisma/client';
import { isPermission, PERMISSIONS, type Permission } from './permission';

const ROLE_PERMISSIONS: Readonly<Record<UserRole, readonly Permission[]>> = Object.freeze({
  [UserRole.ADMINISTRATOR]: Object.freeze([PERMISSIONS.FIRST_ACCESS_ISSUE, PERMISSIONS.PASSWORD_RESET_ISSUE]),
  [UserRole.BOARD]: Object.freeze([]),
  [UserRole.RESEARCH]: Object.freeze([]),
  [UserRole.PLANNING]: Object.freeze([]),
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
