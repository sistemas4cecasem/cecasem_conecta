import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppEnvironment } from '../../config/environment';
import { AuditAction } from '../../generated/prisma/client';
import { PERMISSIONS } from './authorization/permission';
import { hasPermission } from './authorization/role-permissions';
import { UsersService } from '../users/users.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUserDto } from './auth.dto';
import { PasswordService, InvalidNewPasswordError, validNewPassword } from './password.service';
import { SessionsService } from './sessions.service';
import { PasswordResetTokensService, passwordResetIsValid } from './password-reset-tokens.service';
import { InvalidPasswordResetError, PasswordResetEmissionError, PasswordResetSessionConflictError, ReusedPasswordError } from './password-reset.errors';
import { createOpaqueToken, hashOpaqueToken } from './opaque-token';

@Injectable()
export class PasswordResetService {
  constructor(private readonly users: UsersService, private readonly tokens: PasswordResetTokensService,
    private readonly passwords: PasswordService, private readonly sessions: SessionsService,
    private readonly audit: AuditService, private readonly config: ConfigService<AppEnvironment, true>) {}

  async issue(userId: string, actor: AuthenticatedUserDto): Promise<{ token: string; expiresAt: Date }> {
    if (!hasPermission(actor.role, PERMISSIONS.PASSWORD_RESET_ISSUE)) throw new PasswordResetEmissionError('FORBIDDEN');
    return this.users.withLockedCredentials(userId, async (user, tx) => {
      const issuer = await this.users.findIdentityById(actor.id, tx);
      if (!issuer?.isActive || !hasPermission(issuer.role, PERMISSIONS.PASSWORD_RESET_ISSUE)) throw new PasswordResetEmissionError('FORBIDDEN');
      if (!user) throw new PasswordResetEmissionError('NOT_FOUND');
      if (!user.isActive) throw new PasswordResetEmissionError('INACTIVE');
      if (user.passwordHash === null) throw new PasswordResetEmissionError('FIRST_ACCESS_REQUIRED');
      const revoked = await this.tokens.revokePendingForUser(userId, tx);
      const token = createOpaqueToken(); const createdAt = new Date();
      const expiresAt = new Date(+createdAt + this.config.get('PASSWORD_RESET_TOKEN_TTL_SECONDS', { infer: true }) * 1000);
      const row = await tx.passwordResetToken.create({ data: { userId, createdByUserId: actor.id, tokenHash: hashOpaqueToken(token)!, createdAt, expiresAt } });
      await this.audit.recordPasswordReset(revoked.length ? AuditAction.PASSWORD_RESET_REGENERATED : AuditAction.PASSWORD_RESET_ISSUED,
        actor.id, userId, row.id, tx, createdAt);
      return { token, expiresAt };
    });
  }

  async consume(token: string, password: string, browserToken?: string): Promise<void> {
    if (!validNewPassword(password)) throw new InvalidNewPasswordError();
    if (!hashOpaqueToken(token)) throw new InvalidPasswordResetError();
    if (await this.sessions.findIdentity(browserToken)) throw new PasswordResetSessionConflictError();
    const candidate = await this.tokens.findByToken(token);
    if (!candidate || !passwordResetIsValid(candidate)) throw new InvalidPasswordResetError();
    const credentials = await this.users.findCredentialsById(candidate.userId);
    if (!credentials?.isActive || !credentials.passwordHash) throw new InvalidPasswordResetError();
    const previousHash = credentials.passwordHash;
    if (await this.passwords.verify(password, previousHash)) throw new ReusedPasswordError();
    const replacement = await this.passwords.hashNew(password);
    await this.users.withLockedCredentials(candidate.userId, async (user, tx) => {
      if (!user?.isActive || user.passwordHash !== previousHash) throw new InvalidPasswordResetError();
      const now = new Date();
      const consumed = await tx.passwordResetToken.updateMany({ where: { id: candidate.id, userId: user.id,
        tokenHash: candidate.tokenHash, usedAt: null, revokedAt: null, expiresAt: { gt: now }, createdAt: { lte: now } }, data: { usedAt: now } });
      if (consumed.count !== 1 || !await this.users.replaceCredentialIfUnchanged(user.id, previousHash, replacement, tx)) throw new InvalidPasswordResetError();
      await this.tokens.revokePendingForUser(user.id, tx);
      await this.sessions.revokeAllForUser(user.id, tx);
      await this.audit.recordPasswordReset(AuditAction.PASSWORD_RESET_COMPLETED, null, user.id, candidate.id, tx, now);
    });
  }
}
