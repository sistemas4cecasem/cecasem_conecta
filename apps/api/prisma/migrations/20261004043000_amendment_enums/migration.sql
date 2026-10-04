-- CreateEnum
CREATE TYPE "CommunicationAmendmentType" AS ENUM ('CORRECTION', 'ANNOTATION', 'INVALIDATION');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'COMMUNICATION_INVALIDATED';

-- AlterEnum
ALTER TYPE "CommunicationValidity" ADD VALUE 'INVALIDATED';


