-- AlterTable
ALTER TABLE "AuditEvent" ADD COLUMN     "fileUploadId" UUID;

-- CreateTable
CREATE TABLE "FileUpload" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "processId" UUID,
    "communicationId" UUID,
    "uploadedByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestKey" UUID NOT NULL,
    "requestFingerprint" VARCHAR(64) NOT NULL,

    CONSTRAINT "FileUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileAttachment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "uploadId" UUID NOT NULL,
    "storageKey" VARCHAR(36) NOT NULL,
    "originalName" VARCHAR(255) NOT NULL,
    "declaredMimeType" VARCHAR(150) NOT NULL,
    "mimeType" VARCHAR(150) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "FileAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FileUpload_processId_createdAt_id_idx" ON "FileUpload"("processId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "FileUpload_communicationId_createdAt_id_idx" ON "FileUpload"("communicationId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FileUpload_uploadedByUserId_requestKey_key" ON "FileUpload"("uploadedByUserId", "requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "FileAttachment_storageKey_key" ON "FileAttachment"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "FileAttachment_uploadId_position_key" ON "FileAttachment"("uploadId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "AuditEvent_fileUploadId_key" ON "AuditEvent"("fileUploadId");

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_fileUploadId_fkey" FOREIGN KEY ("fileUploadId") REFERENCES "FileUpload"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "FileUpload" ADD CONSTRAINT "FileUpload_processId_fkey" FOREIGN KEY ("processId") REFERENCES "RelationshipProcess"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "FileUpload" ADD CONSTRAINT "FileUpload_communicationId_fkey" FOREIGN KEY ("communicationId") REFERENCES "Communication"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "FileUpload" ADD CONSTRAINT "FileUpload_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "FileAttachment" ADD CONSTRAINT "FileAttachment_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "FileUpload"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Invariantes adicionales no expresables completamente en Prisma.
ALTER TABLE "FileUpload"
 ADD CONSTRAINT "FileUpload_target_check" CHECK (num_nonnulls("processId", "communicationId") = 1),
 ADD CONSTRAINT "FileUpload_fingerprint_check" CHECK ("requestFingerprint" ~ '^[0-9a-f]{64}$');
ALTER TABLE "FileAttachment"
 ADD CONSTRAINT "FileAttachment_size_check" CHECK ("sizeBytes" BETWEEN 1 AND 20971520),
 ADD CONSTRAINT "FileAttachment_hash_check" CHECK (sha256 ~ '^[0-9a-f]{64}$'),
 ADD CONSTRAINT "FileAttachment_key_check" CHECK ("storageKey" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
 ADD CONSTRAINT "FileAttachment_name_check" CHECK (length(btrim("originalName")) > 0 AND "originalName" !~ '[[:cntrl:]/\\]'),
 ADD CONSTRAINT "FileAttachment_position_check" CHECK (position BETWEEN 0 AND 9),
 ADD CONSTRAINT "FileAttachment_mime_check" CHECK ("mimeType" IN ('application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation','text/plain','text/csv','image/png','image/jpeg','image/webp'));
DO $$
DECLARE previous_check text;
BEGIN
 SELECT pg_get_expr(conbin, conrelid) INTO STRICT previous_check FROM pg_constraint
 WHERE conrelid = '"AuditEvent"'::regclass AND conname = 'AuditEvent_action_fields_check';
 ALTER TABLE "AuditEvent" DROP CONSTRAINT "AuditEvent_action_fields_check";
 EXECUTE 'ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_action_fields_check" CHECK ((('
 || previous_check || ') AND "fileUploadId" IS NULL) OR (action = ''FILES_ATTACHED''
 AND "fileUploadId" IS NOT NULL AND "actorUserId" IS NOT NULL AND "operationId" = "fileUploadId"
 AND num_nonnulls("communicationId","processId","contactRestrictionId","processEventId","contactIntentId","targetUserId","passwordResetTokenId","previousRole","newRole","emailAccountId","organizationId","categoryId","personId","personRelationId","contactMethodId","personContactId","organizationContactId","previousPersonalVerificationMonths","newPersonalVerificationMonths","previousInstitutionalVerificationMonths","newInstitutionalVerificationMonths","duplicateCandidateId","principalOrganizationId","duplicateOrganizationId","principalPersonId","duplicatePersonId")=0))';
END $$;
