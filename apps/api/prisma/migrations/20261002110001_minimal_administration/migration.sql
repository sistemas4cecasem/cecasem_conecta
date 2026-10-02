BEGIN;
ALTER TABLE "FirstAccessToken" ALTER COLUMN "createdByUserId" DROP NOT NULL;
ALTER TABLE "UserEmailAccount" ADD COLUMN "removedAt" TIMESTAMPTZ(3);
ALTER TABLE "UserEmailAccount" ADD CONSTRAINT "UserEmailAccount_removal_check"
  CHECK ("removedAt" IS NULL OR "removedAt" >= "createdAt");
ALTER TABLE "AuditEvent" ADD COLUMN "previousRole" "UserRole",
  ADD COLUMN "newRole" "UserRole", ADD COLUMN "emailAccountId" UUID;
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_emailAccountId_fkey"
  FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE INDEX "AuditEvent_emailAccountId_idx" ON "AuditEvent"("emailAccountId");
ALTER TABLE "AuditEvent" DROP CONSTRAINT "AuditEvent_reset_token_check",
  DROP CONSTRAINT "AuditEvent_reset_actor_check";
-- Todas las familias son explícitas. IS NOT NULL evita aceptación por UNKNOWN.
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_action_fields_check" CHECK (
  (action IN ('PASSWORD_RESET_ISSUED', 'PASSWORD_RESET_REGENERATED', 'PASSWORD_RESET_COMPLETED', 'PASSWORD_RESET_REVOKED')
    AND "passwordResetTokenId" IS NOT NULL AND "emailAccountId" IS NULL
    AND "previousRole" IS NULL AND "newRole" IS NULL
    AND ((action = 'PASSWORD_RESET_COMPLETED' AND "actorUserId" IS NULL)
      OR (action IN ('PASSWORD_RESET_ISSUED', 'PASSWORD_RESET_REGENERATED') AND "actorUserId" IS NOT NULL)
      OR action = 'PASSWORD_RESET_REVOKED'))
  OR (action = 'USER_ROLE_CHANGED' AND "actorUserId" IS NOT NULL
    AND "previousRole" IS NOT NULL AND "newRole" IS NOT NULL AND "previousRole" <> "newRole"
    AND "passwordResetTokenId" IS NULL AND "emailAccountId" IS NULL)
  OR (action IN ('USER_DEACTIVATED', 'USER_REACTIVATED') AND "actorUserId" IS NOT NULL
    AND "previousRole" IS NULL AND "newRole" IS NULL AND "passwordResetTokenId" IS NULL AND "emailAccountId" IS NULL)
  OR (action IN ('MAILBOX_ASSIGNED', 'MAILBOX_REMOVED') AND "actorUserId" IS NOT NULL
    AND "emailAccountId" IS NOT NULL AND "previousRole" IS NULL AND "newRole" IS NULL AND "passwordResetTokenId" IS NULL)
);
COMMIT;
