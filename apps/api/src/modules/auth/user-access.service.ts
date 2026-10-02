import { Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { SessionsService } from './sessions.service';
import { FirstAccessTokensService } from './first-access-tokens.service';
import { PasswordResetTokensService } from './password-reset-tokens.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../../generated/prisma/client';
import { AdministrationError } from '../users/administration.errors';
import { hasPermission } from './authorization/role-permissions';
import { PERMISSIONS } from './authorization/permission';

@Injectable()
export class UserAccessService {
  constructor(private readonly users: UsersService, private readonly sessions: SessionsService,
    private readonly tokens: FirstAccessTokensService, private readonly resets: PasswordResetTokensService,
    private readonly audit: AuditService) {}

  async deactivate(userId: string, actorUserId: string): Promise<void> {
    await this.users.withAdministrationLocks(actorUserId, userId, async (user, tx) => {
      const actor = await this.users.findIdentityById(actorUserId, tx);
      if (!actor?.isActive || !hasPermission(actor.role, PERMISSIONS.USERS_STATUS_UPDATE)) throw new AdministrationError('FORBIDDEN');
      if (!user) throw new AdministrationError('USER_NOT_FOUND');
      if (!user.isActive) return;
      await this.users.protectLastAdministrator(user, tx);
      await this.users.deactivateLocked(userId, tx);
      await this.sessions.revokeAllForUser(userId, tx);
      await this.tokens.revokePendingForUser(userId, tx);
      const revoked = await this.resets.revokePendingForUser(userId, tx);
      for (const reset of revoked) await this.audit.recordPasswordReset(AuditAction.PASSWORD_RESET_REVOKED, actorUserId, userId, reset.id, tx);
      await this.audit.recordUserStatus(AuditAction.USER_DEACTIVATED, actorUserId, userId, tx);
    });
  }
}
