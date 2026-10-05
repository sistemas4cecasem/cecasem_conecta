-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'REMINDER_INTERVAL_UPDATED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'INTENT_INACTIVITY_REMINDER';
ALTER TYPE "NotificationType" ADD VALUE 'PROCESS_INACTIVITY_REMINDER';

