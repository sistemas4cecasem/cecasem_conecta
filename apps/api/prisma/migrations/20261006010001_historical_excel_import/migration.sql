-- CreateEnum
CREATE TYPE "DataImportBatchStatus" AS ENUM ('ANALYZED', 'IMPORTED', 'FAILED');

-- CreateEnum
CREATE TYPE "DataImportRecordKind" AS ENUM ('ORGANIZATION', 'PERSON', 'CONTACT', 'HISTORICAL_RECORD');

-- CreateEnum
CREATE TYPE "DataImportRowStatus" AS ENUM ('READY', 'NEEDS_REVIEW', 'INVALID', 'IMPORTED', 'IGNORED');

-- CreateEnum
CREATE TYPE "ImportedHistoryKind" AS ENUM ('SENT', 'RECEIVED', 'OTHER', 'UNKNOWN');

-- AlterTable
ALTER TABLE "AuditEvent" ADD COLUMN     "dataImportBatchId" UUID;

-- AlterTable
ALTER TABLE "ContactMethod" ADD COLUMN     "dataImportBatchId" UUID;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "dataImportBatchId" UUID;

-- AlterTable
ALTER TABLE "OrganizationContact" ADD COLUMN     "dataImportBatchId" UUID;

-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "dataImportBatchId" UUID;

-- AlterTable
ALTER TABLE "PersonContact" ADD COLUMN     "dataImportBatchId" UUID;

-- AlterTable
ALTER TABLE "PersonOrganizationRelation" ADD COLUMN     "dataImportBatchId" UUID;

-- AlterTable
ALTER TABLE "Verification" ADD COLUMN     "importedHistoryId" UUID;

-- CreateTable
CREATE TABLE "DataImportBatch" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "originalFilename" VARCHAR(255) NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "worksheetName" VARCHAR(100) NOT NULL,
    "headerRow" INTEGER NOT NULL,
    "recordKind" "DataImportRecordKind" NOT NULL,
    "columnMapping" JSONB NOT NULL,
    "status" "DataImportBatchStatus" NOT NULL DEFAULT 'ANALYZED',
    "analyzedRows" INTEGER NOT NULL,
    "readyRows" INTEGER NOT NULL,
    "reviewRows" INTEGER NOT NULL,
    "invalidRows" INTEGER NOT NULL,
    "importedRows" INTEGER NOT NULL DEFAULT 0,
    "initiatedByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMPTZ(3),
    "failureCode" VARCHAR(80),

    CONSTRAINT "DataImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataImportRow" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "batchId" UUID NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "status" "DataImportRowStatus" NOT NULL,
    "sourceValues" JSONB NOT NULL,
    "normalizedValues" JSONB,
    "errors" JSONB NOT NULL,
    "warnings" JSONB NOT NULL,
    "matches" JSONB NOT NULL,
    "organizationId" UUID,
    "personId" UUID,
    "contactMethodId" UUID,
    "personContactId" UUID,
    "organizationContactId" UUID,
    "historicalRecordId" UUID,

    CONSTRAINT "DataImportRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportedHistoricalRecord" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "batchId" UUID NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "kind" "ImportedHistoryKind" NOT NULL,
    "occurredOn" DATE,
    "email" VARCHAR(254),
    "subject" VARCHAR(998),
    "body" TEXT,
    "originalObservation" VARCHAR(5000),
    "organizationId" UUID,
    "personId" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "lastVerifiedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportedHistoricalRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DataImportBatch_initiatedByUserId_createdAt_id_idx" ON "DataImportBatch"("initiatedByUserId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "DataImportBatch_status_createdAt_id_idx" ON "DataImportBatch"("status", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "DataImportRow_historicalRecordId_key" ON "DataImportRow"("historicalRecordId");

-- CreateIndex
CREATE INDEX "DataImportRow_batchId_status_rowNumber_idx" ON "DataImportRow"("batchId", "status", "rowNumber");

-- CreateIndex
CREATE UNIQUE INDEX "DataImportRow_batchId_rowNumber_key" ON "DataImportRow"("batchId", "rowNumber");

-- CreateIndex
CREATE INDEX "ImportedHistoricalRecord_email_occurredOn_id_idx" ON "ImportedHistoricalRecord"("email", "occurredOn", "id");

-- CreateIndex
CREATE INDEX "ImportedHistoricalRecord_organizationId_occurredOn_id_idx" ON "ImportedHistoricalRecord"("organizationId", "occurredOn", "id");

-- CreateIndex
CREATE INDEX "ImportedHistoricalRecord_personId_occurredOn_id_idx" ON "ImportedHistoricalRecord"("personId", "occurredOn", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ImportedHistoricalRecord_batchId_rowNumber_key" ON "ImportedHistoricalRecord"("batchId", "rowNumber");

-- CreateIndex
CREATE UNIQUE INDEX "AuditEvent_dataImportBatchId_key" ON "AuditEvent"("dataImportBatchId");

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_dataImportBatchId_fkey" FOREIGN KEY ("dataImportBatchId") REFERENCES "DataImportBatch"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_dataImportBatchId_fkey" FOREIGN KEY ("dataImportBatchId") REFERENCES "DataImportBatch"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_dataImportBatchId_fkey" FOREIGN KEY ("dataImportBatchId") REFERENCES "DataImportBatch"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PersonOrganizationRelation" ADD CONSTRAINT "PersonOrganizationRelation_dataImportBatchId_fkey" FOREIGN KEY ("dataImportBatchId") REFERENCES "DataImportBatch"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ContactMethod" ADD CONSTRAINT "ContactMethod_dataImportBatchId_fkey" FOREIGN KEY ("dataImportBatchId") REFERENCES "DataImportBatch"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PersonContact" ADD CONSTRAINT "PersonContact_dataImportBatchId_fkey" FOREIGN KEY ("dataImportBatchId") REFERENCES "DataImportBatch"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "OrganizationContact" ADD CONSTRAINT "OrganizationContact_dataImportBatchId_fkey" FOREIGN KEY ("dataImportBatchId") REFERENCES "DataImportBatch"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Verification" ADD CONSTRAINT "Verification_importedHistoryId_fkey" FOREIGN KEY ("importedHistoryId") REFERENCES "ImportedHistoricalRecord"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "DataImportBatch" ADD CONSTRAINT "DataImportBatch_initiatedByUserId_fkey" FOREIGN KEY ("initiatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "DataImportRow" ADD CONSTRAINT "DataImportRow_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "DataImportBatch"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "DataImportRow" ADD CONSTRAINT "DataImportRow_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "DataImportRow" ADD CONSTRAINT "DataImportRow_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "DataImportRow" ADD CONSTRAINT "DataImportRow_contactMethodId_fkey" FOREIGN KEY ("contactMethodId") REFERENCES "ContactMethod"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "DataImportRow" ADD CONSTRAINT "DataImportRow_personContactId_fkey" FOREIGN KEY ("personContactId") REFERENCES "PersonContact"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "DataImportRow" ADD CONSTRAINT "DataImportRow_organizationContactId_fkey" FOREIGN KEY ("organizationContactId") REFERENCES "OrganizationContact"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "DataImportRow" ADD CONSTRAINT "DataImportRow_historicalRecordId_fkey" FOREIGN KEY ("historicalRecordId") REFERENCES "ImportedHistoricalRecord"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ImportedHistoricalRecord" ADD CONSTRAINT "ImportedHistoricalRecord_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "DataImportBatch"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ImportedHistoricalRecord" ADD CONSTRAINT "ImportedHistoricalRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ImportedHistoricalRecord" ADD CONSTRAINT "ImportedHistoricalRecord_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "Verification" DROP CONSTRAINT "Verification_target_check";
ALTER TABLE "Verification" ADD CONSTRAINT "Verification_target_check" CHECK (num_nonnulls("organizationId","personId","personRelationId","personContactId","organizationContactId","importedHistoryId")=1);

DO $$
DECLARE previous_check text;
BEGIN
  SELECT pg_get_expr(conbin,conrelid) INTO STRICT previous_check FROM pg_constraint
    WHERE conrelid='"AuditEvent"'::regclass AND conname='AuditEvent_action_fields_check';
  ALTER TABLE "AuditEvent" DROP CONSTRAINT "AuditEvent_action_fields_check";
  EXECUTE 'ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_action_fields_check" CHECK ((('||previous_check||') AND "dataImportBatchId" IS NULL) OR '
    ||'(action IN (''DATA_IMPORT_BATCH_APPLIED'',''DATA_IMPORT_BATCH_FAILED'') AND "dataImportBatchId" IS NOT NULL AND "actorUserId" IS NOT NULL AND "operationId"="dataImportBatchId" '
    ||'AND num_nonnulls("targetUserId","passwordResetTokenId","previousRole","newRole","emailAccountId","organizationId","categoryId","personId","personRelationId","contactMethodId","personContactId","organizationContactId","previousPersonalVerificationMonths","newPersonalVerificationMonths","previousInstitutionalVerificationMonths","newInstitutionalVerificationMonths","previousReminderIntervalDays","newReminderIntervalDays","meetingEventId","referralId","opportunityEventId","fileUploadId","communicationId","processId","contactRestrictionId","processEventId","contactIntentId","duplicateCandidateId","principalOrganizationId","duplicateOrganizationId","principalPersonId","duplicatePersonId")=0))';
END $$;

ALTER TABLE "DataImportBatch" ADD CONSTRAINT "DataImportBatch_counts_check" CHECK ("analyzedRows">=0 AND "readyRows">=0 AND "reviewRows">=0 AND "invalidRows">=0 AND "importedRows">=0 AND "readyRows"+"reviewRows"+"invalidRows"="analyzedRows" AND "importedRows"<="readyRows"+"reviewRows");
