-- Amplía el sistema existente sin cambiar avisos, recibos ni checkpoints históricos.
ALTER TABLE "NotificationDelivery" ADD COLUMN "processId" UUID;
ALTER TABLE "Notification" ADD COLUMN "processId" UUID;
CREATE UNIQUE INDEX "RelationshipProcessEvent_id_processId_key" ON "RelationshipProcessEvent" (id,"processId");
CREATE INDEX "RelationshipProcessEvent_createdAt_id_idx" ON "RelationshipProcessEvent" ("createdAt",id);
CREATE INDEX "NotificationDelivery_processId_idx" ON "NotificationDelivery" ("processId");
CREATE INDEX "Notification_processId_idx" ON "Notification" ("processId");
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_sourceEventId_processId_fkey"
  FOREIGN KEY ("sourceEventId","processId") REFERENCES "RelationshipProcessEvent" (id,"processId") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_processId_fkey"
  FOREIGN KEY ("processId") REFERENCES "RelationshipProcess" (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "NotificationDelivery" DROP CONSTRAINT "NotificationDelivery_context_check";
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_context_check" CHECK (
  ("processId" IS NOT NULL AND "opportunityId" IS NULL AND "sourceType" IS NULL AND "meetingId" IS NULL AND "meetingSourceType" IS NULL)
  OR ("processId" IS NULL AND (
    ("opportunityId" IS NOT NULL AND "sourceType" IS NOT NULL AND "sourceType" IN ('CREATED','DISCARDED','FINISHED') AND "meetingId" IS NULL AND "meetingSourceType" IS NULL)
    OR ("meetingId" IS NOT NULL AND "meetingSourceType" IS NOT NULL AND "meetingSourceType" IN ('CREATED','UPDATED','COMPLETED','CANCELLED','PARTICIPANT_ADDED') AND "opportunityId" IS NULL AND "sourceType" IS NULL)))
);
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_context_check";
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_context_check" CHECK (
  num_nonnulls("reminderId","processId","opportunityId","meetingId")=1 AND (
    ("reminderId" IS NOT NULL AND "sourceEventId" IS NULL AND type IN ('INTENT_INACTIVITY_REMINDER','PROCESS_INACTIVITY_REMINDER'))
    OR ("reminderId" IS NULL AND "sourceEventId" IS NOT NULL AND (
      ("processId" IS NOT NULL AND type='PROCESS_ACHIEVED')
      OR ("opportunityId" IS NOT NULL AND type IN ('OPPORTUNITY_CREATED','OPPORTUNITY_DISCARDED','OPPORTUNITY_FINISHED'))
      OR ("meetingId" IS NOT NULL AND type IN ('MEETING_CREATED','MEETING_CANCELLED','MEETING_COMPLETED','MEETING_PARTICIPANT_ADDED','MEETING_RESCHEDULED'))
    ))
  )
);
ALTER TABLE "NotificationCheckpoint" DROP CONSTRAINT "NotificationCheckpoint_identity_check";
ALTER TABLE "NotificationCheckpoint" ADD CONSTRAINT "NotificationCheckpoint_identity_check" CHECK (id IN ('opportunity-created','meeting-activity','process-achieved'));
CREATE OR REPLACE FUNCTION notification_provenance_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id,NEW."recipientUserId",NEW.type,NEW."sourceEventId",NEW."opportunityId",NEW."meetingId",NEW."reminderId",NEW."processId",NEW."createdAt")
    IS DISTINCT FROM ROW(OLD.id,OLD."recipientUserId",OLD.type,OLD."sourceEventId",OLD."opportunityId",OLD."meetingId",OLD."reminderId",OLD."processId",OLD."createdAt") THEN
    RAISE EXCEPTION 'notification provenance is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION notification_delivery_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE changes JSONB; internal_user UUID;
BEGIN
  IF TG_OP='UPDATE' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'notification receipt is immutable' USING ERRCODE='23514';
  END IF;
  IF NEW."processId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "RelationshipProcessEvent" e WHERE e.id=NEW."sourceEventId" AND e."processId"=NEW."processId" AND e.type='CLOSED' AND e."newState"='CLOSED' AND e.result='ACHIEVED'
  ) THEN RAISE EXCEPTION 'process source is not achieved closure' USING ERRCODE='23514'; END IF;
  IF NEW."meetingSourceType"='UPDATED' THEN
    SELECT e.changes INTO changes FROM "MeetingEvent" e WHERE e.id=NEW."sourceEventId";
    IF NOT EXISTS (SELECT 1 FROM unnest(ARRAY['scheduledAt','timezone','modality','meetingUrl','location']) AS f
      WHERE (changes->'previous') ? f AND (changes->'next') ? f AND changes->'previous'->f IS DISTINCT FROM changes->'next'->f) THEN
      RAISE EXCEPTION 'meeting change is not material' USING ERRCODE='23514'; END IF;
  END IF;
  IF NEW."meetingSourceType"='PARTICIPANT_ADDED' THEN
    SELECT p."userId" INTO internal_user FROM "MeetingEvent" e JOIN "MeetingParticipant" p ON p.id=e."participantId" WHERE e.id=NEW."sourceEventId";
    IF internal_user IS NULL THEN RAISE EXCEPTION 'meeting participant is not internal' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
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
  IF NOT FOUND THEN RAISE EXCEPTION 'notification receipt missing' USING ERRCODE='23503'; END IF;
  expected_type := CASE
    WHEN receipt."processId" IS NOT NULL THEN 'PROCESS_ACHIEVED'
    WHEN receipt."sourceType"='CREATED' THEN 'OPPORTUNITY_CREATED'
    WHEN receipt."sourceType"='DISCARDED' THEN 'OPPORTUNITY_DISCARDED'
    WHEN receipt."sourceType"='FINISHED' THEN 'OPPORTUNITY_FINISHED'
    WHEN receipt."meetingSourceType"='CREATED' THEN 'MEETING_CREATED'
    WHEN receipt."meetingSourceType"='CANCELLED' THEN 'MEETING_CANCELLED'
    WHEN receipt."meetingSourceType"='COMPLETED' THEN 'MEETING_COMPLETED'
    WHEN receipt."meetingSourceType"='PARTICIPANT_ADDED' THEN 'MEETING_PARTICIPANT_ADDED'
    WHEN receipt."meetingSourceType"='UPDATED' THEN 'MEETING_RESCHEDULED' END;
  IF NEW.type::text IS DISTINCT FROM expected_type OR NEW."opportunityId" IS DISTINCT FROM receipt."opportunityId" OR NEW."meetingId" IS DISTINCT FROM receipt."meetingId" OR NEW."processId" IS DISTINCT FROM receipt."processId" THEN
    RAISE EXCEPTION 'notification source mismatch' USING ERRCODE='23514'; END IF;
  IF NEW.type='MEETING_PARTICIPANT_ADDED' THEN
    SELECT p."userId" INTO invited FROM "MeetingEvent" e JOIN "MeetingParticipant" p ON p.id=e."participantId" WHERE e.id=NEW."sourceEventId";
    IF NEW."recipientUserId" IS DISTINCT FROM invited THEN RAISE EXCEPTION 'notification invitation mismatch' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
