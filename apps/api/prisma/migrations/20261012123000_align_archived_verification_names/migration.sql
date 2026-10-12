BEGIN;

ALTER TABLE "ArchivedVerificationSettings"
  RENAME CONSTRAINT "VerificationSettings_pkey" TO "ArchivedVerificationSettings_pkey";

ALTER TABLE "HistoricalVerification"
  RENAME CONSTRAINT "Verification_pkey" TO "HistoricalVerification_pkey";

ALTER TABLE "HistoricalVerification" RENAME CONSTRAINT "Verification_actorUserId_fkey" TO "HistoricalVerification_actorUserId_fkey";
ALTER TABLE "HistoricalVerification" RENAME CONSTRAINT "Verification_importedHistoryId_fkey" TO "HistoricalVerification_importedHistoryId_fkey";
ALTER TABLE "HistoricalVerification" RENAME CONSTRAINT "Verification_organizationContactId_fkey" TO "HistoricalVerification_organizationContactId_fkey";
ALTER TABLE "HistoricalVerification" RENAME CONSTRAINT "Verification_organizationId_fkey" TO "HistoricalVerification_organizationId_fkey";
ALTER TABLE "HistoricalVerification" RENAME CONSTRAINT "Verification_personContactId_fkey" TO "HistoricalVerification_personContactId_fkey";
ALTER TABLE "HistoricalVerification" RENAME CONSTRAINT "Verification_personId_fkey" TO "HistoricalVerification_personId_fkey";
ALTER TABLE "HistoricalVerification" RENAME CONSTRAINT "Verification_personRelationId_fkey" TO "HistoricalVerification_personRelationId_fkey";

ALTER INDEX "Verification_actorUserId_idx" RENAME TO "HistoricalVerification_actorUserId_idx";
ALTER INDEX "Verification_organizationContactId_verifiedAt_id_idx" RENAME TO "HistoricalVerification_organizationContactId_verifiedAt_id_idx";
ALTER INDEX "Verification_organizationId_verifiedAt_id_idx" RENAME TO "HistoricalVerification_organizationId_verifiedAt_id_idx";
ALTER INDEX "Verification_personContactId_verifiedAt_id_idx" RENAME TO "HistoricalVerification_personContactId_verifiedAt_id_idx";
ALTER INDEX "Verification_personId_verifiedAt_id_idx" RENAME TO "HistoricalVerification_personId_verifiedAt_id_idx";
ALTER INDEX "Verification_personRelationId_verifiedAt_id_idx" RENAME TO "HistoricalVerification_personRelationId_verifiedAt_id_idx";

COMMIT;
