-- CreateEnum
CREATE TYPE "ProcessState" AS ENUM ('PREPARATION', 'IN_PROGRESS', 'WAITING_RESPONSE', 'NEGOTIATION', 'CLOSED');

-- CreateEnum
CREATE TYPE "ProcessResult" AS ENUM ('ACHIEVED', 'REJECTED', 'NO_RESPONSE', 'CECASEM_WITHDREW', 'OTHER');

-- CreateEnum
CREATE TYPE "ParticipantOrigin" AS ENUM ('PROCESS_CREATOR');

-- CreateEnum
CREATE TYPE "ProcessEventType" AS ENUM ('CREATED', 'STATE_CHANGED', 'CLOSED', 'REOPENED');

-- CreateEnum
CREATE TYPE "ProcessAuthority" AS ENUM ('PARTICIPANT', 'BOARD', 'ADMINISTRATOR');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


-- AlterTable
ALTER TABLE "AuditEvent" ADD COLUMN     "processEventId" UUID;

-- CreateTable
CREATE TABLE "RelationshipProcess" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "purpose" VARCHAR(5000) NOT NULL,
    "organizationId" UUID,
    "personId" UUID,
    "sourceIntentId" UUID,
    "createdByUserId" UUID NOT NULL,
    "state" "ProcessState" NOT NULL DEFAULT 'PREPARATION',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivityAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentResult" "ProcessResult",
    "closureObservation" VARCHAR(5000),
    "closedAt" TIMESTAMPTZ(3),
    "closedByUserId" UUID,

    CONSTRAINT "RelationshipProcess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessParticipant" (
    "processId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "joinedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "origin" "ParticipantOrigin" NOT NULL,

    CONSTRAINT "ProcessParticipant_pkey" PRIMARY KEY ("processId","userId")
);

-- CreateTable
CREATE TABLE "RelationshipProcessEvent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "processId" UUID NOT NULL,
    "type" "ProcessEventType" NOT NULL,
    "previousState" "ProcessState",
    "newState" "ProcessState" NOT NULL,
    "result" "ProcessResult",
    "observation" VARCHAR(5000),
    "actorUserId" UUID NOT NULL,
    "authority" "ProcessAuthority" NOT NULL,
    "version" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RelationshipProcessEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RelationshipProcess_sourceIntentId_key" ON "RelationshipProcess"("sourceIntentId");

-- CreateIndex
CREATE INDEX "RelationshipProcess_organizationId_state_createdAt_id_idx" ON "RelationshipProcess"("organizationId", "state", "createdAt", "id");

-- CreateIndex
CREATE INDEX "RelationshipProcess_personId_state_createdAt_id_idx" ON "RelationshipProcess"("personId", "state", "createdAt", "id");

-- CreateIndex
CREATE INDEX "RelationshipProcess_state_createdAt_id_idx" ON "RelationshipProcess"("state", "createdAt", "id");

-- CreateIndex
CREATE INDEX "RelationshipProcess_createdByUserId_createdAt_id_idx" ON "RelationshipProcess"("createdByUserId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "RelationshipProcess_createdAt_id_idx" ON "RelationshipProcess"("createdAt", "id");

-- CreateIndex
CREATE INDEX "RelationshipProcess_closedByUserId_idx" ON "RelationshipProcess"("closedByUserId");

-- CreateIndex
CREATE INDEX "ProcessParticipant_userId_idx" ON "ProcessParticipant"("userId");

-- CreateIndex
CREATE INDEX "RelationshipProcessEvent_processId_createdAt_id_idx" ON "RelationshipProcessEvent"("processId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "RelationshipProcessEvent_actorUserId_idx" ON "RelationshipProcessEvent"("actorUserId");

-- CreateIndex
CREATE UNIQUE INDEX "RelationshipProcessEvent_processId_version_key" ON "RelationshipProcessEvent"("processId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "AuditEvent_processEventId_key" ON "AuditEvent"("processEventId");

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_processEventId_fkey" FOREIGN KEY ("processEventId") REFERENCES "RelationshipProcessEvent"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RelationshipProcess" ADD CONSTRAINT "RelationshipProcess_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RelationshipProcess" ADD CONSTRAINT "RelationshipProcess_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RelationshipProcess" ADD CONSTRAINT "RelationshipProcess_sourceIntentId_fkey" FOREIGN KEY ("sourceIntentId") REFERENCES "ContactIntent"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RelationshipProcess" ADD CONSTRAINT "RelationshipProcess_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RelationshipProcess" ADD CONSTRAINT "RelationshipProcess_closedByUserId_fkey" FOREIGN KEY ("closedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ProcessParticipant" ADD CONSTRAINT "ProcessParticipant_processId_fkey" FOREIGN KEY ("processId") REFERENCES "RelationshipProcess"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ProcessParticipant" ADD CONSTRAINT "ProcessParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RelationshipProcessEvent" ADD CONSTRAINT "RelationshipProcessEvent_processId_fkey" FOREIGN KEY ("processId") REFERENCES "RelationshipProcess"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RelationshipProcessEvent" ADD CONSTRAINT "RelationshipProcessEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Coherencia de la proyección vigente y preservación de los cierres en eventos.
ALTER TABLE "RelationshipProcess"
 ADD CONSTRAINT "RelationshipProcess_target_check" CHECK (num_nonnulls("organizationId", "personId") = 1),
 ADD CONSTRAINT "RelationshipProcess_purpose_check" CHECK (length(regexp_replace(purpose, '[[:space:]]', '', 'g')) > 0),
 ADD CONSTRAINT "RelationshipProcess_version_check" CHECK (version > 0),
 ADD CONSTRAINT "RelationshipProcess_activity_check" CHECK ("lastActivityAt" >= "createdAt" AND "updatedAt" >= "lastActivityAt"),
 ADD CONSTRAINT "RelationshipProcess_closure_check" CHECK (
   (state = 'CLOSED' AND "currentResult" IS NOT NULL AND "closedAt" IS NOT NULL AND "closedByUserId" IS NOT NULL AND "closedAt" = "lastActivityAt")
   OR (state <> 'CLOSED' AND num_nonnulls("currentResult", "closureObservation", "closedAt", "closedByUserId") = 0)),
 ADD CONSTRAINT "RelationshipProcess_other_check" CHECK ("currentResult" IS DISTINCT FROM 'OTHER' OR
   ("closureObservation" IS NOT NULL AND length(regexp_replace("closureObservation", '[[:space:]]', '', 'g')) > 0)),
 ADD CONSTRAINT "RelationshipProcess_observation_check" CHECK ("closureObservation" IS NULL OR length(regexp_replace("closureObservation", '[[:space:]]', '', 'g')) > 0);
ALTER TABLE "RelationshipProcessEvent"
 ADD CONSTRAINT "RelationshipProcessEvent_version_check" CHECK (version > 0),
 ADD CONSTRAINT "RelationshipProcessEvent_observation_check" CHECK (observation IS NULL OR length(regexp_replace(observation, '[[:space:]]', '', 'g')) > 0),
 ADD CONSTRAINT "RelationshipProcessEvent_shape_check" CHECK (
  (type = 'CREATED' AND "previousState" IS NULL AND "newState" = 'PREPARATION' AND version = 1 AND result IS NULL AND observation IS NULL AND authority = 'PARTICIPANT')
  OR (type = 'STATE_CHANGED' AND "previousState" IS NOT NULL AND "previousState" <> 'CLOSED' AND "newState" <> 'CLOSED' AND "previousState" <> "newState" AND version > 1 AND result IS NULL)
  OR (type = 'CLOSED' AND "previousState" IS NOT NULL AND "previousState" <> 'CLOSED' AND "newState" = 'CLOSED' AND version > 1 AND result IS NOT NULL
    AND (result <> 'OTHER' OR (observation IS NOT NULL AND length(regexp_replace(observation, '[[:space:]]', '', 'g')) > 0)))
  OR (type = 'REOPENED' AND "previousState" = 'CLOSED' AND "newState" <> 'CLOSED' AND version > 1 AND result IS NULL AND observation IS NOT NULL AND length(regexp_replace(observation, '[[:space:]]', '', 'g')) > 0));
ALTER TABLE "AuditEvent" DROP CONSTRAINT "AuditEvent_action_fields_check";
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_action_fields_check" CHECK (((((((
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
 AND num_nonnulls("targetUserId","passwordResetTokenId","previousRole","newRole","emailAccountId","organizationId","categoryId","personId","personRelationId","contactMethodId","personContactId","organizationContactId","previousPersonalVerificationMonths","newPersonalVerificationMonths","previousInstitutionalVerificationMonths","newInstitutionalVerificationMonths","duplicateCandidateId","principalOrganizationId","duplicateOrganizationId","principalPersonId","duplicatePersonId")=0)) AND "processEventId" IS NULL) OR (action IN ('PROCESS_CREATED', 'PROCESS_STATE_CHANGED', 'PROCESS_CLOSED', 'PROCESS_REOPENED')
 AND "actorUserId" IS NOT NULL AND "operationId" IS NOT NULL AND "processEventId" IS NOT NULL
 AND num_nonnulls("contactIntentId", "targetUserId", "passwordResetTokenId", "previousRole", "newRole", "emailAccountId", "organizationId", "categoryId", "personId", "personRelationId", "contactMethodId", "personContactId", "organizationContactId", "previousPersonalVerificationMonths", "newPersonalVerificationMonths", "previousInstitutionalVerificationMonths", "newInstitutionalVerificationMonths", "duplicateCandidateId", "principalOrganizationId", "duplicateOrganizationId", "principalPersonId", "duplicatePersonId") = 0));
