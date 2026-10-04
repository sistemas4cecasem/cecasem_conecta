DROP INDEX "AuditEvent_communicationId_key";
CREATE UNIQUE INDEX "AuditEvent_communicationId_action_key" ON "AuditEvent" ("communicationId", action);
DO $$
DECLARE previous_check text;
BEGIN
 SELECT pg_get_expr(conbin, conrelid) INTO STRICT previous_check FROM pg_constraint
 WHERE conrelid = '"AuditEvent"'::regclass AND conname = 'AuditEvent_action_fields_check';
 ALTER TABLE "AuditEvent" DROP CONSTRAINT "AuditEvent_action_fields_check";
 EXECUTE 'ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_action_fields_check" CHECK (('
 || previous_check || ') OR (action = ''COMMUNICATION_INVALIDATED''
 AND "actorUserId" IS NOT NULL AND "operationId" IS NOT NULL AND "communicationId" IS NOT NULL AND "processId" IS NOT NULL
 AND num_nonnulls("contactRestrictionId","processEventId","contactIntentId","targetUserId","passwordResetTokenId","previousRole","newRole","emailAccountId","organizationId","categoryId","personId","personRelationId","contactMethodId","personContactId","organizationContactId","previousPersonalVerificationMonths","newPersonalVerificationMonths","previousInstitutionalVerificationMonths","newInstitutionalVerificationMonths","duplicateCandidateId","principalOrganizationId","duplicateOrganizationId","principalPersonId","duplicatePersonId")=0))';
END $$;
