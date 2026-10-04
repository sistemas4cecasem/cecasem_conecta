-- CreateEnum
CREATE TYPE "RestrictionState" AS ENUM ('ACTIVE', 'LIFTED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.



-- AlterTable
ALTER TABLE "AuditEvent" ADD COLUMN     "contactRestrictionId" UUID;

-- CreateTable
CREATE TABLE "ContactRestriction" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID,
    "personId" UUID,
    "reason" VARCHAR(5000) NOT NULL,
    "state" "RestrictionState" NOT NULL DEFAULT 'ACTIVE',
    "registeredByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "liftedAt" TIMESTAMPTZ(3),
    "liftedByUserId" UUID,
    "liftReason" VARCHAR(5000),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ContactRestriction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContactRestriction_organizationId_state_createdAt_id_idx" ON "ContactRestriction"("organizationId", "state", "createdAt", "id");

-- CreateIndex
CREATE INDEX "ContactRestriction_personId_state_createdAt_id_idx" ON "ContactRestriction"("personId", "state", "createdAt", "id");

-- CreateIndex
CREATE INDEX "ContactRestriction_state_createdAt_id_idx" ON "ContactRestriction"("state", "createdAt", "id");

-- CreateIndex
CREATE INDEX "ContactRestriction_registeredByUserId_idx" ON "ContactRestriction"("registeredByUserId");

-- CreateIndex
CREATE INDEX "ContactRestriction_liftedByUserId_idx" ON "ContactRestriction"("liftedByUserId");

-- CreateIndex
CREATE INDEX "AuditEvent_contactRestrictionId_createdAt_idx" ON "AuditEvent"("contactRestrictionId", "createdAt");

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_contactRestrictionId_fkey" FOREIGN KEY ("contactRestrictionId") REFERENCES "ContactRestriction"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ContactRestriction" ADD CONSTRAINT "ContactRestriction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ContactRestriction" ADD CONSTRAINT "ContactRestriction_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ContactRestriction" ADD CONSTRAINT "ContactRestriction_registeredByUserId_fkey" FOREIGN KEY ("registeredByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ContactRestriction" ADD CONSTRAINT "ContactRestriction_liftedByUserId_fkey" FOREIGN KEY ("liftedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "ContactRestriction"
 ADD CONSTRAINT "ContactRestriction_target_check" CHECK (num_nonnulls("organizationId", "personId") = 1),
 ADD CONSTRAINT "ContactRestriction_reason_check" CHECK (length(regexp_replace(reason, '[[:space:]]', '', 'g')) > 0),
 ADD CONSTRAINT "ContactRestriction_version_check" CHECK (version > 0),
 ADD CONSTRAINT "ContactRestriction_dates_check" CHECK ("updatedAt" >= "createdAt"),
 ADD CONSTRAINT "ContactRestriction_lift_check" CHECK (
  (state = 'ACTIVE' AND num_nonnulls("liftedAt", "liftedByUserId", "liftReason") = 0)
  OR (state = 'LIFTED' AND "liftedAt" IS NOT NULL AND "liftedByUserId" IS NOT NULL AND "liftReason" IS NOT NULL
      AND version > 1 AND "liftedAt" >= "createdAt" AND "updatedAt" >= "liftedAt"
      AND length(regexp_replace("liftReason", '[[:space:]]', '', 'g')) > 0));
CREATE UNIQUE INDEX "ContactRestriction_active_organization_key" ON "ContactRestriction"("organizationId") WHERE state = 'ACTIVE';
CREATE UNIQUE INDEX "ContactRestriction_active_person_key" ON "ContactRestriction"("personId") WHERE state = 'ACTIVE';
ALTER TABLE "AuditEvent" DROP CONSTRAINT "AuditEvent_action_fields_check";
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_action_fields_check" CHECK (((((((((
  ((
  (("contactMethodId" IS NULL AND "personContactId" IS NULL AND "organizationContactId" IS NULL) AND (
  ("personId" IS NULL AND "personRelationId" IS NULL AND (

  ("targetUserId" IS NOT NULL AND "organizationId" IS NULL AND "categoryId" IS NULL AND "operationId" IS NULL
    AND (
      (action IN ('PASSWORD_RESET_ISSUED','PASSWORD_RESET_REGENERATED','PASSWORD_RESET_COMPLETED','PASSWORD_RESET_REVOKED')
        AND "passwordResetTokenId" IS NOT NULL AND "emailAccountId" IS NULL AND "previousRole" IS NULL AND "newRole" IS NULL
        AND ((action = 'PASSWORD_RESET_COMPLETED' AND "actorUserId" IS NULL)
          OR (action IN ('PASSWORD_RESET_ISSUED','PASSWORD_RESET_REGENERATED') AND "actorUserId" IS NOT NULL)
          OR action = 'PASSWORD_RESET_REVOKED'))
      OR (action = 'USER_ROLE_CHANGED' AND "actorUserId" IS NOT NULL
        AND "previousRole" IS NOT NULL AND "newRole" IS NOT NULL AND "previousRole" <> "newRole"
        AND "passwordResetTokenId" IS NULL AND "emailAccountId" IS NULL)
      OR (action IN ('USER_DEACTIVATED','USER_REACTIVATED') AND "actorUserId" IS NOT NULL
        AND "previousRole" IS NULL AND "newRole" IS NULL AND "passwordResetTokenId" IS NULL AND "emailAccountId" IS NULL)
      OR (action IN ('MAILBOX_ASSIGNED','MAILBOX_REMOVED') AND "actorUserId" IS NOT NULL
        AND "emailAccountId" IS NOT NULL AND "previousRole" IS NULL AND "newRole" IS NULL AND "passwordResetTokenId" IS NULL)
    ))
  OR ("targetUserId" IS NULL AND "actorUserId" IS NOT NULL AND "operationId" IS NOT NULL
    AND "passwordResetTokenId" IS NULL AND "emailAccountId" IS NULL AND "previousRole" IS NULL AND "newRole" IS NULL
    AND (
      (action IN ('ORGANIZATION_UPDATED','ORGANIZATION_STATUS_CHANGED') AND "organizationId" IS NOT NULL AND "categoryId" IS NULL)
      OR (action IN ('CATEGORY_UPDATED','CATEGORY_STATUS_CHANGED') AND "categoryId" IS NOT NULL AND "organizationId" IS NULL)
    ))

  ))
  OR ("targetUserId" IS NULL AND "organizationId" IS NULL AND "categoryId" IS NULL
    AND "actorUserId" IS NOT NULL AND "operationId" IS NOT NULL
    AND "passwordResetTokenId" IS NULL AND "emailAccountId" IS NULL AND "previousRole" IS NULL AND "newRole" IS NULL
    AND (
      (action IN ('PERSON_UPDATED','PERSON_STATUS_CHANGED') AND "personId" IS NOT NULL AND "personRelationId" IS NULL)
      OR (action IN ('PERSON_RELATION_UPDATED','PERSON_RELATION_ENDED') AND "personRelationId" IS NOT NULL AND "personId" IS NULL)
    ))
))
  OR ("actorUserId" IS NOT NULL AND "operationId" IS NOT NULL
    AND "targetUserId" IS NULL AND "passwordResetTokenId" IS NULL AND "previousRole" IS NULL AND "newRole" IS NULL AND "emailAccountId" IS NULL
    AND "organizationId" IS NULL AND "categoryId" IS NULL AND "personId" IS NULL AND "personRelationId" IS NULL
    AND (
      (action IN ('CONTACT_METHOD_UPDATED','CONTACT_METHOD_CONDITION_CHANGED') AND "contactMethodId" IS NOT NULL AND "personContactId" IS NULL AND "organizationContactId" IS NULL)
      OR (action IN ('CONTACT_ASSOCIATION_CREATED','CONTACT_ASSOCIATION_UPDATED','CONTACT_ASSOCIATION_ENDED','CONTACT_ASSOCIATION_STATUS_CHANGED')
        AND "contactMethodId" IS NULL AND num_nonnulls("personContactId","organizationContactId")=1)
    ))
) AND "previousPersonalVerificationMonths" IS NULL AND "newPersonalVerificationMonths" IS NULL AND "previousInstitutionalVerificationMonths" IS NULL AND "newInstitutionalVerificationMonths" IS NULL)
  OR (action='VERIFICATION_SETTINGS_CHANGED' AND "actorUserId" IS NOT NULL AND "operationId" IS NOT NULL
    AND num_nonnulls("targetUserId","passwordResetTokenId","previousRole","newRole","emailAccountId","organizationId","categoryId","personId","personRelationId","contactMethodId","personContactId","organizationContactId")=0
    AND "previousPersonalVerificationMonths" IS NOT NULL AND "previousPersonalVerificationMonths" BETWEEN 1 AND 120 AND "newPersonalVerificationMonths" IS NOT NULL AND "newPersonalVerificationMonths" BETWEEN 1 AND 120 AND "previousInstitutionalVerificationMonths" IS NOT NULL AND "previousInstitutionalVerificationMonths" BETWEEN 1 AND 120 AND "newInstitutionalVerificationMonths" IS NOT NULL AND "newInstitutionalVerificationMonths" BETWEEN 1 AND 120
    AND ("previousPersonalVerificationMonths"<>"newPersonalVerificationMonths" OR "previousInstitutionalVerificationMonths"<>"newInstitutionalVerificationMonths"))
) AND num_nonnulls("duplicateCandidateId","principalOrganizationId","duplicateOrganizationId","principalPersonId","duplicatePersonId")=0) OR (action='DUPLICATE_CONSOLIDATED' AND "actorUserId" IS NOT NULL AND "operationId" IS NOT NULL AND "duplicateCandidateId" IS NOT NULL
 AND num_nonnulls("targetUserId","passwordResetTokenId","previousRole","newRole","emailAccountId","organizationId","categoryId","personId","personRelationId","contactMethodId","personContactId","organizationContactId","previousPersonalVerificationMonths","newPersonalVerificationMonths","previousInstitutionalVerificationMonths","newInstitutionalVerificationMonths")=0
 AND (("principalOrganizationId" IS NOT NULL AND "duplicateOrganizationId" IS NOT NULL AND "principalOrganizationId"<>"duplicateOrganizationId" AND "principalPersonId" IS NULL AND "duplicatePersonId" IS NULL)
 OR ("principalPersonId" IS NOT NULL AND "duplicatePersonId" IS NOT NULL AND "principalPersonId"<>"duplicatePersonId" AND "principalOrganizationId" IS NULL AND "duplicateOrganizationId" IS NULL)))) AND "contactIntentId" IS NULL)
 OR (action IN ('CONTACT_INTENT_CREATED','CONTACT_INTENT_CANCELLED','CONTACT_INTENT_CONVERTED')
 AND "actorUserId" IS NOT NULL AND "contactIntentId" IS NOT NULL AND "operationId" IS NOT NULL
 AND num_nonnulls("targetUserId","passwordResetTokenId","previousRole","newRole","emailAccountId","organizationId","categoryId","personId","personRelationId","contactMethodId","personContactId","organizationContactId","previousPersonalVerificationMonths","newPersonalVerificationMonths","previousInstitutionalVerificationMonths","newInstitutionalVerificationMonths","duplicateCandidateId","principalOrganizationId","duplicateOrganizationId","principalPersonId","duplicatePersonId")=0)) AND "processEventId" IS NULL) OR (action IN ('PROCESS_CREATED', 'PROCESS_STATE_CHANGED', 'PROCESS_CLOSED', 'PROCESS_REOPENED')
 AND "actorUserId" IS NOT NULL AND "operationId" IS NOT NULL AND "processEventId" IS NOT NULL
 AND num_nonnulls("contactIntentId", "targetUserId", "passwordResetTokenId", "previousRole", "newRole", "emailAccountId", "organizationId", "categoryId", "personId", "personRelationId", "contactMethodId", "personContactId", "organizationContactId", "previousPersonalVerificationMonths", "newPersonalVerificationMonths", "previousInstitutionalVerificationMonths", "newInstitutionalVerificationMonths", "duplicateCandidateId", "principalOrganizationId", "duplicateOrganizationId", "principalPersonId", "duplicatePersonId") = 0)) AND "contactRestrictionId" IS NULL) OR (action IN ('CONTACT_RESTRICTION_CREATED','CONTACT_RESTRICTION_LIFTED')
 AND "actorUserId" IS NOT NULL AND "operationId" IS NOT NULL AND "contactRestrictionId" IS NOT NULL
 AND num_nonnulls("processEventId","contactIntentId","targetUserId","passwordResetTokenId","previousRole","newRole","emailAccountId","organizationId","categoryId","personId","personRelationId","contactMethodId","personContactId","organizationContactId","previousPersonalVerificationMonths","newPersonalVerificationMonths","previousInstitutionalVerificationMonths","newInstitutionalVerificationMonths","duplicateCandidateId","principalOrganizationId","duplicateOrganizationId","principalPersonId","duplicatePersonId")=0));
CREATE UNIQUE INDEX "AuditEvent_restriction_action_key" ON "AuditEvent"("contactRestrictionId",action) WHERE action IN ('CONTACT_RESTRICTION_CREATED','CONTACT_RESTRICTION_LIFTED');
