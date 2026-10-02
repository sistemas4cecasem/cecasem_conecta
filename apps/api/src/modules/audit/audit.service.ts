import { Injectable } from '@nestjs/common';
import { AuditAction, Prisma, UserRole } from '../../generated/prisma/client';

type ResetAction = typeof AuditAction.PASSWORD_RESET_ISSUED | typeof AuditAction.PASSWORD_RESET_REGENERATED |
  typeof AuditAction.PASSWORD_RESET_COMPLETED | typeof AuditAction.PASSWORD_RESET_REVOKED;

@Injectable()
export class AuditService {
  recordPasswordReset(action: ResetAction, actorUserId: string | null, targetUserId: string,
    passwordResetTokenId: string, tx: Prisma.TransactionClient, createdAt = new Date()) {
    return tx.auditEvent.create({ data: { action, actorUserId, targetUserId, passwordResetTokenId, createdAt } });
  }

  recordRoleChange(actorUserId: string, targetUserId: string, previousRole: UserRole, newRole: UserRole, tx: Prisma.TransactionClient) {
    return tx.auditEvent.create({ data: { action: AuditAction.USER_ROLE_CHANGED, actorUserId, targetUserId, previousRole, newRole } });
  }

  recordUserStatus(action: typeof AuditAction.USER_DEACTIVATED | typeof AuditAction.USER_REACTIVATED,
    actorUserId: string, targetUserId: string, tx: Prisma.TransactionClient) {
    return tx.auditEvent.create({ data: { action, actorUserId, targetUserId } });
  }

  recordMailbox(action: typeof AuditAction.MAILBOX_ASSIGNED | typeof AuditAction.MAILBOX_REMOVED,
    actorUserId: string, targetUserId: string, emailAccountId: string, tx: Prisma.TransactionClient) {
    return tx.auditEvent.create({ data: { action, actorUserId, targetUserId, emailAccountId } });
  }
}
