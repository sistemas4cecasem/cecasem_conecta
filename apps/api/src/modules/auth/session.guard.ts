import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException, createParamDecorator } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AuthenticatedUserDto, publicIdentity } from './auth.dto';
import { readSessionToken } from './session-cookie';
import { SessionsService } from './sessions.service';
import { ALLOW_FORCED_PASSWORD_CHANGE } from './forced-password-change.decorator';

export interface AuthenticatedRequest extends Request { authenticatedUser: AuthenticatedUserDto }

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly sessions: SessionsService, private readonly reflector: Reflector = new Reflector()) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = await this.sessions.findIdentity(readSessionToken(request));
    if (!user) throw new UnauthorizedException('Se requiere autenticación.');
    const canChangePassword = this.reflector.getAllAndOverride<boolean>(ALLOW_FORCED_PASSWORD_CHANGE,
      [context.getHandler(), context.getClass()]) ?? false;
    if (user.mustChangePassword && !canChangePassword) throw new ForbiddenException('Debes cambiar tu contraseña antes de continuar.');
    request.authenticatedUser = publicIdentity(user);
    return true;
  }
}

export const CurrentUser = createParamDecorator((_value: unknown, context: ExecutionContext): AuthenticatedUserDto =>
  context.switchToHttp().getRequest<AuthenticatedRequest>().authenticatedUser);
