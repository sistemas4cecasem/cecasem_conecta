import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from '../session.guard';
import { isPermission, REQUIRED_PERMISSIONS_KEY } from './permission';
import { getRolePermissions, hasAllPermissions } from './role-permissions';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required: unknown = this.reflector.get(REQUIRED_PERMISSIONS_KEY, context.getHandler());
    const user = context.switchToHttp().getRequest<Partial<AuthenticatedRequest>>().authenticatedUser;
    if (!Array.isArray(required) || required.length === 0 || !Array.from(required).every(isPermission) || !user) {
      throw new InternalServerErrorException('Configuración de autorización inválida.');
    }
    if (!hasAllPermissions(getRolePermissions(user.role), required)) throw new ForbiddenException('No tiene los permisos necesarios.');
    return true;
  }
}
