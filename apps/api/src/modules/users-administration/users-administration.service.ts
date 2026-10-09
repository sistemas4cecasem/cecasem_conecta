import { Injectable } from '@nestjs/common';
import { AuditAction, type Prisma, type UserRole } from '../../generated/prisma/client';
import { UsersService, type CreateUserIdentity, type CreateAvailableEmailAccount } from '../users/users.service';
import { AdministrationError } from '../users/administration.errors';
import { AuditService } from '../audit/audit.service';
import { PERMISSIONS, type Permission } from '../auth/authorization/permission';
import { hasPermission } from '../auth/authorization/role-permissions';
import { PasswordService } from '../auth/password.service';
import { FirstAccessTokensService } from '../auth/first-access-tokens.service';
import { PasswordResetTokensService } from '../auth/password-reset-tokens.service';
import { SessionsService } from '../auth/sessions.service';
import { administrativeUser, publicEmailAccount } from './administration.dto';
import type { AuthenticatedUserDto } from '../auth/auth.dto';

@Injectable()
export class UsersAdministrationService {
  constructor(private readonly users: UsersService, private readonly audit: AuditService, private readonly passwords: PasswordService,
    private readonly firstAccessTokens: FirstAccessTokensService, private readonly passwordResetTokens: PasswordResetTokensService,
    private readonly sessions: SessionsService) {}

  private async authorize(actorId: string, permission: Permission, tx?: Prisma.TransactionClient) {
    const actor = await this.users.findIdentityById(actorId, tx);
    if (!actor?.isActive || !hasPermission(actor.role, permission)) throw new AdministrationError('FORBIDDEN');
    return actor;
  }

  async list(status: 'active' | 'inactive' | 'all', actor: AuthenticatedUserDto) {
    const current = await this.authorize(actor.id, PERMISSIONS.USERS_READ);
    if (status !== 'active' && !hasPermission(current.role, PERMISSIONS.USERS_DEACTIVATED_READ)) throw new AdministrationError('FORBIDDEN');
    return (await this.users.listAdministrativeUsers(status)).map(administrativeUser);
  }

  async create(input: CreateUserIdentity & { password: string }, actorId: string) {
    const passwordHash = await this.passwords.hashNew(input.password);
    return this.users.withAdministrationLocks(actorId, undefined, async (_actor, tx) => {
      await this.authorize(actorId, PERMISSIONS.USERS_CREATE, tx);
      const identity = await this.users.createIdentity({ ...input, passwordHash, mustChangePassword: true }, tx);
      return administrativeUser({ ...identity, passwordHash, mustChangePassword: true });
    });
  }

  async updateProfile(userId: string, input: { givenNames: string; familyNames: string; email: string }, actorId: string) {
    return this.users.withAdministrationLocks(actorId, userId, async (user, tx) => {
      await this.authorize(actorId, PERMISSIONS.USERS_PROFILE_UPDATE, tx);
      if (!user) throw new AdministrationError('USER_NOT_FOUND');
      const updated = await this.users.updateAdministrativeProfileLocked(userId, input, tx);
      if (user.givenNames !== updated.givenNames || user.familyNames !== updated.familyNames || user.email !== updated.email) {
        await this.audit.recordUserProfileUpdate(actorId, userId,
          { givenNames: user.givenNames, familyNames: user.familyNames, email: user.email },
          { givenNames: updated.givenNames, familyNames: updated.familyNames, email: updated.email }, tx);
      }
      return administrativeUser(updated);
    });
  }

  async resetPassword(userId: string, password: string, actorId: string): Promise<void> {
    const passwordHash = await this.passwords.hashNew(password);
    return this.users.withAdministrationLocks(actorId, userId, async (user, tx) => {
      await this.authorize(actorId, PERMISSIONS.USERS_PASSWORD_RESET, tx);
      if (!user) throw new AdministrationError('USER_NOT_FOUND');
      await this.users.assignAdministrativePasswordLocked(userId, passwordHash, tx);
      await this.sessions.revokeAllForUser(userId, tx);
      await this.firstAccessTokens.revokePendingForUser(userId, tx);
      const revoked = await this.passwordResetTokens.revokePendingForUser(userId, tx);
      for (const token of revoked) await this.audit.recordPasswordReset(AuditAction.PASSWORD_RESET_REVOKED, actorId, userId, token.id, tx);
      await this.audit.recordUserPasswordReset(actorId, userId, tx);
    });
  }

  changeRole(userId: string, role: UserRole, actorId: string) {
    return this.users.withAdministrationLocks(actorId, userId, async (user, tx) => {
      await this.authorize(actorId, PERMISSIONS.USERS_ROLE_UPDATE, tx);
      if (!user) throw new AdministrationError('USER_NOT_FOUND');
      if (user.role === role) return;
      await this.users.protectLastAdministrator(user, tx);
      await this.users.changeRoleLocked(userId, role, tx);
      await this.audit.recordRoleChange(actorId, userId, user.role, role, tx);
    });
  }

  reactivate(userId: string, actorId: string) {
    return this.users.withAdministrationLocks(actorId, userId, async (user, tx) => {
      await this.authorize(actorId, PERMISSIONS.USERS_STATUS_UPDATE, tx);
      if (!user) throw new AdministrationError('USER_NOT_FOUND');
      if (user.isActive) return;
      await this.users.reactivateLocked(userId, tx);
      await this.audit.recordUserStatus(AuditAction.USER_REACTIVATED, actorId, userId, tx);
    });
  }

  async catalog(actorId: string) {
    await this.authorize(actorId, PERMISSIONS.USERS_MAILBOXES_MANAGE);
    return (await this.users.listEmailAccounts()).map(publicEmailAccount);
  }

  createMailbox(input: CreateAvailableEmailAccount, actorId: string) {
    return this.users.withAdministrationLocks(actorId, undefined, async (_actor, tx) => {
      await this.authorize(actorId, PERMISSIONS.USERS_MAILBOXES_MANAGE, tx);
      return publicEmailAccount(await this.users.createEmailAccount(input, tx));
    });
  }

  async assignments(userId: string, actorId: string) {
    await this.authorize(actorId, PERMISSIONS.USERS_MAILBOXES_MANAGE);
    return (await this.users.assignedEmailAccounts(userId)).map(row => ({ ...publicEmailAccount(row.emailAccount), assignedAt: row.createdAt }));
  }

  setMailbox(userId: string, emailAccountId: string, assigned: boolean, actorId: string) {
    return this.users.withAdministrationLocks(actorId, userId, async (user, tx) => {
      await this.authorize(actorId, PERMISSIONS.USERS_MAILBOXES_MANAGE, tx);
      if (!user) throw new AdministrationError('USER_NOT_FOUND');
      if (await this.users.setMailboxLocked(userId, emailAccountId, assigned, tx)) {
        await this.audit.recordMailbox(assigned ? AuditAction.MAILBOX_ASSIGNED : AuditAction.MAILBOX_REMOVED, actorId, userId, emailAccountId, tx);
      }
    });
  }
}
