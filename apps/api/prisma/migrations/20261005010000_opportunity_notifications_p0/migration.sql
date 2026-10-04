CREATE TYPE "NotificationType" AS ENUM ('OPPORTUNITY_CREATED');
CREATE UNIQUE INDEX "OpportunityEvent_id_opportunityId_type_key" ON "OpportunityEvent" (id, "opportunityId", type);

CREATE TABLE "NotificationDelivery" (
  "sourceEventId" UUID PRIMARY KEY,
  "opportunityId" UUID NOT NULL,
  "sourceType" "OpportunityEventType" NOT NULL DEFAULT 'CREATED',
  "processedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationDelivery_source_type_check" CHECK ("sourceType" = 'CREATED'),
  CONSTRAINT "NotificationDelivery_sourceEventId_opportunityId_sourceType_fkey"
    FOREIGN KEY ("sourceEventId", "opportunityId", "sourceType")
    REFERENCES "OpportunityEvent" (id, "opportunityId", type) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "NotificationDelivery_sourceEventId_opportunityId_key" ON "NotificationDelivery" ("sourceEventId", "opportunityId");
CREATE INDEX "NotificationDelivery_opportunityId_idx" ON "NotificationDelivery" ("opportunityId");

CREATE TABLE "Notification" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "recipientUserId" UUID NOT NULL,
  type "NotificationType" NOT NULL DEFAULT 'OPPORTUNITY_CREATED',
  "sourceEventId" UUID NOT NULL,
  "opportunityId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readAt" TIMESTAMPTZ(3),
  CONSTRAINT "Notification_read_at_check" CHECK ("readAt" IS NULL OR "readAt" >= "createdAt"),
  CONSTRAINT "Notification_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User" (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "Notification_sourceEventId_opportunityId_fkey" FOREIGN KEY ("sourceEventId", "opportunityId")
    REFERENCES "NotificationDelivery" ("sourceEventId", "opportunityId") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "Notification_recipientUserId_sourceEventId_type_key" ON "Notification" ("recipientUserId", "sourceEventId", type);
CREATE INDEX "Notification_recipientUserId_createdAt_id_idx" ON "Notification" ("recipientUserId", "createdAt", id);
CREATE INDEX "Notification_recipientUserId_readAt_idx" ON "Notification" ("recipientUserId", "readAt");
CREATE INDEX "Notification_sourceEventId_opportunityId_idx" ON "Notification" ("sourceEventId", "opportunityId");

CREATE TABLE "NotificationCheckpoint" (
  id VARCHAR(40) PRIMARY KEY,
  "afterCreatedAt" TIMESTAMPTZ(3),
  "afterEventId" UUID,
  "completedSweeps" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationCheckpoint_identity_check" CHECK (id = 'opportunity-created'),
  CONSTRAINT "NotificationCheckpoint_cursor_check" CHECK (("afterCreatedAt" IS NULL) = ("afterEventId" IS NULL)),
  CONSTRAINT "NotificationCheckpoint_sweeps_check" CHECK ("completedSweeps" >= 0)
);

-- La procedencia es inmutable; leer solo modifica readAt, sin tocar el hecho institucional.
CREATE FUNCTION notification_provenance_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id, NEW."recipientUserId", NEW.type, NEW."sourceEventId", NEW."opportunityId", NEW."createdAt")
    IS DISTINCT FROM ROW(OLD.id, OLD."recipientUserId", OLD.type, OLD."sourceEventId", OLD."opportunityId", OLD."createdAt") THEN
    RAISE EXCEPTION 'notification provenance is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Notification_provenance_immutable" BEFORE UPDATE ON "Notification"
  FOR EACH ROW EXECUTE FUNCTION notification_provenance_immutable();
