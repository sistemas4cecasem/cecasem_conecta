-- AlterTable
ALTER TABLE "AuditEvent" ADD COLUMN     "newReminderIntervalDays" INTEGER,
ADD COLUMN     "previousReminderIntervalDays" INTEGER;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "reminderId" UUID,
ALTER COLUMN "sourceEventId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "ReminderSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "intervalDays" INTEGER NOT NULL DEFAULT 7,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReminderSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderOccurrence" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "intentId" UUID,
    "processId" UUID,
    "inactivityAnchorAt" TIMESTAMPTZ(3) NOT NULL,
    "intervalDaysSnapshot" INTEGER NOT NULL,
    "settingsVersionSnapshot" INTEGER NOT NULL,
    "dueAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReminderOccurrence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReminderOccurrence_intentId_inactivityAnchorAt_key" ON "ReminderOccurrence"("intentId", "inactivityAnchorAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReminderOccurrence_processId_inactivityAnchorAt_key" ON "ReminderOccurrence"("processId", "inactivityAnchorAt");

-- CreateIndex
CREATE INDEX "ContactIntent_state_lastActivityAt_id_idx" ON "ContactIntent"("state", "lastActivityAt", "id");

-- CreateIndex
CREATE INDEX "RelationshipProcess_state_lastActivityAt_id_idx" ON "RelationshipProcess"("state", "lastActivityAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_recipientUserId_reminderId_type_key" ON "Notification"("recipientUserId", "reminderId", "type");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_reminderId_fkey" FOREIGN KEY ("reminderId") REFERENCES "ReminderOccurrence"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ReminderOccurrence" ADD CONSTRAINT "ReminderOccurrence_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "ContactIntent"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ReminderOccurrence" ADD CONSTRAINT "ReminderOccurrence_processId_fkey" FOREIGN KEY ("processId") REFERENCES "RelationshipProcess"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Intervalo técnico de hasta 100 años; UTC mediante intervalos de horas, nunca días locales.
ALTER TABLE "ReminderSettings" ADD CONSTRAINT "ReminderSettings_values_check" CHECK (id=1 AND "intervalDays" BETWEEN 1 AND 36500 AND version>0);
INSERT INTO "ReminderSettings" (id) VALUES (1);
ALTER TABLE "ReminderOccurrence" ADD CONSTRAINT "ReminderOccurrence_context_check" CHECK (num_nonnulls("intentId","processId")=1),
 ADD CONSTRAINT "ReminderOccurrence_dates_check" CHECK ("intervalDaysSnapshot" BETWEEN 1 AND 36500 AND "settingsVersionSnapshot">0 AND "dueAt"="inactivityAnchorAt" + "intervalDaysSnapshot" * interval '24 hours' AND "createdAt">="dueAt");
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_context_check";
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_context_check" CHECK (
 ("reminderId" IS NOT NULL AND "sourceEventId" IS NULL AND "opportunityId" IS NULL AND "meetingId" IS NULL AND type IN ('INTENT_INACTIVITY_REMINDER','PROCESS_INACTIVITY_REMINDER'))
 OR ("reminderId" IS NULL AND "sourceEventId" IS NOT NULL AND (
 ("opportunityId" IS NOT NULL AND "meetingId" IS NULL AND type IN ('OPPORTUNITY_CREATED','OPPORTUNITY_DISCARDED','OPPORTUNITY_FINISHED'))
 OR ("meetingId" IS NOT NULL AND "opportunityId" IS NULL AND type IN ('MEETING_CREATED','MEETING_CANCELLED','MEETING_COMPLETED','MEETING_PARTICIPANT_ADDED','MEETING_RESCHEDULED')))));
CREATE OR REPLACE FUNCTION notification_provenance_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.id,NEW."recipientUserId",NEW.type,NEW."sourceEventId",NEW."opportunityId",NEW."meetingId",NEW."reminderId",NEW."createdAt") IS DISTINCT FROM ROW(OLD.id,OLD."recipientUserId",OLD.type,OLD."sourceEventId",OLD."opportunityId",OLD."meetingId",OLD."reminderId",OLD."createdAt") THEN
 RAISE EXCEPTION 'notification provenance is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION reminder_occurrence_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE anchor TIMESTAMPTZ; eligible BOOLEAN;
BEGIN
 IF TG_OP='UPDATE' THEN
 IF NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'reminder occurrence is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW; END IF;
 IF NEW."intentId" IS NOT NULL THEN
 SELECT "lastActivityAt", state='ACTIVE' INTO anchor,eligible FROM "ContactIntent" WHERE id=NEW."intentId" FOR UPDATE;
 ELSE
 SELECT "lastActivityAt", state<>'CLOSED' INTO anchor,eligible FROM "RelationshipProcess" WHERE id=NEW."processId" FOR UPDATE;
 END IF;
 IF NOT COALESCE(eligible,false) OR anchor IS DISTINCT FROM NEW."inactivityAnchorAt" THEN RAISE EXCEPTION 'ineligible reminder cycle' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "ReminderOccurrence_integrity" BEFORE INSERT OR UPDATE ON "ReminderOccurrence" FOR EACH ROW EXECUTE FUNCTION reminder_occurrence_integrity();
DO $$
DECLARE previous_check TEXT;
BEGIN
 SELECT pg_get_expr(conbin,conrelid) INTO STRICT previous_check FROM pg_constraint WHERE conrelid='"AuditEvent"'::regclass AND conname='AuditEvent_action_fields_check';
 ALTER TABLE "AuditEvent" DROP CONSTRAINT "AuditEvent_action_fields_check";
 EXECUTE 'ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_action_fields_check" CHECK (((' || previous_check || ') AND "previousReminderIntervalDays" IS NULL AND "newReminderIntervalDays" IS NULL) OR (action=''REMINDER_INTERVAL_UPDATED'' AND "actorUserId" IS NOT NULL AND "operationId" IS NOT NULL AND "previousReminderIntervalDays" IS NOT NULL AND "newReminderIntervalDays" IS NOT NULL AND "previousReminderIntervalDays" BETWEEN 1 AND 36500 AND "newReminderIntervalDays" BETWEEN 1 AND 36500 AND "previousReminderIntervalDays"<>"newReminderIntervalDays" AND num_nonnulls("meetingEventId","referralId","opportunityEventId","fileUploadId","communicationId","processId","contactRestrictionId","processEventId","contactIntentId","targetUserId","passwordResetTokenId","previousRole","newRole","emailAccountId","organizationId","categoryId","personId","personRelationId","contactMethodId","personContactId","organizationContactId","previousPersonalVerificationMonths","newPersonalVerificationMonths","previousInstitutionalVerificationMonths","newInstitutionalVerificationMonths","duplicateCandidateId","principalOrganizationId","duplicateOrganizationId","principalPersonId","duplicatePersonId")=0))';
END $$;
CREATE OR REPLACE FUNCTION notification_source_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE receipt "NotificationDelivery"%ROWTYPE; expected_type TEXT; invited UUID; occurrence "ReminderOccurrence"%ROWTYPE;
BEGIN
  IF NEW."reminderId" IS NOT NULL THEN
    SELECT * INTO occurrence FROM "ReminderOccurrence" WHERE id=NEW."reminderId";
    IF NOT FOUND THEN RAISE EXCEPTION 'reminder missing' USING ERRCODE='23503'; END IF;
    IF NEW.type::text IS DISTINCT FROM (CASE WHEN occurrence."intentId" IS NOT NULL THEN 'INTENT_INACTIVITY_REMINDER' ELSE 'PROCESS_INACTIVITY_REMINDER' END) THEN RAISE EXCEPTION 'reminder type mismatch' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  SELECT * INTO receipt FROM "NotificationDelivery" WHERE "sourceEventId"=NEW."sourceEventId";
  IF NOT FOUND THEN RAISE EXCEPTION 'notification receipt missing' USING ERRCODE = '23503'; END IF;
  expected_type := CASE
    WHEN receipt."sourceType"='CREATED' THEN 'OPPORTUNITY_CREATED'
    WHEN receipt."sourceType"='DISCARDED' THEN 'OPPORTUNITY_DISCARDED'
    WHEN receipt."sourceType"='FINISHED' THEN 'OPPORTUNITY_FINISHED'
    WHEN receipt."meetingSourceType"='CREATED' THEN 'MEETING_CREATED'
    WHEN receipt."meetingSourceType"='CANCELLED' THEN 'MEETING_CANCELLED'
    WHEN receipt."meetingSourceType"='COMPLETED' THEN 'MEETING_COMPLETED'
    WHEN receipt."meetingSourceType"='PARTICIPANT_ADDED' THEN 'MEETING_PARTICIPANT_ADDED'
    WHEN receipt."meetingSourceType"='UPDATED' THEN 'MEETING_RESCHEDULED' END;
  IF NEW.type::text IS DISTINCT FROM expected_type OR NEW."opportunityId" IS DISTINCT FROM receipt."opportunityId" OR NEW."meetingId" IS DISTINCT FROM receipt."meetingId" THEN
    RAISE EXCEPTION 'notification source mismatch' USING ERRCODE = '23514';
  END IF;
  IF NEW.type='MEETING_PARTICIPANT_ADDED' THEN
    SELECT p."userId" INTO invited FROM "MeetingEvent" e JOIN "MeetingParticipant" p ON p.id=e."participantId" WHERE e.id=NEW."sourceEventId";
    IF NEW."recipientUserId" IS DISTINCT FROM invited THEN RAISE EXCEPTION 'notification invitation mismatch' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
