import { Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { SessionsService } from './sessions.service';
import { FirstAccessTokensService } from './first-access-tokens.service';
import { PasswordResetTokensService } from './password-reset-tokens.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../../generated/prisma/client';

@Injectable()
export class UserAccessService {
  constructor(private readonly users: UsersService, private readonly sessions: SessionsService,
    private readonly tokens: FirstAccessTokensService, private readonly resets: PasswordResetTokensService,
    private readonly audit: AuditService) {}

  // Interfaz interna para 1.6: no existe endpoint administrativo.
  async deactivate(userId: string, actorUserId: string | null = null): Promise<void> {
    await this.users.withLockedCredentials(userId, async (user, tx) => {
      if (!user) return;
      await this.users.deactivateLocked(userId, tx);
      await this.sessions.revokeAllForUser(userId, tx);
      await this.tokens.revokePendingForUser(userId, tx);
      const revoked = await this.resets.revokePendingForUser(userId, tx);
      for (const reset of revoked) await this.audit.recordPasswordReset(AuditAction.PASSWORD_RESET_REVOKED, actorUserId, userId, reset.id, tx);
    });
  }
}
