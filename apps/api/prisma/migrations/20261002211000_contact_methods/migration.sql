-- CreateEnum
CREATE TYPE "ContactType" AS ENUM ('EMAIL', 'PHONE', 'LINKEDIN', 'FORM', 'WEB', 'OTHER');

-- CreateEnum
CREATE TYPE "ContactCondition" AS ENUM ('USABLE', 'UNUSABLE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'CONTACT_METHOD_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'CONTACT_METHOD_CONDITION_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE 'CONTACT_ASSOCIATION_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'CONTACT_ASSOCIATION_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'CONTACT_ASSOCIATION_ENDED';
ALTER TYPE "AuditAction" ADD VALUE 'CONTACT_ASSOCIATION_STATUS_CHANGED';

-- AlterTable
ALTER TABLE "AuditEvent" ADD COLUMN     "contactMethodId" UUID,
ADD COLUMN     "organizationContactId" UUID,
ADD COLUMN     "personContactId" UUID;

-- AlterTable
ALTER TABLE "DirectoryChange" ADD COLUMN     "contactMethodId" UUID,
ADD COLUMN     "organizationContactId" UUID,
ADD COLUMN     "personContactId" UUID;

-- CreateTable
CREATE TABLE "ContactMethod" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" "ContactType" NOT NULL,
    "value" VARCHAR(2048) NOT NULL,
    "normalizedValue" VARCHAR(254),
    "label" VARCHAR(150),
    "condition" "ContactCondition" NOT NULL DEFAULT 'USABLE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonContact" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "personId" UUID NOT NULL,
    "contactMethodId" UUID NOT NULL,
    "sourceDescription" VARCHAR(1000),
    "sourceUrl" VARCHAR(2048),
    "notes" VARCHAR(5000),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastVerifiedAt" TIMESTAMPTZ(3),

    CONSTRAINT "PersonContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationContact" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "contactMethodId" UUID NOT NULL,
    "sourceDescription" VARCHAR(1000),
    "sourceUrl" VARCHAR(2048),
    "notes" VARCHAR(5000),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastVerifiedAt" TIMESTAMPTZ(3),

    CONSTRAINT "OrganizationContact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContactMethod_type_createdAt_id_idx" ON "ContactMethod"("type", "createdAt", "id");

-- CreateIndex
CREATE INDEX "PersonContact_personId_isActive_createdAt_id_idx" ON "PersonContact"("personId", "isActive", "createdAt", "id");

-- CreateIndex
CREATE INDEX "PersonContact_contactMethodId_createdAt_id_idx" ON "PersonContact"("contactMethodId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PersonContact_personId_contactMethodId_key" ON "PersonContact"("personId", "contactMethodId");

-- CreateIndex
CREATE INDEX "OrganizationContact_organizationId_isActive_createdAt_id_idx" ON "OrganizationContact"("organizationId", "isActive", "createdAt", "id");

-- CreateIndex
CREATE INDEX "OrganizationContact_contactMethodId_createdAt_id_idx" ON "OrganizationContact"("contactMethodId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationContact_organizationId_contactMethodId_key" ON "OrganizationContact"("organizationId", "contactMethodId");

-- CreateIndex
CREATE INDEX "AuditEvent_contactMethodId_createdAt_idx" ON "AuditEvent"("contactMethodId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_personContactId_createdAt_idx" ON "AuditEvent"("personContactId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_organizationContactId_createdAt_idx" ON "AuditEvent"("organizationContactId", "createdAt");

-- CreateIndex
CREATE INDEX "DirectoryChange_contactMethodId_createdAt_id_idx" ON "DirectoryChange"("contactMethodId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "DirectoryChange_personContactId_createdAt_id_idx" ON "DirectoryChange"("personContactId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "DirectoryChange_organizationContactId_createdAt_id_idx" ON "DirectoryChange"("organizationContactId", "createdAt", "id");

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_contactMethodId_fkey" FOREIGN KEY ("contactMethodId") REFERENCES "ContactMethod"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_personContactId_fkey" FOREIGN KEY ("personContactId") REFERENCES "PersonContact"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_organizationContactId_fkey" FOREIGN KEY ("organizationContactId") REFERENCES "OrganizationContact"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "DirectoryChange" ADD CONSTRAINT "DirectoryChange_contactMethodId_fkey" FOREIGN KEY ("contactMethodId") REFERENCES "ContactMethod"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "DirectoryChange" ADD CONSTRAINT "DirectoryChange_personContactId_fkey" FOREIGN KEY ("personContactId") REFERENCES "PersonContact"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "DirectoryChange" ADD CONSTRAINT "DirectoryChange_organizationContactId_fkey" FOREIGN KEY ("organizationContactId") REFERENCES "OrganizationContact"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PersonContact" ADD CONSTRAINT "PersonContact_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PersonContact" ADD CONSTRAINT "PersonContact_contactMethodId_fkey" FOREIGN KEY ("contactMethodId") REFERENCES "ContactMethod"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "OrganizationContact" ADD CONSTRAINT "OrganizationContact_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "OrganizationContact" ADD CONSTRAINT "OrganizationContact_contactMethodId_fkey" FOREIGN KEY ("contactMethodId") REFERENCES "ContactMethod"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
