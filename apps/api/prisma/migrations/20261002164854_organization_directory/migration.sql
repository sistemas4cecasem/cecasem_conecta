-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'ORGANIZATION_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'ORGANIZATION_STATUS_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE 'CATEGORY_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'CATEGORY_STATUS_CHANGED';

-- AlterTable
ALTER TABLE "AuditEvent" ADD COLUMN     "categoryId" UUID,
ADD COLUMN     "operationId" UUID,
ADD COLUMN     "organizationId" UUID,
ALTER COLUMN "targetUserId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "Organization" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(250) NOT NULL,
    "country" VARCHAR(150),
    "alias" VARCHAR(150),
    "description" VARCHAR(5000),
    "officialWebsite" VARCHAR(2048),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "parentId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastVerifiedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(150) NOT NULL,
    "normalizedName" VARCHAR(150) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationCategory" (
    "organizationId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,

    CONSTRAINT "OrganizationCategory_pkey" PRIMARY KEY ("organizationId","categoryId")
);

-- CreateTable
CREATE TABLE "DirectoryChange" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID,
    "categoryId" UUID,
    "operationId" UUID NOT NULL,
    "field" VARCHAR(32) NOT NULL,
    "previousValue" JSONB NOT NULL,
    "newValue" JSONB NOT NULL,
    "actorUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DirectoryChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Organization_parentId_name_id_idx" ON "Organization"("parentId", "name", "id");

-- CreateIndex
CREATE INDEX "Organization_isActive_name_id_idx" ON "Organization"("isActive", "name", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Category_normalizedName_key" ON "Category"("normalizedName");

-- CreateIndex
CREATE INDEX "Category_isActive_name_id_idx" ON "Category"("isActive", "name", "id");

-- CreateIndex
CREATE INDEX "OrganizationCategory_categoryId_idx" ON "OrganizationCategory"("categoryId");

-- CreateIndex
CREATE INDEX "DirectoryChange_organizationId_createdAt_id_idx" ON "DirectoryChange"("organizationId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "DirectoryChange_categoryId_createdAt_id_idx" ON "DirectoryChange"("categoryId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "DirectoryChange_actorUserId_idx" ON "DirectoryChange"("actorUserId");

-- CreateIndex
CREATE UNIQUE INDEX "DirectoryChange_operationId_field_key" ON "DirectoryChange"("operationId", "field");

-- CreateIndex
CREATE INDEX "AuditEvent_organizationId_createdAt_idx" ON "AuditEvent"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_categoryId_createdAt_idx" ON "AuditEvent"("categoryId", "createdAt");

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "OrganizationCategory" ADD CONSTRAINT "OrganizationCategory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "OrganizationCategory" ADD CONSTRAINT "OrganizationCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "DirectoryChange" ADD CONSTRAINT "DirectoryChange_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "DirectoryChange" ADD CONSTRAINT "DirectoryChange_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "DirectoryChange" ADD CONSTRAINT "DirectoryChange_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
