import { Injectable } from '@nestjs/common';
import { AuditAction, Prisma, UserRole } from '../../generated/prisma/client';
import type { DirectoryTarget } from '../directory/directory-history.service';

type ResetAction = typeof AuditAction.PASSWORD_RESET_ISSUED | typeof AuditAction.PASSWORD_RESET_REGENERATED |
  typeof AuditAction.PASSWORD_RESET_COMPLETED | typeof AuditAction.PASSWORD_RESET_REVOKED;

@Injectable()
export class AuditService {
  recordConsolidation(actorUserId: string, duplicateCandidateId: string,
    target: { principalOrganizationId: string; duplicateOrganizationId: string } | { principalPersonId: string; duplicatePersonId: string },
    operationId: string, tx: Prisma.TransactionClient) {
    return tx.auditEvent.create({ data: { action: AuditAction.DUPLICATE_CONSOLIDATED, actorUserId, duplicateCandidateId, ...target, operationId } });
  }
  recordVerificationSettings(actorUserId: string, operationId: string,
    previous: { personalVerificationMonths: number; institutionalVerificationMonths: number },
    next: { personalVerificationMonths: number; institutionalVerificationMonths: number }, tx: Prisma.TransactionClient) {
    return tx.auditEvent.create({ data: { action: AuditAction.VERIFICATION_SETTINGS_CHANGED, actorUserId, operationId,
      previousPersonalVerificationMonths: previous.personalVerificationMonths, newPersonalVerificationMonths: next.personalVerificationMonths,
      previousInstitutionalVerificationMonths: previous.institutionalVerificationMonths, newInstitutionalVerificationMonths: next.institutionalVerificationMonths } });
  }

  recordDirectory(action: typeof AuditAction.ORGANIZATION_UPDATED | typeof AuditAction.ORGANIZATION_STATUS_CHANGED |
    typeof AuditAction.CATEGORY_UPDATED | typeof AuditAction.CATEGORY_STATUS_CHANGED |
    typeof AuditAction.PERSON_UPDATED | typeof AuditAction.PERSON_STATUS_CHANGED |
    typeof AuditAction.PERSON_RELATION_UPDATED | typeof AuditAction.PERSON_RELATION_ENDED |
    typeof AuditAction.CONTACT_METHOD_UPDATED | typeof AuditAction.CONTACT_METHOD_CONDITION_CHANGED |
    typeof AuditAction.CONTACT_ASSOCIATION_CREATED | typeof AuditAction.CONTACT_ASSOCIATION_UPDATED |
    typeof AuditAction.CONTACT_ASSOCIATION_ENDED | typeof AuditAction.CONTACT_ASSOCIATION_STATUS_CHANGED,
    target: DirectoryTarget, actorUserId: string,
    operationId: string, tx: Prisma.TransactionClient) {
    return tx.auditEvent.create({ data: { action, ...target, actorUserId, operationId } });
  }

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
