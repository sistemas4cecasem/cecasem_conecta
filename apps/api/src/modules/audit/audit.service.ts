import { Injectable } from '@nestjs/common';
import { AuditAction, Prisma } from '../../generated/prisma/client';

@Injectable()
export class AuditService {
  recordPasswordReset(action: AuditAction, actorUserId: string | null, targetUserId: string,
    passwordResetTokenId: string, tx: Prisma.TransactionClient, createdAt = new Date()) {
    return tx.auditEvent.create({ data: { action, actorUserId, targetUserId, passwordResetTokenId, createdAt } });
  }
}
