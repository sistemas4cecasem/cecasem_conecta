-- AlterTable
ALTER TABLE "AuditEvent" ADD COLUMN     "referralId" UUID;

-- CreateTable
CREATE TABLE "Referral" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sourceCommunicationId" UUID NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recommendedName" VARCHAR(300),
    "recommendedRole" VARCHAR(300),
    "organizationNameSnapshot" VARCHAR(300),
    "mediumType" "ContactType",
    "mediumValue" VARCHAR(2048),
    "notes" VARCHAR(5000),
    "personId" UUID,
    "organizationId" UUID,
    "contactMethodId" UUID,
    "requestKey" UUID NOT NULL,
    "requestFingerprint" VARCHAR(64) NOT NULL,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Referral_sourceCommunicationId_createdAt_id_idx" ON "Referral"("sourceCommunicationId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Referral_personId_idx" ON "Referral"("personId");

-- CreateIndex
CREATE INDEX "Referral_organizationId_idx" ON "Referral"("organizationId");

-- CreateIndex
CREATE INDEX "Referral_contactMethodId_idx" ON "Referral"("contactMethodId");

-- CreateIndex
CREATE UNIQUE INDEX "Referral_createdByUserId_requestKey_key" ON "Referral"("createdByUserId", "requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "AuditEvent_referralId_key" ON "AuditEvent"("referralId");

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_sourceCommunicationId_fkey" FOREIGN KEY ("sourceCommunicationId") REFERENCES "Communication"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_contactMethodId_fkey" FOREIGN KEY ("contactMethodId") REFERENCES "ContactMethod"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "Referral"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "Referral"
 ADD CONSTRAINT "Referral_minimum_check" CHECK (num_nonnulls("personId","recommendedName","organizationId","organizationNameSnapshot","mediumValue") > 0),
 ADD CONSTRAINT "Referral_medium_check" CHECK (("mediumType" IS NULL) = ("mediumValue" IS NULL) AND ("contactMethodId" IS NULL OR "mediumValue" IS NOT NULL)),
 ADD CONSTRAINT "Referral_fingerprint_check" CHECK ("requestFingerprint" ~ '^[0-9a-f]{64}$'),
 ADD CONSTRAINT "Referral_text_check" CHECK (
   ("recommendedName" IS NULL OR length(regexp_replace("recommendedName", '[[:space:]]', '', 'g')) > 0) AND
   ("recommendedRole" IS NULL OR length(regexp_replace("recommendedRole", '[[:space:]]', '', 'g')) > 0) AND
   ("organizationNameSnapshot" IS NULL OR length(regexp_replace("organizationNameSnapshot", '[[:space:]]', '', 'g')) > 0) AND
   ("mediumValue" IS NULL OR length(regexp_replace("mediumValue", '[[:space:]]', '', 'g')) > 0) AND
   (notes IS NULL OR length(regexp_replace(notes, '[[:space:]]', '', 'g')) > 0));

CREATE FUNCTION preserve_referral() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Los contactos recomendados son hechos históricos inmutables' USING ERRCODE = '23514';
END $$;
CREATE TRIGGER "Referral_immutable_check" BEFORE UPDATE ON "Referral" FOR EACH ROW EXECUTE FUNCTION preserve_referral();

DO $$
DECLARE previous_check text;
BEGIN
 SELECT pg_get_expr(conbin, conrelid) INTO STRICT previous_check FROM pg_constraint WHERE conrelid = '"AuditEvent"'::regclass AND conname = 'AuditEvent_action_fields_check';
 ALTER TABLE "AuditEvent" DROP CONSTRAINT "AuditEvent_action_fields_check";
 EXECUTE 'ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_action_fields_check" CHECK (((' || previous_check || ') AND "referralId" IS NULL) OR (action = ''REFERRAL_CREATED''
 AND "referralId" IS NOT NULL AND "actorUserId" IS NOT NULL AND "operationId" IS NOT NULL AND "operationId" = "referralId"
 AND num_nonnulls("opportunityEventId","fileUploadId","communicationId","processId","contactRestrictionId","processEventId","contactIntentId","targetUserId","passwordResetTokenId","previousRole","newRole","emailAccountId","organizationId","categoryId","personId","personRelationId","contactMethodId","personContactId","organizationContactId","previousPersonalVerificationMonths","newPersonalVerificationMonths","previousInstitutionalVerificationMonths","newInstitutionalVerificationMonths","duplicateCandidateId","principalOrganizationId","duplicateOrganizationId","principalPersonId","duplicatePersonId") = 0))';
END $$;

CREATE FUNCTION check_referral_audit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE recorded_actor uuid;
BEGIN
 IF NEW."referralId" IS NOT NULL THEN
  SELECT "createdByUserId" INTO recorded_actor FROM "Referral" WHERE id = NEW."referralId";
  IF NEW.action::text IS DISTINCT FROM 'REFERRAL_CREATED' OR NEW."actorUserId" IS DISTINCT FROM recorded_actor THEN
   RAISE EXCEPTION 'Auditoría de derivación incoherente' USING ERRCODE = '23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "AuditEvent_referral_consistency_check" BEFORE INSERT OR UPDATE ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION check_referral_audit();
