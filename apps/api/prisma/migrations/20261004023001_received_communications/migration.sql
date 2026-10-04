ALTER TABLE "Communication"
 ALTER COLUMN "emailAccountId" DROP NOT NULL,
 ALTER COLUMN "accountAddressSnapshot" DROP NOT NULL,
 ALTER COLUMN "accountDisplayNameSnapshot" DROP NOT NULL,
 ALTER COLUMN "sentAt" DROP NOT NULL,
 ADD COLUMN "receivedAt" TIMESTAMPTZ(3),
 ADD COLUMN "occurredAt" TIMESTAMPTZ(3),
 ADD COLUMN "senderNormalizedAddress" VARCHAR(254);

-- Backfill auxiliar: no cambia remitente, destinatarios, contenido ni fechas reales existentes.
UPDATE "Communication" SET "occurredAt" = "sentAt", "senderNormalizedAddress" = lower("senderSnapshot");
ALTER TABLE "Communication"
 ALTER COLUMN "occurredAt" SET NOT NULL,
 ALTER COLUMN "senderNormalizedAddress" SET NOT NULL,
 DROP CONSTRAINT "Communication_snapshot_check",
 DROP CONSTRAINT "Communication_dates_check",
 ADD CONSTRAINT "Communication_direction_check" CHECK (
   (direction = 'SENT' AND "emailAccountId" IS NOT NULL AND "accountAddressSnapshot" IS NOT NULL AND "accountDisplayNameSnapshot" IS NOT NULL
    AND length("accountDisplayNameSnapshot") > 0 AND "senderSnapshot" = "accountAddressSnapshot" AND "sentAt" IS NOT NULL AND "receivedAt" IS NULL AND "occurredAt" = "sentAt")
   OR (direction = 'RECEIVED' AND num_nonnulls("emailAccountId", "accountAddressSnapshot", "accountDisplayNameSnapshot", "sentAt") = 0 AND "receivedAt" IS NOT NULL AND "occurredAt" = "receivedAt")),
 ADD CONSTRAINT "Communication_sender_check" CHECK (length("senderSnapshot") > 0 AND "senderNormalizedAddress" = lower("senderSnapshot") AND position('@' in "senderNormalizedAddress") > 1),
 ADD CONSTRAINT "Communication_dates_check" CHECK ("occurredAt" <= "createdAt");

DROP INDEX "Communication_processId_sentAt_id_idx";
CREATE INDEX "Communication_processId_occurredAt_id_idx" ON "Communication"("processId", "occurredAt", id);
CREATE INDEX "Communication_senderNormalizedAddress_occurredAt_id_idx" ON "Communication"("senderNormalizedAddress", "occurredAt", id);

ALTER TABLE "CommunicationRecipient"
 ADD COLUMN "emailAccountId" UUID,
 ADD COLUMN "emailAccountDisplayNameSnapshot" VARCHAR(150),
 ADD CONSTRAINT "CommunicationRecipient_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 ADD CONSTRAINT "CommunicationRecipient_account_snapshot_check" CHECK (
   num_nonnulls("emailAccountId", "emailAccountDisplayNameSnapshot") = 0 OR
   ("emailAccountId" IS NOT NULL AND "emailAccountDisplayNameSnapshot" IS NOT NULL AND length("emailAccountDisplayNameSnapshot") > 0));
CREATE INDEX "CommunicationRecipient_emailAccountId_idx" ON "CommunicationRecipient"("emailAccountId");

-- Un hecho posterior puede actualizar actividad sin alterar la fecha histórica de cierre.
ALTER TABLE "RelationshipProcess" DROP CONSTRAINT "RelationshipProcess_closure_check";
ALTER TABLE "RelationshipProcess" ADD CONSTRAINT "RelationshipProcess_closure_check" CHECK (
 (state = 'CLOSED' AND "currentResult" IS NOT NULL AND "closedAt" IS NOT NULL AND "closedByUserId" IS NOT NULL AND "closedAt" <= "lastActivityAt")
 OR (state <> 'CLOSED' AND num_nonnulls("currentResult", "closureObservation", "closedAt", "closedByUserId") = 0));

ALTER TABLE "AuditEvent" ADD COLUMN "processId" UUID;
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_processId_fkey" FOREIGN KEY ("processId") REFERENCES "RelationshipProcess"(id) ON DELETE RESTRICT ON UPDATE RESTRICT;
DO $$
DECLARE previous_check text;
BEGIN
 SELECT pg_get_expr(conbin, conrelid) INTO STRICT previous_check FROM pg_constraint
 WHERE conrelid = '"AuditEvent"'::regclass AND conname = 'AuditEvent_action_fields_check';
 ALTER TABLE "AuditEvent" DROP CONSTRAINT "AuditEvent_action_fields_check";
 EXECUTE 'ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_action_fields_check" CHECK (('
 || previous_check || ') AND "processId" IS NULL OR (action = ''RECEIVED_COMMUNICATION_REGISTERED''
 AND "actorUserId" IS NOT NULL AND "operationId" IS NOT NULL AND "communicationId" IS NOT NULL AND "processId" IS NOT NULL
 AND num_nonnulls("contactRestrictionId","processEventId","contactIntentId","targetUserId","passwordResetTokenId","previousRole","newRole","emailAccountId","organizationId","categoryId","personId","personRelationId","contactMethodId","personContactId","organizationContactId","previousPersonalVerificationMonths","newPersonalVerificationMonths","previousInstitutionalVerificationMonths","newInstitutionalVerificationMonths","duplicateCandidateId","principalOrganizationId","duplicateOrganizationId","principalPersonId","duplicatePersonId")=0))';
END $$;
