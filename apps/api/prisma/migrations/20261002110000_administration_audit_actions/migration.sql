-- Commit separado: los nuevos valores deben existir antes de utilizarlos en CHECK.
ALTER TYPE "AuditAction" ADD VALUE 'USER_ROLE_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE 'USER_DEACTIVATED';
ALTER TYPE "AuditAction" ADD VALUE 'USER_REACTIVATED';
ALTER TYPE "AuditAction" ADD VALUE 'MAILBOX_ASSIGNED';
ALTER TYPE "AuditAction" ADD VALUE 'MAILBOX_REMOVED';
