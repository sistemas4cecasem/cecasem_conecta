import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppEnvironment } from '../../config/environment';
import { PERMISSIONS } from './authorization/permission';
import { hasPermission } from './authorization/role-permissions';
import { UsersService } from '../users/users.service';
import { AuthenticatedUserDto } from './auth.dto';
import { FirstAccessEmissionError, FirstAccessSessionConflictError, InvalidFirstAccessError } from './first-access.errors';
import { FirstAccessTokensService, firstAccessIsValid } from './first-access-tokens.service';
import { createOpaqueToken, hashOpaqueToken } from './opaque-token';
import { PasswordService } from './password.service';
import { SessionsService } from './sessions.service';

@Injectable()
export class FirstAccessService {
  constructor(private readonly users: UsersService, private readonly tokens: FirstAccessTokensService,
    private readonly passwords: PasswordService, private readonly sessions: SessionsService,
    private readonly config: ConfigService<AppEnvironment, true>) {}

  // Conservado para compatibilidad interna de credenciales pendientes antiguas; la API de administración ya no lo expone.
  async issue(userId: string, actor: AuthenticatedUserDto): Promise<{ token: string; expiresAt: Date }> {
    if (!hasPermission(actor.role, PERMISSIONS.FIRST_ACCESS_ISSUE)) throw new FirstAccessEmissionError('FORBIDDEN');
    return this.users.withLockedCredentials(userId, async (user, tx) => {
      const issuer = await this.users.findIdentityById(actor.id, tx);
      if (!issuer?.isActive || !hasPermission(issuer.role, PERMISSIONS.FIRST_ACCESS_ISSUE)) throw new FirstAccessEmissionError('FORBIDDEN');
      if (!user) throw new FirstAccessEmissionError('NOT_FOUND');
      if (!user.isActive) throw new FirstAccessEmissionError('INACTIVE');
      if (user.passwordHash !== null) throw new FirstAccessEmissionError('PASSWORD_EXISTS');
      await this.tokens.revokePendingForUser(userId, tx);
      const token = createOpaqueToken(); const createdAt = new Date();
      const expiresAt = new Date(createdAt.getTime() + this.config.get('FIRST_ACCESS_TOKEN_TTL_SECONDS', { infer: true }) * 1000);
      await tx.firstAccessToken.create({ data: { userId, createdByUserId: actor.id, tokenHash: hashOpaqueToken(token)!, createdAt, expiresAt } });
      return { token, expiresAt };
    }, { actorId: actor.id });
  }

  async consume(token: string, password: string, browserToken?: string): Promise<void> {
    if (!hashOpaqueToken(token)) throw new InvalidFirstAccessError();
    if (await this.sessions.findIdentity(browserToken)) throw new FirstAccessSessionConflictError();
    const candidate = await this.tokens.findByToken(token);
    if (!candidate || !firstAccessIsValid(candidate)) throw new InvalidFirstAccessError();
    const passwordHash = await this.passwords.hashNew(password);
    await this.users.withLockedCredentials(candidate.userId, async (user, tx) => {
      if (!user?.isActive || user.passwordHash !== null) throw new InvalidFirstAccessError();
      // Date se captura tras obtener el lock, no al inicio de la transacción.
      const now = new Date();
      const consumed = await tx.firstAccessToken.updateMany({ where: {
        id: candidate.id, userId: user.id, tokenHash: candidate.tokenHash,
        usedAt: null, revokedAt: null, expiresAt: { gt: now }, createdAt: { lte: now },
      }, data: { usedAt: now } });
      if (consumed.count !== 1 || !await this.users.establishInitialPassword(user.id, passwordHash, tx)) throw new InvalidFirstAccessError();
      await this.tokens.revokePendingForUser(user.id, tx);
      await this.sessions.revokeAllForUser(user.id, tx);
    });
  }
}
