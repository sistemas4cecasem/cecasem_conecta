import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, createParamDecorator } from '@nestjs/common';
import { Request } from 'express';
import { AuthenticatedUserDto, publicIdentity } from './auth.dto';
import { readSessionToken } from './session-cookie';
import { SessionsService } from './sessions.service';

export interface AuthenticatedRequest extends Request { authenticatedUser: AuthenticatedUserDto }

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly sessions: SessionsService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = await this.sessions.findIdentity(readSessionToken(request));
    if (!user) throw new UnauthorizedException('Se requiere autenticación.');
    request.authenticatedUser = publicIdentity(user);
    return true;
  }
}

export const CurrentUser = createParamDecorator((_value: unknown, context: ExecutionContext): AuthenticatedUserDto =>
  context.switchToHttp().getRequest<AuthenticatedRequest>().authenticatedUser);
