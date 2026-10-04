-- Un límite superior persistido mantiene finito el barrido aunque sigan llegando hechos.
ALTER TABLE "NotificationCheckpoint"
  ADD COLUMN "throughCreatedAt" TIMESTAMPTZ(3),
  ADD COLUMN "throughEventId" UUID,
  ADD CONSTRAINT "NotificationCheckpoint_bound_check" CHECK (("throughCreatedAt" IS NULL) = ("throughEventId" IS NULL));
