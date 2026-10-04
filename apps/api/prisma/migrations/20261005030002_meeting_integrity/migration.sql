-- CHECK debe rechazar NULL de forma explícita en resultados consolidados.
ALTER TABLE "Meeting" DROP CONSTRAINT "Meeting_status_check";
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_status_check" CHECK (
 (status='SCHEDULED' AND "completedAt" IS NULL AND "cancelledAt" IS NULL AND "cancellationReason" IS NULL) OR
 (status='COMPLETED' AND "completedAt" IS NOT NULL AND "completedAt">="scheduledAt" AND "cancelledAt" IS NULL AND "cancellationReason" IS NULL) OR
 (status='CANCELLED' AND "completedAt" IS NULL AND "cancelledAt" IS NOT NULL AND "cancellationReason" IS NOT NULL AND length(btrim("cancellationReason"))>0));
ALTER TABLE "MeetingEvent" ADD CONSTRAINT "MeetingEvent_json_check" CHECK (jsonb_typeof(snapshot)='object' AND jsonb_typeof(changes)='object');
