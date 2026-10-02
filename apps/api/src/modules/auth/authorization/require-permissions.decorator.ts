import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../session.guard';
import { isPermission, type Permission, REQUIRED_PERMISSIONS_KEY } from './permission';
import { PermissionsGuard } from './permissions.guard';

export function RequirePermissions(...permissions: [Permission, ...Permission[]]): MethodDecorator {
  if (permissions.length === 0 || !permissions.every(isPermission)) {
    throw new Error('RequirePermissions requiere al menos una capability válida.');
  }
  return applyDecorators(
    SetMetadata(REQUIRED_PERMISSIONS_KEY, Object.freeze([...permissions])),
    UseGuards(SessionGuard, PermissionsGuard),
  );
}
