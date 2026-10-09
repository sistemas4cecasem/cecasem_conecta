ALTER TABLE "AuditEvent"
  ADD COLUMN "previousGivenNames" VARCHAR(150),
  ADD COLUMN "newGivenNames" VARCHAR(150),
  ADD COLUMN "previousFamilyNames" VARCHAR(150),
  ADD COLUMN "newFamilyNames" VARCHAR(150),
  ADD COLUMN "previousEmail" VARCHAR(254),
  ADD COLUMN "newEmail" VARCHAR(254);

DO $$
DECLARE previous_check text;
BEGIN
  SELECT pg_get_expr(conbin, conrelid) INTO STRICT previous_check
  FROM pg_constraint
  WHERE conrelid = '"AuditEvent"'::regclass AND conname = 'AuditEvent_action_fields_check';

  ALTER TABLE "AuditEvent" DROP CONSTRAINT "AuditEvent_action_fields_check";
  EXECUTE 'ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_action_fields_check" CHECK ((('
    || previous_check || ') AND "previousGivenNames" IS NULL AND "newGivenNames" IS NULL'
    || ' AND "previousFamilyNames" IS NULL AND "newFamilyNames" IS NULL AND "previousEmail" IS NULL AND "newEmail" IS NULL)'
    || ' OR (action = ''USER_PASSWORD_RESET'' AND "actorUserId" IS NOT NULL AND "targetUserId" IS NOT NULL'
    || ' AND num_nonnulls("dataImportBatchId","previousReminderIntervalDays","newReminderIntervalDays","meetingEventId","referralId","opportunityEventId","fileUploadId","processId","communicationId","contactRestrictionId","processEventId","contactIntentId","duplicateCandidateId","principalOrganizationId","duplicateOrganizationId","principalPersonId","duplicatePersonId","previousPersonalVerificationMonths","newPersonalVerificationMonths","previousInstitutionalVerificationMonths","newInstitutionalVerificationMonths","passwordResetTokenId","previousRole","newRole","emailAccountId","organizationId","categoryId","operationId","personId","personRelationId","contactMethodId","personContactId","organizationContactId","previousGivenNames","newGivenNames","previousFamilyNames","newFamilyNames","previousEmail","newEmail") = 0)'
    || ' OR (action = ''USER_PROFILE_UPDATED'' AND "actorUserId" IS NOT NULL AND "targetUserId" IS NOT NULL'
    || ' AND num_nonnulls("dataImportBatchId","previousReminderIntervalDays","newReminderIntervalDays","meetingEventId","referralId","opportunityEventId","fileUploadId","processId","communicationId","contactRestrictionId","processEventId","contactIntentId","duplicateCandidateId","principalOrganizationId","duplicateOrganizationId","principalPersonId","duplicatePersonId","previousPersonalVerificationMonths","newPersonalVerificationMonths","previousInstitutionalVerificationMonths","newInstitutionalVerificationMonths","passwordResetTokenId","previousRole","newRole","emailAccountId","organizationId","categoryId","operationId","personId","personRelationId","contactMethodId","personContactId","organizationContactId") = 0'
    || ' AND ("previousGivenNames" IS NULL) = ("newGivenNames" IS NULL)'
    || ' AND ("previousFamilyNames" IS NULL) = ("newFamilyNames" IS NULL)'
    || ' AND ("previousEmail" IS NULL) = ("newEmail" IS NULL)'
    || ' AND num_nonnulls("previousGivenNames","previousFamilyNames","previousEmail") > 0))';
END $$;
