BEGIN;
-- AlterTable
ALTER TABLE "AuditEvent" ADD COLUMN     "newInstitutionalVerificationMonths" INTEGER,
ADD COLUMN     "newPersonalVerificationMonths" INTEGER,
ADD COLUMN     "previousInstitutionalVerificationMonths" INTEGER,
ADD COLUMN     "previousPersonalVerificationMonths" INTEGER;

-- AlterTable
ALTER TABLE "ContactMethod" ADD COLUMN     "valueVersion" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "PersonOrganizationRelation" ADD COLUMN     "lastVerifiedAt" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "VerificationSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "personalVerificationMonths" INTEGER NOT NULL DEFAULT 6,
    "institutionalVerificationMonths" INTEGER NOT NULL DEFAULT 12,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID,
    "personId" UUID,
    "personRelationId" UUID,
    "personContactId" UUID,
    "organizationContactId" UUID,
    "actorUserId" UUID NOT NULL,
    "verifiedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "objectVersion" INTEGER NOT NULL,
    "contactValueVersion" INTEGER,
    "sourceDescription" VARCHAR(1000),
    "sourceUrl" VARCHAR(2048),

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Verification_organizationId_verifiedAt_id_idx" ON "Verification"("organizationId", "verifiedAt", "id");

-- CreateIndex
CREATE INDEX "Verification_personId_verifiedAt_id_idx" ON "Verification"("personId", "verifiedAt", "id");

-- CreateIndex
CREATE INDEX "Verification_personRelationId_verifiedAt_id_idx" ON "Verification"("personRelationId", "verifiedAt", "id");

-- CreateIndex
CREATE INDEX "Verification_personContactId_verifiedAt_id_idx" ON "Verification"("personContactId", "verifiedAt", "id");

-- CreateIndex
CREATE INDEX "Verification_organizationContactId_verifiedAt_id_idx" ON "Verification"("organizationContactId", "verifiedAt", "id");

-- CreateIndex
CREATE INDEX "Verification_actorUserId_idx" ON "Verification"("actorUserId");

-- AddForeignKey
ALTER TABLE "Verification" ADD CONSTRAINT "Verification_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Verification" ADD CONSTRAINT "Verification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Verification" ADD CONSTRAINT "Verification_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Verification" ADD CONSTRAINT "Verification_personRelationId_fkey" FOREIGN KEY ("personRelationId") REFERENCES "PersonOrganizationRelation"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Verification" ADD CONSTRAINT "Verification_personContactId_fkey" FOREIGN KEY ("personContactId") REFERENCES "PersonContact"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Verification" ADD CONSTRAINT "Verification_organizationContactId_fkey" FOREIGN KEY ("organizationContactId") REFERENCES "OrganizationContact"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "ContactMethod" ADD CONSTRAINT "ContactMethod_value_version_check" CHECK ("valueVersion">=1);
ALTER TABLE "VerificationSettings" ADD CONSTRAINT "VerificationSettings_singleton_check" CHECK (id=1 AND version>=1 AND "personalVerificationMonths" BETWEEN 1 AND 120 AND "institutionalVerificationMonths" BETWEEN 1 AND 120);
INSERT INTO "VerificationSettings" (id) VALUES (1);
ALTER TABLE "Verification" ADD CONSTRAINT "Verification_target_check" CHECK (num_nonnulls("organizationId","personId","personRelationId","personContactId","organizationContactId")=1);
ALTER TABLE "Verification" ADD CONSTRAINT "Verification_versions_check" CHECK ("objectVersion">=1 AND ((num_nonnulls("personContactId","organizationContactId")=1 AND "contactValueVersion" IS NOT NULL AND "contactValueVersion">=1) OR ("personContactId" IS NULL AND "organizationContactId" IS NULL AND "contactValueVersion" IS NULL)));
ALTER TABLE "AuditEvent" DROP CONSTRAINT "AuditEvent_action_fields_check";
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_action_fields_check" CHECK (
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
);
COMMIT;
