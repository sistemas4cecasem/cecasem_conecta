BEGIN;
-- CreateEnum
CREATE TYPE "DuplicateState" AS ENUM ('PENDING', 'NOT_DUPLICATE', 'CONSOLIDATED');

-- CreateEnum
CREATE TYPE "ReconciliationOutcome" AS ENUM ('CREATED', 'REUSED', 'KEPT_PRINCIPAL');

-- AlterTable
ALTER TABLE "AuditEvent" ADD COLUMN     "duplicateCandidateId" UUID,
ADD COLUMN     "duplicateOrganizationId" UUID,
ADD COLUMN     "duplicatePersonId" UUID,
ADD COLUMN     "principalOrganizationId" UUID,
ADD COLUMN     "principalPersonId" UUID;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "duplicateOfId" UUID;

-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "duplicateOfId" UUID;

-- CreateTable
CREATE TABLE "DuplicateCandidate" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationAId" UUID,
    "organizationBId" UUID,
    "personAId" UUID,
    "personBId" UUID,
    "identityA" VARCHAR(64) NOT NULL,
    "identityB" VARCHAR(64) NOT NULL,
    "examinedVersionA" INTEGER NOT NULL,
    "examinedVersionB" INTEGER NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "signals" TEXT[],
    "state" "DuplicateState" NOT NULL DEFAULT 'PENDING',
    "version" INTEGER NOT NULL DEFAULT 1,
    "detectedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMPTZ(3),
    "resolvedByUserId" UUID,
    "principalOrganizationId" UUID,
    "principalPersonId" UUID,
    "operationId" UUID,

    CONSTRAINT "DuplicateCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DuplicateReconciliation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "candidateId" UUID NOT NULL,
    "sourcePersonContactId" UUID,
    "targetPersonContactId" UUID,
    "sourceOrganizationContactId" UUID,
    "targetOrganizationContactId" UUID,
    "sourceRelationId" UUID,
    "targetRelationId" UUID,
    "sourceVersion" INTEGER NOT NULL,
    "targetVersion" INTEGER NOT NULL,
    "outcome" "ReconciliationOutcome" NOT NULL,

    CONSTRAINT "DuplicateReconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DuplicateCandidate_state_detectedAt_id_idx" ON "DuplicateCandidate"("state", "detectedAt", "id");

-- CreateIndex
CREATE INDEX "DuplicateCandidate_organizationAId_detectedAt_id_idx" ON "DuplicateCandidate"("organizationAId", "detectedAt", "id");

-- CreateIndex
CREATE INDEX "DuplicateCandidate_organizationBId_detectedAt_id_idx" ON "DuplicateCandidate"("organizationBId", "detectedAt", "id");

-- CreateIndex
CREATE INDEX "DuplicateCandidate_personAId_detectedAt_id_idx" ON "DuplicateCandidate"("personAId", "detectedAt", "id");

-- CreateIndex
CREATE INDEX "DuplicateCandidate_personBId_detectedAt_id_idx" ON "DuplicateCandidate"("personBId", "detectedAt", "id");

-- CreateIndex
CREATE INDEX "DuplicateCandidate_resolvedByUserId_idx" ON "DuplicateCandidate"("resolvedByUserId");

-- CreateIndex
CREATE INDEX "DuplicateReconciliation_targetPersonContactId_idx" ON "DuplicateReconciliation"("targetPersonContactId");

-- CreateIndex
CREATE INDEX "DuplicateReconciliation_targetOrganizationContactId_idx" ON "DuplicateReconciliation"("targetOrganizationContactId");

-- CreateIndex
CREATE INDEX "DuplicateReconciliation_targetRelationId_idx" ON "DuplicateReconciliation"("targetRelationId");

-- CreateIndex
CREATE UNIQUE INDEX "DuplicateReconciliation_candidateId_sourcePersonContactId_key" ON "DuplicateReconciliation"("candidateId", "sourcePersonContactId");

-- CreateIndex
CREATE UNIQUE INDEX "DuplicateReconciliation_candidateId_sourceOrganizationConta_key" ON "DuplicateReconciliation"("candidateId", "sourceOrganizationContactId");

-- CreateIndex
CREATE UNIQUE INDEX "DuplicateReconciliation_candidateId_sourceRelationId_key" ON "DuplicateReconciliation"("candidateId", "sourceRelationId");

-- CreateIndex
CREATE INDEX "AuditEvent_duplicateCandidateId_idx" ON "AuditEvent"("duplicateCandidateId");

-- CreateIndex
CREATE INDEX "AuditEvent_principalOrganizationId_createdAt_idx" ON "AuditEvent"("principalOrganizationId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_duplicateOrganizationId_createdAt_idx" ON "AuditEvent"("duplicateOrganizationId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_principalPersonId_createdAt_idx" ON "AuditEvent"("principalPersonId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_duplicatePersonId_createdAt_idx" ON "AuditEvent"("duplicatePersonId", "createdAt");

-- CreateIndex
CREATE INDEX "Organization_duplicateOfId_idx" ON "Organization"("duplicateOfId");

-- CreateIndex
CREATE INDEX "Person_duplicateOfId_idx" ON "Person"("duplicateOfId");

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_duplicateCandidateId_fkey" FOREIGN KEY ("duplicateCandidateId") REFERENCES "DuplicateCandidate"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_principalOrganizationId_fkey" FOREIGN KEY ("principalOrganizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_duplicateOrganizationId_fkey" FOREIGN KEY ("duplicateOrganizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_principalPersonId_fkey" FOREIGN KEY ("principalPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_duplicatePersonId_fkey" FOREIGN KEY ("duplicatePersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_duplicateOfId_fkey" FOREIGN KEY ("duplicateOfId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_duplicateOfId_fkey" FOREIGN KEY ("duplicateOfId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "DuplicateCandidate" ADD CONSTRAINT "DuplicateCandidate_organizationAId_fkey" FOREIGN KEY ("organizationAId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "DuplicateCandidate" ADD CONSTRAINT "DuplicateCandidate_organizationBId_fkey" FOREIGN KEY ("organizationBId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "DuplicateCandidate" ADD CONSTRAINT "DuplicateCandidate_personAId_fkey" FOREIGN KEY ("personAId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "DuplicateCandidate" ADD CONSTRAINT "DuplicateCandidate_personBId_fkey" FOREIGN KEY ("personBId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "DuplicateCandidate" ADD CONSTRAINT "DuplicateCandidate_principalOrganizationId_fkey" FOREIGN KEY ("principalOrganizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "DuplicateCandidate" ADD CONSTRAINT "DuplicateCandidate_principalPersonId_fkey" FOREIGN KEY ("principalPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "DuplicateCandidate" ADD CONSTRAINT "DuplicateCandidate_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "DuplicateReconciliation" ADD CONSTRAINT "DuplicateReconciliation_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "DuplicateCandidate"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "DuplicateReconciliation" ADD CONSTRAINT "DuplicateReconciliation_sourcePersonContactId_fkey" FOREIGN KEY ("sourcePersonContactId") REFERENCES "PersonContact"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "DuplicateReconciliation" ADD CONSTRAINT "DuplicateReconciliation_targetPersonContactId_fkey" FOREIGN KEY ("targetPersonContactId") REFERENCES "PersonContact"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "DuplicateReconciliation" ADD CONSTRAINT "DuplicateReconciliation_sourceOrganizationContactId_fkey" FOREIGN KEY ("sourceOrganizationContactId") REFERENCES "OrganizationContact"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "DuplicateReconciliation" ADD CONSTRAINT "DuplicateReconciliation_targetOrganizationContactId_fkey" FOREIGN KEY ("targetOrganizationContactId") REFERENCES "OrganizationContact"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "DuplicateReconciliation" ADD CONSTRAINT "DuplicateReconciliation_sourceRelationId_fkey" FOREIGN KEY ("sourceRelationId") REFERENCES "PersonOrganizationRelation"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "DuplicateReconciliation" ADD CONSTRAINT "DuplicateReconciliation_targetRelationId_fkey" FOREIGN KEY ("targetRelationId") REFERENCES "PersonOrganizationRelation"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "Organization" ADD CONSTRAINT "Organization_duplicate_self_check" CHECK ("duplicateOfId" IS NULL OR "duplicateOfId"<>id);
ALTER TABLE "Person" ADD CONSTRAINT "Person_duplicate_self_check" CHECK ("duplicateOfId" IS NULL OR "duplicateOfId"<>id);
ALTER TABLE "DuplicateCandidate" ADD CONSTRAINT "DuplicateCandidate_pair_check" CHECK (
  ("organizationAId" IS NOT NULL AND "organizationBId" IS NOT NULL AND "personAId" IS NULL AND "personBId" IS NULL AND "organizationAId"<"organizationBId")
  OR ("personAId" IS NOT NULL AND "personBId" IS NOT NULL AND "organizationAId" IS NULL AND "organizationBId" IS NULL AND "personAId"<"personBId"));
ALTER TABLE "DuplicateCandidate" ADD CONSTRAINT "DuplicateCandidate_values_check" CHECK (
  "examinedVersionA">=1 AND "examinedVersionB">=1 AND version>=1 AND score BETWEEN 0 AND 1
  AND "identityA" ~ '^[0-9a-f]{64}$' AND "identityB" ~ '^[0-9a-f]{64}$' AND cardinality(signals)>0);
ALTER TABLE "DuplicateCandidate" ADD CONSTRAINT "DuplicateCandidate_resolution_check" CHECK (
 (state='PENDING' AND "resolvedAt" IS NULL AND "resolvedByUserId" IS NULL AND "operationId" IS NULL AND "principalOrganizationId" IS NULL AND "principalPersonId" IS NULL)
 OR (state='NOT_DUPLICATE' AND "resolvedAt" IS NOT NULL AND "resolvedByUserId" IS NOT NULL AND "operationId" IS NULL AND "principalOrganizationId" IS NULL AND "principalPersonId" IS NULL)
 OR (state='CONSOLIDATED' AND "resolvedAt" IS NOT NULL AND "resolvedByUserId" IS NOT NULL AND "operationId" IS NOT NULL
 AND (("organizationAId" IS NOT NULL AND "principalOrganizationId" IS NOT NULL AND "principalOrganizationId" IN ("organizationAId","organizationBId") AND "principalPersonId" IS NULL)
 OR ("personAId" IS NOT NULL AND "principalPersonId" IS NOT NULL AND "principalPersonId" IN ("personAId","personBId") AND "principalOrganizationId" IS NULL))));
CREATE UNIQUE INDEX "DuplicateCandidate_organization_identity_key" ON "DuplicateCandidate" ("organizationAId","organizationBId","identityA","identityB") WHERE "organizationAId" IS NOT NULL;
CREATE UNIQUE INDEX "DuplicateCandidate_person_identity_key" ON "DuplicateCandidate" ("personAId","personBId","identityA","identityB") WHERE "personAId" IS NOT NULL;
ALTER TABLE "DuplicateReconciliation" ADD CONSTRAINT "DuplicateReconciliation_target_check" CHECK (
 "sourceVersion">=1 AND "targetVersion">=1 AND (
 ("sourcePersonContactId" IS NOT NULL AND "targetPersonContactId" IS NOT NULL AND "sourcePersonContactId"<>"targetPersonContactId" AND num_nonnulls("sourceOrganizationContactId","targetOrganizationContactId","sourceRelationId","targetRelationId")=0)
 OR ("sourceOrganizationContactId" IS NOT NULL AND "targetOrganizationContactId" IS NOT NULL AND "sourceOrganizationContactId"<>"targetOrganizationContactId" AND num_nonnulls("sourcePersonContactId","targetPersonContactId","sourceRelationId","targetRelationId")=0)
 OR ("sourceRelationId" IS NOT NULL AND "targetRelationId" IS NOT NULL AND "sourceRelationId"<>"targetRelationId" AND num_nonnulls("sourcePersonContactId","targetPersonContactId","sourceOrganizationContactId","targetOrganizationContactId")=0)));

ALTER TABLE "AuditEvent" DROP CONSTRAINT "AuditEvent_action_fields_check";
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_action_fields_check" CHECK (((
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
 OR ("principalPersonId" IS NOT NULL AND "duplicatePersonId" IS NOT NULL AND "principalPersonId"<>"duplicatePersonId" AND "principalOrganizationId" IS NULL AND "duplicateOrganizationId" IS NULL))));
ALTER TABLE "DirectoryChange" DROP CONSTRAINT "DirectoryChange_field_check";
ALTER TABLE "DirectoryChange" ADD CONSTRAINT "DirectoryChange_field_check" CHECK ((
  ((("contactMethodId" IS NULL AND "personContactId" IS NULL AND "organizationContactId" IS NULL) AND (
    (field = 'isActive' AND "personRelationId" IS NULL AND jsonb_typeof("previousValue") = 'boolean' AND jsonb_typeof("newValue") = 'boolean')
    OR (field = 'name' AND ("organizationId" IS NOT NULL OR "categoryId" IS NOT NULL) AND jsonb_typeof("previousValue") = 'string' AND jsonb_typeof("newValue") = 'string')
    OR ("organizationId" IS NOT NULL AND field IN ('country','alias','description','officialWebsite','parentId')
      AND jsonb_typeof("previousValue") IN ('string','null') AND jsonb_typeof("newValue") IN ('string','null'))
    OR ("organizationId" IS NOT NULL AND field = 'categoryIds'
      AND jsonb_typeof("previousValue") = 'array' AND jsonb_typeof("newValue") = 'array'
      AND NOT jsonb_path_exists("previousValue", '$[*] ? (@.type() != "string")')
      AND NOT jsonb_path_exists("newValue", '$[*] ? (@.type() != "string")'))
    OR ("personId" IS NOT NULL AND field = 'displayName' AND jsonb_typeof("previousValue") = 'string' AND jsonb_typeof("newValue") = 'string')
    OR ("personId" IS NOT NULL AND field IN ('givenNames','familyNames')
      AND jsonb_typeof("previousValue") IN ('string','null') AND jsonb_typeof("newValue") IN ('string','null'))
    OR ("personRelationId" IS NOT NULL AND field = 'isCurrent' AND jsonb_typeof("previousValue") = 'boolean' AND jsonb_typeof("newValue") = 'boolean')
    OR ("personRelationId" IS NOT NULL AND field IN ('positionTitle','area','startDate','endDate','sourceDescription','sourceUrl','notes')
      AND jsonb_typeof("previousValue") IN ('string','null') AND jsonb_typeof("newValue") IN ('string','null'))
  ))
    OR ("contactMethodId" IS NOT NULL AND (
      (field = 'value' AND jsonb_typeof("previousValue") = 'string' AND jsonb_typeof("newValue") = 'string')
      OR (field = 'label' AND jsonb_typeof("previousValue") IN ('string','null') AND jsonb_typeof("newValue") IN ('string','null'))
      OR (field = 'condition' AND "previousValue" IN ('"USABLE"'::jsonb,'"UNUSABLE"'::jsonb) AND "newValue" IN ('"USABLE"'::jsonb,'"UNUSABLE"'::jsonb))))
    OR (("personContactId" IS NOT NULL OR "organizationContactId" IS NOT NULL) AND (
      (field = 'associationCreated' AND jsonb_typeof("previousValue") = 'null' AND jsonb_typeof("newValue") = 'string')
      OR (field = 'isActive' AND jsonb_typeof("previousValue") = 'boolean' AND jsonb_typeof("newValue") = 'boolean')
      OR (field IN ('sourceDescription','sourceUrl','notes') AND jsonb_typeof("previousValue") IN ('string','null') AND jsonb_typeof("newValue") IN ('string','null'))))
  )
  OR ("personRelationId" IS NOT NULL AND field = 'relationCreated'
    AND jsonb_typeof("previousValue") = 'null' AND jsonb_typeof("newValue") = 'string')
) OR (("organizationId" IS NOT NULL AND field='duplicateOfOrganizationId' OR "personId" IS NOT NULL AND field='duplicateOfPersonId')
 AND jsonb_typeof("previousValue")='null' AND jsonb_typeof("newValue")='string')
 OR (("organizationId" IS NOT NULL AND field='consolidatedOrganizationIds' OR "personId" IS NOT NULL AND field='consolidatedPersonIds')
 AND jsonb_typeof("previousValue")='array' AND jsonb_typeof("newValue")='array'
 AND NOT jsonb_path_exists("previousValue", '$[*] ? (@.type() != "string")') AND NOT jsonb_path_exists("newValue", '$[*] ? (@.type() != "string")')));
COMMIT;
