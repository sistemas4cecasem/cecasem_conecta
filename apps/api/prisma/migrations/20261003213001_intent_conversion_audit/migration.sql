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
 OR (action IN ('CONTACT_INTENT_CREATED','CONTACT_INTENT_CANCELLED','CONTACT_INTENT_CONVERTED')
 AND "actorUserId" IS NOT NULL AND "contactIntentId" IS NOT NULL AND "operationId" IS NOT NULL
 AND num_nonnulls("targetUserId","passwordResetTokenId","previousRole","newRole","emailAccountId","organizationId","categoryId","personId","personRelationId","contactMethodId","personContactId","organizationContactId","previousPersonalVerificationMonths","newPersonalVerificationMonths","previousInstitutionalVerificationMonths","newInstitutionalVerificationMonths","duplicateCandidateId","principalOrganizationId","duplicateOrganizationId","principalPersonId","duplicatePersonId")=0)) AND "processEventId" IS NULL) OR (action IN ('PROCESS_CREATED', 'PROCESS_STATE_CHANGED', 'PROCESS_CLOSED', 'PROCESS_REOPENED')
 AND "actorUserId" IS NOT NULL AND "operationId" IS NOT NULL AND "processEventId" IS NOT NULL
 AND num_nonnulls("contactIntentId", "targetUserId", "passwordResetTokenId", "previousRole", "newRole", "emailAccountId", "organizationId", "categoryId", "personId", "personRelationId", "contactMethodId", "personContactId", "organizationContactId", "previousPersonalVerificationMonths", "newPersonalVerificationMonths", "previousInstitutionalVerificationMonths", "newInstitutionalVerificationMonths", "duplicateCandidateId", "principalOrganizationId", "duplicateOrganizationId", "principalPersonId", "duplicatePersonId") = 0));

CREATE UNIQUE INDEX "AuditEvent_intent_conversion_key" ON "AuditEvent"("contactIntentId") WHERE action = 'CONTACT_INTENT_CONVERTED';
