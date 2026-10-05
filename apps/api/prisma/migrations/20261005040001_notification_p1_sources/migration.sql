-- Conserva todos los avisos y recibos P0; amplía el mismo sistema a reuniones.
ALTER TABLE "NotificationDelivery"
  ALTER COLUMN "opportunityId" DROP NOT NULL,
  ALTER COLUMN "sourceType" DROP NOT NULL,
  ADD COLUMN "meetingId" UUID,
  ADD COLUMN "meetingSourceType" "MeetingEventType",
  DROP CONSTRAINT "NotificationDelivery_source_type_check";
CREATE UNIQUE INDEX "MeetingEvent_id_meetingId_type_key" ON "MeetingEvent" (id, "meetingId", type);
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_sourceEventId_meetingId_meetingSourceType_fkey"
  FOREIGN KEY ("sourceEventId", "meetingId", "meetingSourceType") REFERENCES "MeetingEvent" (id, "meetingId", type) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_context_check" CHECK (
  ("opportunityId" IS NOT NULL AND "sourceType" IS NOT NULL AND "sourceType" IN ('CREATED','DISCARDED','FINISHED') AND "meetingId" IS NULL AND "meetingSourceType" IS NULL)
  OR ("meetingId" IS NOT NULL AND "meetingSourceType" IS NOT NULL AND "meetingSourceType" IN ('CREATED','UPDATED','COMPLETED','CANCELLED','PARTICIPANT_ADDED') AND "opportunityId" IS NULL AND "sourceType" IS NULL)
);
CREATE INDEX "NotificationDelivery_meetingId_idx" ON "NotificationDelivery" ("meetingId");

ALTER TABLE "Notification" ALTER COLUMN "opportunityId" DROP NOT NULL, ADD COLUMN "meetingId" UUID,
  DROP CONSTRAINT "Notification_sourceEventId_opportunityId_fkey";
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_sourceEventId_fkey" FOREIGN KEY ("sourceEventId") REFERENCES "NotificationDelivery" ("sourceEventId") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_context_check" CHECK (
  ("opportunityId" IS NOT NULL AND "meetingId" IS NULL AND type IN ('OPPORTUNITY_CREATED','OPPORTUNITY_DISCARDED','OPPORTUNITY_FINISHED'))
  OR ("meetingId" IS NOT NULL AND "opportunityId" IS NULL AND type IN ('MEETING_CREATED','MEETING_CANCELLED','MEETING_COMPLETED','MEETING_PARTICIPANT_ADDED','MEETING_RESCHEDULED'))
);
CREATE INDEX "Notification_meetingId_idx" ON "Notification" ("meetingId");
ALTER TABLE "NotificationCheckpoint" DROP CONSTRAINT "NotificationCheckpoint_identity_check";
ALTER TABLE "NotificationCheckpoint" ADD CONSTRAINT "NotificationCheckpoint_identity_check" CHECK (id IN ('opportunity-created','meeting-activity'));

CREATE OR REPLACE FUNCTION notification_provenance_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id, NEW."recipientUserId", NEW.type, NEW."sourceEventId", NEW."opportunityId", NEW."meetingId", NEW."createdAt")
    IS DISTINCT FROM ROW(OLD.id, OLD."recipientUserId", OLD.type, OLD."sourceEventId", OLD."opportunityId", OLD."meetingId", OLD."createdAt") THEN
    RAISE EXCEPTION 'notification provenance is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE FUNCTION notification_delivery_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE changes JSONB; internal_user UUID;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'notification receipt is immutable' USING ERRCODE = '23514';
  END IF;
  IF NEW."meetingSourceType" = 'UPDATED' THEN
    SELECT e.changes INTO changes FROM "MeetingEvent" e WHERE e.id = NEW."sourceEventId";
    IF NOT EXISTS (SELECT 1 FROM unnest(ARRAY['scheduledAt','timezone','modality','meetingUrl','location']) AS f
      WHERE (changes->'previous') ? f AND (changes->'next') ? f AND changes->'previous'->f IS DISTINCT FROM changes->'next'->f) THEN
      RAISE EXCEPTION 'meeting change is not material' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW."meetingSourceType" = 'PARTICIPANT_ADDED' THEN
    SELECT p."userId" INTO internal_user FROM "MeetingEvent" e JOIN "MeetingParticipant" p ON p.id=e."participantId" WHERE e.id=NEW."sourceEventId";
    IF internal_user IS NULL THEN RAISE EXCEPTION 'meeting participant is not internal' USING ERRCODE = '23514'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "NotificationDelivery_integrity" BEFORE INSERT OR UPDATE ON "NotificationDelivery" FOR EACH ROW EXECUTE FUNCTION notification_delivery_integrity();

CREATE FUNCTION notification_source_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE receipt "NotificationDelivery"%ROWTYPE; expected_type TEXT; invited UUID;
BEGIN
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
CREATE TRIGGER "Notification_source_integrity" BEFORE INSERT ON "Notification" FOR EACH ROW EXECUTE FUNCTION notification_source_integrity();
