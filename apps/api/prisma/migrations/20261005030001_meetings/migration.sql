-- CreateEnum
CREATE TYPE "MeetingStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MeetingModality" AS ENUM ('ONLINE', 'IN_PERSON', 'HYBRID');

-- CreateEnum
CREATE TYPE "MeetingAttendance" AS ENUM ('UNKNOWN', 'ATTENDED', 'ABSENT');

-- CreateEnum
CREATE TYPE "MeetingEventType" AS ENUM ('CREATED', 'UPDATED', 'COMPLETED', 'CANCELLED', 'PARTICIPANT_ADDED', 'ATTENDANCE_RECORDED', 'AGREEMENT_ADDED');

-- AlterEnum


-- AlterEnum


-- AlterTable
ALTER TABLE "AuditEvent" ADD COLUMN     "meetingEventId" UUID;

-- AlterTable
ALTER TABLE "FileUpload" ADD COLUMN     "meetingId" UUID;

-- CreateTable
CREATE TABLE "Meeting" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "processId" UUID,
    "opportunityId" UUID,
    "scheduledAt" TIMESTAMPTZ(3) NOT NULL,
    "timezone" VARCHAR(100) NOT NULL,
    "modality" "MeetingModality" NOT NULL,
    "meetingUrl" VARCHAR(2048),
    "location" VARCHAR(500),
    "purpose" VARCHAR(5000) NOT NULL,
    "status" "MeetingStatus" NOT NULL DEFAULT 'SCHEDULED',
    "completedAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "cancellationReason" VARCHAR(5000),
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,
    "requestKey" UUID NOT NULL,
    "requestFingerprint" VARCHAR(64) NOT NULL,

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingParticipant" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "meetingId" UUID NOT NULL,
    "userId" UUID,
    "personId" UUID,
    "nameSnapshot" VARCHAR(400) NOT NULL,
    "organizationSnapshot" VARCHAR(300),
    "roleSnapshot" VARCHAR(300),
    "attendance" "MeetingAttendance" NOT NULL DEFAULT 'UNKNOWN',
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingAgreement" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "meetingId" UUID NOT NULL,
    "text" VARCHAR(5000) NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingEvent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "meetingId" UUID NOT NULL,
    "type" "MeetingEventType" NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "changes" JSONB NOT NULL,
    "participantId" UUID,
    "agreementId" UUID,
    "actorUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestKey" UUID NOT NULL,
    "requestFingerprint" VARCHAR(64) NOT NULL,

    CONSTRAINT "MeetingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Meeting_scheduledAt_id_idx" ON "Meeting"("scheduledAt", "id");

-- CreateIndex
CREATE INDEX "Meeting_processId_scheduledAt_id_idx" ON "Meeting"("processId", "scheduledAt", "id");

-- CreateIndex
CREATE INDEX "Meeting_opportunityId_scheduledAt_id_idx" ON "Meeting"("opportunityId", "scheduledAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Meeting_createdByUserId_requestKey_key" ON "Meeting"("createdByUserId", "requestKey");

-- CreateIndex
CREATE INDEX "MeetingParticipant_meetingId_createdAt_id_idx" ON "MeetingParticipant"("meetingId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "MeetingParticipant_userId_idx" ON "MeetingParticipant"("userId");

-- CreateIndex
CREATE INDEX "MeetingParticipant_personId_idx" ON "MeetingParticipant"("personId");

-- CreateIndex
CREATE INDEX "MeetingParticipant_createdByUserId_idx" ON "MeetingParticipant"("createdByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingParticipant_meetingId_userId_key" ON "MeetingParticipant"("meetingId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingParticipant_meetingId_personId_key" ON "MeetingParticipant"("meetingId", "personId");

-- CreateIndex
CREATE INDEX "MeetingAgreement_meetingId_createdAt_id_idx" ON "MeetingAgreement"("meetingId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "MeetingAgreement_createdByUserId_idx" ON "MeetingAgreement"("createdByUserId");

-- CreateIndex
CREATE INDEX "MeetingEvent_meetingId_createdAt_id_idx" ON "MeetingEvent"("meetingId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "MeetingEvent_createdAt_id_idx" ON "MeetingEvent"("createdAt", "id");

-- CreateIndex
CREATE INDEX "MeetingEvent_participantId_idx" ON "MeetingEvent"("participantId");

-- CreateIndex
CREATE INDEX "MeetingEvent_agreementId_idx" ON "MeetingEvent"("agreementId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingEvent_meetingId_version_key" ON "MeetingEvent"("meetingId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingEvent_actorUserId_requestKey_key" ON "MeetingEvent"("actorUserId", "requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "AuditEvent_meetingEventId_key" ON "AuditEvent"("meetingEventId");

-- CreateIndex
CREATE INDEX "FileUpload_meetingId_createdAt_id_idx" ON "FileUpload"("meetingId", "createdAt", "id");

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_meetingEventId_fkey" FOREIGN KEY ("meetingEventId") REFERENCES "MeetingEvent"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "FileUpload" ADD CONSTRAINT "FileUpload_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_processId_fkey" FOREIGN KEY ("processId") REFERENCES "RelationshipProcess"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "MeetingParticipant" ADD CONSTRAINT "MeetingParticipant_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "MeetingParticipant" ADD CONSTRAINT "MeetingParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "MeetingParticipant" ADD CONSTRAINT "MeetingParticipant_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "MeetingParticipant" ADD CONSTRAINT "MeetingParticipant_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "MeetingAgreement" ADD CONSTRAINT "MeetingAgreement_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "MeetingAgreement" ADD CONSTRAINT "MeetingAgreement_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "MeetingEvent" ADD CONSTRAINT "MeetingEvent_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "MeetingEvent" ADD CONSTRAINT "MeetingEvent_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "MeetingParticipant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "MeetingEvent" ADD CONSTRAINT "MeetingEvent_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "MeetingAgreement"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "MeetingEvent" ADD CONSTRAINT "MeetingEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "FileUpload" DROP CONSTRAINT "FileUpload_target_check";
ALTER TABLE "FileUpload" ADD CONSTRAINT "FileUpload_target_check" CHECK (num_nonnulls("processId","communicationId","opportunityId","meetingId")=1);
ALTER TABLE "Meeting"
 ADD CONSTRAINT "Meeting_origin_check" CHECK (num_nonnulls("processId","opportunityId")>0),
 ADD CONSTRAINT "Meeting_version_check" CHECK (version>0),
 ADD CONSTRAINT "Meeting_fingerprint_check" CHECK ("requestFingerprint" ~ '^[0-9a-f]{64}$'),
 ADD CONSTRAINT "Meeting_purpose_check" CHECK (length(btrim(purpose))>0),
 ADD CONSTRAINT "Meeting_modality_check" CHECK ((modality<>'ONLINE' OR location IS NULL) AND (modality<>'IN_PERSON' OR "meetingUrl" IS NULL)),
 ADD CONSTRAINT "Meeting_status_check" CHECK (
  (status='SCHEDULED' AND "completedAt" IS NULL AND "cancelledAt" IS NULL AND "cancellationReason" IS NULL) OR
  (status='COMPLETED' AND "completedAt">="scheduledAt" AND "cancelledAt" IS NULL AND "cancellationReason" IS NULL) OR
  (status='CANCELLED' AND "completedAt" IS NULL AND "cancelledAt" IS NOT NULL AND length(btrim("cancellationReason"))>0));
ALTER TABLE "MeetingParticipant"
 ADD CONSTRAINT "MeetingParticipant_reference_check" CHECK (num_nonnulls("userId","personId")<=1 AND length(btrim("nameSnapshot"))>0);
ALTER TABLE "MeetingAgreement" ADD CONSTRAINT "MeetingAgreement_text_check" CHECK (length(btrim(text))>0);
ALTER TABLE "MeetingEvent"
 ADD CONSTRAINT "MeetingEvent_fingerprint_check" CHECK ("requestFingerprint" ~ '^[0-9a-f]{64}$'),
 ADD CONSTRAINT "MeetingEvent_version_check" CHECK (version>0),
 ADD CONSTRAINT "MeetingEvent_links_check" CHECK (
  (type IN ('PARTICIPANT_ADDED','ATTENDANCE_RECORDED') AND "participantId" IS NOT NULL AND "agreementId" IS NULL) OR
  (type='AGREEMENT_ADDED' AND "agreementId" IS NOT NULL AND "participantId" IS NULL) OR
  (type IN ('CREATED','UPDATED','COMPLETED','CANCELLED') AND "agreementId" IS NULL AND "participantId" IS NULL));
CREATE FUNCTION validate_meeting_origin() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE origin uuid;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name=NEW.timezone) THEN
  RAISE EXCEPTION 'Zona horaria inválida' USING ERRCODE='23514';
 END IF;
 IF NEW."opportunityId" IS NOT NULL THEN
  SELECT "processId" INTO origin FROM "Opportunity" WHERE id=NEW."opportunityId" FOR SHARE;
  IF NEW."processId" IS NOT NULL AND origin IS NOT NULL AND NEW."processId"<>origin THEN
   RAISE EXCEPTION 'Vínculo de reunión incoherente' USING ERRCODE='23514';
  END IF;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF ROW(NEW."processId",NEW."opportunityId",NEW."createdByUserId",NEW."createdAt",NEW."requestKey",NEW."requestFingerprint") IS DISTINCT FROM ROW(OLD."processId",OLD."opportunityId",OLD."createdByUserId",OLD."createdAt",OLD."requestKey",OLD."requestFingerprint") THEN
   RAISE EXCEPTION 'Origen histórico inmutable' USING ERRCODE='23514';
  END IF;
  IF ROW(NEW."scheduledAt",NEW.timezone,NEW.modality,NEW."meetingUrl",NEW.location,NEW.purpose) IS DISTINCT FROM ROW(OLD."scheduledAt",OLD.timezone,OLD.modality,OLD."meetingUrl",OLD.location,OLD.purpose)
   AND (OLD.status<>'SCHEDULED' OR OLD."scheduledAt"<=CURRENT_TIMESTAMP OR NEW."scheduledAt"<=CURRENT_TIMESTAMP) THEN
   RAISE EXCEPTION 'Planificación consolidada inmutable' USING ERRCODE='23514';
  END IF;
  IF OLD.status<>'SCHEDULED' AND ROW(NEW.status,NEW."completedAt",NEW."cancelledAt",NEW."cancellationReason") IS DISTINCT FROM ROW(OLD.status,OLD."completedAt",OLD."cancelledAt",OLD."cancellationReason") THEN
   RAISE EXCEPTION 'Estado consolidado inmutable' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "Meeting_origin_history_check" BEFORE INSERT OR UPDATE ON "Meeting" FOR EACH ROW EXECUTE FUNCTION validate_meeting_origin();
CREATE FUNCTION preserve_meeting_opportunity_origin() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."processId" IS DISTINCT FROM OLD."processId" AND NEW."processId" IS NOT NULL
  AND EXISTS(SELECT 1 FROM "Meeting" WHERE "opportunityId"=OLD.id AND "processId" IS NOT NULL AND "processId"<>NEW."processId") THEN
  RAISE EXCEPTION 'Cambio incompatible con reuniones históricas' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "Opportunity_meetings_origin_check" BEFORE UPDATE ON "Opportunity" FOR EACH ROW EXECUTE FUNCTION preserve_meeting_opportunity_origin();
CREATE FUNCTION preserve_meeting_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Hecho de reunión inmutable' USING ERRCODE='23514'; END $$;
CREATE TRIGGER "MeetingEvent_immutable_check" BEFORE UPDATE ON "MeetingEvent" FOR EACH ROW EXECUTE FUNCTION preserve_meeting_history();
CREATE TRIGGER "MeetingAgreement_immutable_check" BEFORE UPDATE ON "MeetingAgreement" FOR EACH ROW EXECUTE FUNCTION preserve_meeting_history();
CREATE FUNCTION preserve_meeting_participant() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW."meetingId",NEW."userId",NEW."personId",NEW."nameSnapshot",NEW."organizationSnapshot",NEW."roleSnapshot",NEW."createdByUserId",NEW."createdAt") IS DISTINCT FROM ROW(OLD."meetingId",OLD."userId",OLD."personId",OLD."nameSnapshot",OLD."organizationSnapshot",OLD."roleSnapshot",OLD."createdByUserId",OLD."createdAt") THEN
  RAISE EXCEPTION 'Identificación histórica inmutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "MeetingParticipant_immutable_identity_check" BEFORE UPDATE ON "MeetingParticipant" FOR EACH ROW EXECUTE FUNCTION preserve_meeting_participant();
CREATE FUNCTION check_meeting_event_links() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."participantId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "MeetingParticipant" WHERE id=NEW."participantId" AND "meetingId"=NEW."meetingId") THEN RAISE EXCEPTION 'Participante de otra reunión' USING ERRCODE='23514'; END IF;
 IF NEW."agreementId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "MeetingAgreement" WHERE id=NEW."agreementId" AND "meetingId"=NEW."meetingId") THEN RAISE EXCEPTION 'Acuerdo de otra reunión' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "MeetingEvent_links_consistency_check" BEFORE INSERT ON "MeetingEvent" FOR EACH ROW EXECUTE FUNCTION check_meeting_event_links();
DO $$
DECLARE previous_check text;
BEGIN
 SELECT pg_get_expr(conbin,conrelid) INTO STRICT previous_check FROM pg_constraint WHERE conrelid='"AuditEvent"'::regclass AND conname='AuditEvent_action_fields_check';
 ALTER TABLE "AuditEvent" DROP CONSTRAINT "AuditEvent_action_fields_check";
 EXECUTE 'ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_action_fields_check" CHECK ((('||previous_check||') AND "meetingEventId" IS NULL) OR (action=''MEETING_RECORDED'' AND "meetingEventId" IS NOT NULL AND "actorUserId" IS NOT NULL AND "operationId"="meetingEventId"
 AND num_nonnulls("referralId","opportunityEventId","fileUploadId","communicationId","processId","contactRestrictionId","processEventId","contactIntentId","targetUserId","passwordResetTokenId","previousRole","newRole","emailAccountId","organizationId","categoryId","personId","personRelationId","contactMethodId","personContactId","organizationContactId","previousPersonalVerificationMonths","newPersonalVerificationMonths","previousInstitutionalVerificationMonths","newInstitutionalVerificationMonths","duplicateCandidateId","principalOrganizationId","duplicateOrganizationId","principalPersonId","duplicatePersonId")=0))';
END $$;
CREATE FUNCTION check_meeting_audit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE recorded_actor uuid;
BEGIN
 IF NEW."meetingEventId" IS NOT NULL THEN
  SELECT "actorUserId" INTO recorded_actor FROM "MeetingEvent" WHERE id=NEW."meetingEventId";
  IF NEW.action::text IS DISTINCT FROM 'MEETING_RECORDED' OR NEW."actorUserId" IS DISTINCT FROM recorded_actor OR NEW."operationId" IS DISTINCT FROM NEW."meetingEventId" THEN
   RAISE EXCEPTION 'Auditoría de reunión incoherente' USING ERRCODE='23514';
  END IF;
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER "AuditEvent_meeting_consistency_check" BEFORE INSERT OR UPDATE ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION check_meeting_audit();
