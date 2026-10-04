-- CreateEnum
CREATE TYPE "OpportunityStatus" AS ENUM ('PENDING_REVIEW', 'PREPARING', 'SUBMITTED', 'DISCARDED', 'FINISHED');

-- CreateEnum
CREATE TYPE "OpportunityEventType" AS ENUM ('CREATED', 'UPDATED', 'STATUS_CHANGED', 'DISCARDED', 'FINISHED');

-- AlterTable
ALTER TABLE "AuditEvent" ADD COLUMN     "opportunityEventId" UUID;

-- AlterTable
ALTER TABLE "FileUpload" ADD COLUMN     "opportunityId" UUID;

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(300) NOT NULL,
    "description" VARCHAR(10000),
    "url" VARCHAR(2048),
    "deadline" DATE,
    "requirements" VARCHAR(10000),
    "status" "OpportunityStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "discardReason" VARCHAR(5000),
    "finalResult" VARCHAR(5000),
    "processId" UUID,
    "communicationId" UUID,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,
    "requestKey" UUID NOT NULL,
    "requestFingerprint" VARCHAR(64) NOT NULL,

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpportunityOrganization" (
    "opportunityId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,

    CONSTRAINT "OpportunityOrganization_pkey" PRIMARY KEY ("opportunityId","organizationId")
);

-- CreateTable
CREATE TABLE "OpportunityEvent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "opportunityId" UUID NOT NULL,
    "type" "OpportunityEventType" NOT NULL,
    "previousStatus" "OpportunityStatus",
    "newStatus" "OpportunityStatus" NOT NULL,
    "changes" JSONB NOT NULL,
    "actorUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL,

    CONSTRAINT "OpportunityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Opportunity_status_createdAt_id_idx" ON "Opportunity"("status", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Opportunity_createdAt_id_idx" ON "Opportunity"("createdAt", "id");

-- CreateIndex
CREATE INDEX "Opportunity_processId_idx" ON "Opportunity"("processId");

-- CreateIndex
CREATE INDEX "Opportunity_communicationId_idx" ON "Opportunity"("communicationId");

-- CreateIndex
CREATE UNIQUE INDEX "Opportunity_createdByUserId_requestKey_key" ON "Opportunity"("createdByUserId", "requestKey");

-- CreateIndex
CREATE INDEX "OpportunityOrganization_organizationId_idx" ON "OpportunityOrganization"("organizationId");

-- CreateIndex
CREATE INDEX "OpportunityEvent_opportunityId_createdAt_id_idx" ON "OpportunityEvent"("opportunityId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "OpportunityEvent_createdAt_id_idx" ON "OpportunityEvent"("createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "OpportunityEvent_opportunityId_version_key" ON "OpportunityEvent"("opportunityId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "AuditEvent_opportunityEventId_key" ON "AuditEvent"("opportunityEventId");

-- CreateIndex
CREATE UNIQUE INDEX "Communication_id_processId_key" ON "Communication"("id", "processId");

-- CreateIndex
CREATE INDEX "FileUpload_opportunityId_createdAt_id_idx" ON "FileUpload"("opportunityId", "createdAt", "id");

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_opportunityEventId_fkey" FOREIGN KEY ("opportunityEventId") REFERENCES "OpportunityEvent"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "FileUpload" ADD CONSTRAINT "FileUpload_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_processId_fkey" FOREIGN KEY ("processId") REFERENCES "RelationshipProcess"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_communicationId_fkey" FOREIGN KEY ("communicationId") REFERENCES "Communication"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "OpportunityOrganization" ADD CONSTRAINT "OpportunityOrganization_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "OpportunityOrganization" ADD CONSTRAINT "OpportunityOrganization_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "OpportunityEvent" ADD CONSTRAINT "OpportunityEvent_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "OpportunityEvent" ADD CONSTRAINT "OpportunityEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Invariantes del dominio y ampliación de adjuntos privados.
ALTER TABLE "FileUpload" DROP CONSTRAINT "FileUpload_target_check";
ALTER TABLE "FileUpload" ADD CONSTRAINT "FileUpload_target_check" CHECK (num_nonnulls("processId", "communicationId", "opportunityId") = 1);
ALTER TABLE "Opportunity"
 ADD CONSTRAINT "Opportunity_name_check" CHECK (length(btrim(name)) > 0 AND name !~ '[[:cntrl:]]'),
 ADD CONSTRAINT "Opportunity_version_check" CHECK (version >= 1),
 ADD CONSTRAINT "Opportunity_fingerprint_check" CHECK ("requestFingerprint" ~ '^[0-9a-f]{64}$'),
 ADD CONSTRAINT "Opportunity_url_check" CHECK (url IS NULL OR url ~ '^https?://'),
 ADD CONSTRAINT "Opportunity_discard_check" CHECK ((status = 'DISCARDED' AND "discardReason" IS NOT NULL AND length(btrim("discardReason")) > 0) OR (status <> 'DISCARDED' AND "discardReason" IS NULL)),
 ADD CONSTRAINT "Opportunity_result_check" CHECK ("finalResult" IS NULL OR (status = 'FINISHED' AND length(btrim("finalResult")) > 0)),
 ADD CONSTRAINT "Opportunity_origin_coherence_fkey" FOREIGN KEY ("communicationId", "processId") REFERENCES "Communication" (id, "processId") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "OpportunityEvent"
 ADD CONSTRAINT "OpportunityEvent_changes_check" CHECK (jsonb_typeof(changes) = 'object'),
 ADD CONSTRAINT "OpportunityEvent_version_check" CHECK (version >= 1),
 ADD CONSTRAINT "OpportunityEvent_transition_check" CHECK (
  (type = 'CREATED' AND "previousStatus" IS NULL AND "newStatus" = 'PENDING_REVIEW' AND version = 1)
  OR (type = 'UPDATED' AND "previousStatus" IS NOT NULL AND "previousStatus" = "newStatus" AND changes <> '{}'::jsonb AND version > 1)
  OR (type = 'STATUS_CHANGED' AND version > 1 AND "previousStatus" IS NOT NULL AND (("previousStatus" = 'PENDING_REVIEW' AND "newStatus" = 'PREPARING') OR ("previousStatus" = 'PREPARING' AND "newStatus" = 'SUBMITTED')))
  OR (type = 'DISCARDED' AND version > 1 AND "previousStatus" IS NOT NULL AND "previousStatus" IN ('PENDING_REVIEW','PREPARING') AND "newStatus" = 'DISCARDED' AND changes->'discardReason'->>'next' IS NOT NULL AND length(btrim(changes->'discardReason'->>'next')) > 0)
  OR (type = 'FINISHED' AND version > 1 AND "previousStatus" IS NOT NULL AND "previousStatus" = 'SUBMITTED' AND "newStatus" = 'FINISHED'));

CREATE FUNCTION preserve_opportunity_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW."processId",NEW."communicationId",NEW."createdByUserId",NEW."createdAt",NEW."requestKey",NEW."requestFingerprint") IS DISTINCT FROM ROW(OLD."processId",OLD."communicationId",OLD."createdByUserId",OLD."createdAt",OLD."requestKey",OLD."requestFingerprint") THEN
  RAISE EXCEPTION 'La identidad y el origen de la oportunidad son históricos' USING ERRCODE = '23514';
 END IF;
 IF NEW.status <> OLD.status AND NOT ((OLD.status = 'PENDING_REVIEW' AND NEW.status IN ('PREPARING','DISCARDED')) OR (OLD.status = 'PREPARING' AND NEW.status IN ('SUBMITTED','DISCARDED')) OR (OLD.status = 'SUBMITTED' AND NEW.status = 'FINISHED')) THEN
  RAISE EXCEPTION 'Transición de oportunidad inválida' USING ERRCODE = '23514';
 END IF;
 IF (OLD.status = 'DISCARDED' AND NEW."discardReason" IS DISTINCT FROM OLD."discardReason") OR (OLD.status = 'FINISHED' AND NEW."finalResult" IS DISTINCT FROM OLD."finalResult") THEN
  RAISE EXCEPTION 'El resultado histórico no admite edición silenciosa' USING ERRCODE = '23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "Opportunity_identity_history_check" BEFORE UPDATE ON "Opportunity" FOR EACH ROW EXECUTE FUNCTION preserve_opportunity_identity();
CREATE FUNCTION preserve_opportunity_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Los hechos de oportunidades son inmutables' USING ERRCODE = '23514';
END $$;
CREATE TRIGGER "OpportunityEvent_immutable_check" BEFORE UPDATE ON "OpportunityEvent" FOR EACH ROW EXECUTE FUNCTION preserve_opportunity_event();

DO $$
DECLARE previous_check text;
BEGIN
 SELECT pg_get_expr(conbin, conrelid) INTO STRICT previous_check FROM pg_constraint WHERE conrelid = '"AuditEvent"'::regclass AND conname = 'AuditEvent_action_fields_check';
 ALTER TABLE "AuditEvent" DROP CONSTRAINT "AuditEvent_action_fields_check";
 EXECUTE 'ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_action_fields_check" CHECK (((' || previous_check || ') AND "opportunityEventId" IS NULL) OR (action IN (''OPPORTUNITY_CREATED'',''OPPORTUNITY_UPDATED'',''OPPORTUNITY_STATUS_CHANGED'',''OPPORTUNITY_DISCARDED'',''OPPORTUNITY_FINISHED'')
 AND "opportunityEventId" IS NOT NULL AND "actorUserId" IS NOT NULL AND "operationId" IS NOT NULL AND "operationId" = "opportunityEventId"
 AND num_nonnulls("fileUploadId","communicationId","processId","contactRestrictionId","processEventId","contactIntentId","targetUserId","passwordResetTokenId","previousRole","newRole","emailAccountId","organizationId","categoryId","personId","personRelationId","contactMethodId","personContactId","organizationContactId","previousPersonalVerificationMonths","newPersonalVerificationMonths","previousInstitutionalVerificationMonths","newInstitutionalVerificationMonths","duplicateCandidateId","principalOrganizationId","duplicateOrganizationId","principalPersonId","duplicatePersonId") = 0))';
END $$;
CREATE FUNCTION check_opportunity_audit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE recorded_type text; recorded_actor uuid;
BEGIN
 IF NEW."opportunityEventId" IS NOT NULL THEN
  SELECT type::text,"actorUserId" INTO recorded_type,recorded_actor FROM "OpportunityEvent" WHERE id = NEW."opportunityEventId";
  IF NEW.action::text IS DISTINCT FROM ('OPPORTUNITY_' || recorded_type) OR NEW."actorUserId" IS DISTINCT FROM recorded_actor THEN
   RAISE EXCEPTION 'Auditoría de oportunidad incoherente' USING ERRCODE = '23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "AuditEvent_opportunity_consistency_check" BEFORE INSERT OR UPDATE ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION check_opportunity_audit();
