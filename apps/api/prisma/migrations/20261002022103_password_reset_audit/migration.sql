-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('PASSWORD_RESET_ISSUED', 'PASSWORD_RESET_REGENERATED', 'PASSWORD_RESET_COMPLETED', 'PASSWORD_RESET_REVOKED');

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "action" "AuditAction" NOT NULL,
    "actorUserId" UUID,
    "targetUserId" UUID NOT NULL,
    "passwordResetTokenId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "PasswordResetToken_createdByUserId_idx" ON "PasswordResetToken"("createdByUserId");

-- CreateIndex
CREATE INDEX "AuditEvent_targetUserId_createdAt_idx" ON "AuditEvent"("targetUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_actorUserId_idx" ON "AuditEvent"("actorUserId");

-- CreateIndex
CREATE INDEX "AuditEvent_passwordResetTokenId_idx" ON "AuditEvent"("passwordResetTokenId");

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_passwordResetTokenId_fkey" FOREIGN KEY ("passwordResetTokenId") REFERENCES "PasswordResetToken"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Invariantes temporales y representación canónica; sin índice parcial.
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_expiration_check" CHECK ("expiresAt" > "createdAt");
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_use_check" CHECK ("usedAt" IS NULL OR "usedAt" >= "createdAt");
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_revocation_check" CHECK ("revokedAt" IS NULL OR "revokedAt" >= "createdAt");
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_terminal_check" CHECK ("usedAt" IS NULL OR "revokedAt" IS NULL);
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_hash_check" CHECK ("tokenHash" ~ '^[0-9a-f]{64}$');
-- Las acciones actuales siempre correlacionan un reset y no inventan sesión al completar.
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_reset_token_check" CHECK ("passwordResetTokenId" IS NOT NULL);
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_reset_actor_check" CHECK ((action = 'PASSWORD_RESET_COMPLETED' AND "actorUserId" IS NULL) OR (action IN ('PASSWORD_RESET_ISSUED', 'PASSWORD_RESET_REGENERATED') AND "actorUserId" IS NOT NULL) OR action = 'PASSWORD_RESET_REVOKED');
