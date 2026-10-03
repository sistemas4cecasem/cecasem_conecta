-- CreateEnum
CREATE TYPE "ContactIntentState" AS ENUM ('ACTIVE', 'CONVERTED', 'CANCELLED', 'CLOSED');

-- AlterTable
ALTER TABLE "AuditEvent" ADD COLUMN     "contactIntentId" UUID;

-- CreateTable
CREATE TABLE "ContactIntent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "purpose" VARCHAR(5000) NOT NULL,
    "authorUserId" UUID NOT NULL,
    "organizationId" UUID,
    "personId" UUID,
    "state" "ContactIntentState" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivityAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMPTZ(3),
    "cancelledByUserId" UUID,

    CONSTRAINT "ContactIntent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContactIntent_state_createdAt_id_idx" ON "ContactIntent"("state", "createdAt", "id");

-- CreateIndex
CREATE INDEX "ContactIntent_authorUserId_createdAt_id_idx" ON "ContactIntent"("authorUserId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "ContactIntent_organizationId_state_createdAt_id_idx" ON "ContactIntent"("organizationId", "state", "createdAt", "id");

-- CreateIndex
CREATE INDEX "ContactIntent_personId_state_createdAt_id_idx" ON "ContactIntent"("personId", "state", "createdAt", "id");

-- CreateIndex
CREATE INDEX "ContactIntent_createdAt_id_idx" ON "ContactIntent"("createdAt", "id");

-- CreateIndex
CREATE INDEX "ContactIntent_cancelledByUserId_idx" ON "ContactIntent"("cancelledByUserId");

-- CreateIndex
CREATE INDEX "AuditEvent_contactIntentId_createdAt_idx" ON "AuditEvent"("contactIntentId", "createdAt");

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_contactIntentId_fkey" FOREIGN KEY ("contactIntentId") REFERENCES "ContactIntent"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ContactIntent" ADD CONSTRAINT "ContactIntent_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ContactIntent" ADD CONSTRAINT "ContactIntent_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ContactIntent" ADD CONSTRAINT "ContactIntent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ContactIntent" ADD CONSTRAINT "ContactIntent_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Invariantes de intención; sin borrar ni reutilizar historial del directorio.
ALTER TABLE "ContactIntent"
 ADD CONSTRAINT "ContactIntent_target_check" CHECK (num_nonnulls("organizationId","personId")=1),
 ADD CONSTRAINT "ContactIntent_purpose_check" CHECK (length(regexp_replace(purpose,'[[:space:]]','','g'))>0),
 ADD CONSTRAINT "ContactIntent_version_check" CHECK (version>0),
 ADD CONSTRAINT "ContactIntent_activity_check" CHECK ("lastActivityAt">="createdAt" AND "updatedAt">="lastActivityAt"),
 ADD CONSTRAINT "ContactIntent_cancellation_check" CHECK (
   (state='CANCELLED' AND "cancelledAt" IS NOT NULL AND "cancelledByUserId" IS NOT NULL AND "cancelledAt"="lastActivityAt")
   OR (state<>'CANCELLED' AND "cancelledAt" IS NULL AND "cancelledByUserId" IS NULL));
ALTER TABLE "AuditEvent" DROP CONSTRAINT "AuditEvent_action_fields_check";
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_action_fields_check" CHECK ( ((((
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
 OR (action IN ('CONTACT_INTENT_CREATED','CONTACT_INTENT_CANCELLED')
 AND "actorUserId" IS NOT NULL AND "contactIntentId" IS NOT NULL AND "operationId" IS NOT NULL
 AND num_nonnulls("targetUserId","passwordResetTokenId","previousRole","newRole","emailAccountId","organizationId","categoryId","personId","personRelationId","contactMethodId","personContactId","organizationContactId","previousPersonalVerificationMonths","newPersonalVerificationMonths","previousInstitutionalVerificationMonths","newInstitutionalVerificationMonths","duplicateCandidateId","principalOrganizationId","duplicateOrganizationId","principalPersonId","duplicatePersonId")=0));
CREATE UNIQUE INDEX "AuditEvent_contact_intent_action_key" ON "AuditEvent" ("contactIntentId",action)
 WHERE action IN ('CONTACT_INTENT_CREATED','CONTACT_INTENT_CANCELLED');
