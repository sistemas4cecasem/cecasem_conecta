-- CreateEnum
CREATE TYPE "CommunicationDirection" AS ENUM ('SENT');

-- CreateEnum
CREATE TYPE "CommunicationValidity" AS ENUM ('VALID');

-- CreateEnum
CREATE TYPE "RecipientType" AS ENUM ('TO', 'CC', 'BCC');

-- AlterTable
ALTER TABLE "AuditEvent" ADD COLUMN     "communicationId" UUID;

-- CreateTable
CREATE TABLE "Communication" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "processId" UUID NOT NULL,
    "direction" "CommunicationDirection" NOT NULL DEFAULT 'SENT',
    "validity" "CommunicationValidity" NOT NULL DEFAULT 'VALID',
    "version" INTEGER NOT NULL DEFAULT 1,
    "emailAccountId" UUID NOT NULL,
    "accountAddressSnapshot" VARCHAR(254) NOT NULL,
    "accountDisplayNameSnapshot" VARCHAR(150) NOT NULL,
    "senderSnapshot" VARCHAR(254) NOT NULL,
    "subject" VARCHAR(998) NOT NULL,
    "bodyOriginal" TEXT NOT NULL,
    "sentAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "registeredByUserId" UUID NOT NULL,
    "requestKey" UUID NOT NULL,
    "requestFingerprint" VARCHAR(64) NOT NULL,

    CONSTRAINT "Communication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunicationRecipient" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "communicationId" UUID NOT NULL,
    "type" "RecipientType" NOT NULL,
    "addressOriginal" VARCHAR(254) NOT NULL,
    "normalizedAddress" VARCHAR(254) NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "CommunicationRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Communication_processId_sentAt_id_idx" ON "Communication"("processId", "sentAt", "id");

-- CreateIndex
CREATE INDEX "Communication_registeredByUserId_createdAt_id_idx" ON "Communication"("registeredByUserId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Communication_emailAccountId_idx" ON "Communication"("emailAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Communication_registeredByUserId_requestKey_key" ON "Communication"("registeredByUserId", "requestKey");

-- CreateIndex
CREATE INDEX "CommunicationRecipient_normalizedAddress_communicationId_idx" ON "CommunicationRecipient"("normalizedAddress", "communicationId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationRecipient_communicationId_type_position_key" ON "CommunicationRecipient"("communicationId", "type", "position");

-- CreateIndex
CREATE UNIQUE INDEX "AuditEvent_communicationId_key" ON "AuditEvent"("communicationId");

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_communicationId_fkey" FOREIGN KEY ("communicationId") REFERENCES "Communication"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Communication" ADD CONSTRAINT "Communication_processId_fkey" FOREIGN KEY ("processId") REFERENCES "RelationshipProcess"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Communication" ADD CONSTRAINT "Communication_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Communication" ADD CONSTRAINT "Communication_registeredByUserId_fkey" FOREIGN KEY ("registeredByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CommunicationRecipient" ADD CONSTRAINT "CommunicationRecipient_communicationId_fkey" FOREIGN KEY ("communicationId") REFERENCES "Communication"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "Communication"
 ADD CONSTRAINT "Communication_snapshot_check" CHECK ("senderSnapshot" = "accountAddressSnapshot" AND length("accountDisplayNameSnapshot") > 0 AND length("senderSnapshot") > 0),
 ADD CONSTRAINT "Communication_original_check" CHECK (length(subject) BETWEEN 1 AND 998 AND subject !~ E'[\\r\\n]' AND length(regexp_replace(subject, '[[:space:]]', '', 'g')) > 0
   AND length("bodyOriginal") BETWEEN 1 AND 200000 AND length(regexp_replace("bodyOriginal", '[[:space:]]', '', 'g')) > 0),
 ADD CONSTRAINT "Communication_dates_check" CHECK ("sentAt" <= "createdAt"),
 ADD CONSTRAINT "Communication_version_check" CHECK (version = 1),
 ADD CONSTRAINT "Communication_fingerprint_check" CHECK ("requestFingerprint" ~ '^[0-9a-f]{64}$');
ALTER TABLE "CommunicationRecipient"
 ADD CONSTRAINT "CommunicationRecipient_position_check" CHECK (position >= 0 AND position < 100),
 ADD CONSTRAINT "CommunicationRecipient_address_check" CHECK (length("addressOriginal") > 0 AND "normalizedAddress" = lower("addressOriginal") AND position('@' in "normalizedAddress") > 1);

-- Extender el check vigente conservando todas las familias históricas, sin editar sus migraciones.
DO $$
DECLARE previous_check text;
BEGIN
 SELECT pg_get_expr(conbin, conrelid) INTO STRICT previous_check FROM pg_constraint
 WHERE conrelid = '"AuditEvent"'::regclass AND conname = 'AuditEvent_action_fields_check';
 ALTER TABLE "AuditEvent" DROP CONSTRAINT "AuditEvent_action_fields_check";
 EXECUTE 'ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_action_fields_check" CHECK (('
 || previous_check || ') AND "communicationId" IS NULL OR (action = ''SENT_COMMUNICATION_REGISTERED''
 AND "actorUserId" IS NOT NULL AND "operationId" IS NOT NULL AND "communicationId" IS NOT NULL
 AND num_nonnulls("contactRestrictionId","processEventId","contactIntentId","targetUserId","passwordResetTokenId","previousRole","newRole","emailAccountId","organizationId","categoryId","personId","personRelationId","contactMethodId","personContactId","organizationContactId","previousPersonalVerificationMonths","newPersonalVerificationMonths","previousInstitutionalVerificationMonths","newInstitutionalVerificationMonths","duplicateCandidateId","principalOrganizationId","duplicateOrganizationId","principalPersonId","duplicatePersonId")=0))';
END $$;
