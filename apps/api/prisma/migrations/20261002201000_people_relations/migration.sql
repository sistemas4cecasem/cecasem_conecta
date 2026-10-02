-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'PERSON_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'PERSON_STATUS_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE 'PERSON_RELATION_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'PERSON_RELATION_ENDED';

-- AlterTable
ALTER TABLE "AuditEvent" ADD COLUMN     "personId" UUID,
ADD COLUMN     "personRelationId" UUID;

-- AlterTable
ALTER TABLE "DirectoryChange" ADD COLUMN     "personId" UUID,
ADD COLUMN     "personRelationId" UUID;

-- CreateTable
CREATE TABLE "Person" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "displayName" VARCHAR(250) NOT NULL,
    "givenNames" VARCHAR(150),
    "familyNames" VARCHAR(150),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastVerifiedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonOrganizationRelation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "personId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "positionTitle" VARCHAR(250),
    "area" VARCHAR(250),
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "startDate" DATE,
    "endDate" DATE,
    "sourceDescription" VARCHAR(1000),
    "sourceUrl" VARCHAR(2048),
    "notes" VARCHAR(5000),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonOrganizationRelation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Person_isActive_displayName_id_idx" ON "Person"("isActive", "displayName", "id");

-- CreateIndex
CREATE INDEX "PersonOrganizationRelation_personId_isCurrent_createdAt_id_idx" ON "PersonOrganizationRelation"("personId", "isCurrent", "createdAt", "id");

-- CreateIndex
CREATE INDEX "PersonOrganizationRelation_organizationId_isCurrent_created_idx" ON "PersonOrganizationRelation"("organizationId", "isCurrent", "createdAt", "id");

-- CreateIndex
CREATE INDEX "AuditEvent_personId_createdAt_idx" ON "AuditEvent"("personId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_personRelationId_createdAt_idx" ON "AuditEvent"("personRelationId", "createdAt");

-- CreateIndex
CREATE INDEX "DirectoryChange_personId_createdAt_id_idx" ON "DirectoryChange"("personId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "DirectoryChange_personRelationId_createdAt_id_idx" ON "DirectoryChange"("personRelationId", "createdAt", "id");

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_personRelationId_fkey" FOREIGN KEY ("personRelationId") REFERENCES "PersonOrganizationRelation"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "DirectoryChange" ADD CONSTRAINT "DirectoryChange_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "DirectoryChange" ADD CONSTRAINT "DirectoryChange_personRelationId_fkey" FOREIGN KEY ("personRelationId") REFERENCES "PersonOrganizationRelation"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PersonOrganizationRelation" ADD CONSTRAINT "PersonOrganizationRelation_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PersonOrganizationRelation" ADD CONSTRAINT "PersonOrganizationRelation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
