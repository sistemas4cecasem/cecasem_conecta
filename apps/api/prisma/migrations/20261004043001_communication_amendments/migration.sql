-- CreateTable
CREATE TABLE "CommunicationAmendment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "communicationId" UUID NOT NULL,
    "type" "CommunicationAmendmentType" NOT NULL,
    "content" VARCHAR(5000) NOT NULL,
    "authorUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestKey" UUID NOT NULL,
    "requestFingerprint" VARCHAR(64) NOT NULL,

    CONSTRAINT "CommunicationAmendment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommunicationAmendment_communicationId_createdAt_id_idx" ON "CommunicationAmendment"("communicationId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "CommunicationAmendment_authorUserId_idx" ON "CommunicationAmendment"("authorUserId");

-- CreateIndex
CREATE INDEX "CommunicationAmendment_createdAt_id_idx" ON "CommunicationAmendment"("createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationAmendment_authorUserId_requestKey_key" ON "CommunicationAmendment"("authorUserId", "requestKey");

-- AddForeignKey
ALTER TABLE "CommunicationAmendment" ADD CONSTRAINT "CommunicationAmendment_communicationId_fkey" FOREIGN KEY ("communicationId") REFERENCES "Communication"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CommunicationAmendment" ADD CONSTRAINT "CommunicationAmendment_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "CommunicationAmendment" ADD CONSTRAINT "CommunicationAmendment_content_check"
 CHECK (length(content) BETWEEN 1 AND 5000 AND length(regexp_replace(content, '[[:space:]]', '', 'g')) > 0);
CREATE UNIQUE INDEX "CommunicationAmendment_one_invalidation_idx" ON "CommunicationAmendment" ("communicationId") WHERE type = 'INVALIDATION';
ALTER TABLE "Communication" DROP CONSTRAINT "Communication_version_check";
ALTER TABLE "Communication" ADD CONSTRAINT "Communication_version_check"
 CHECK ((validity = 'VALID' AND version = 1) OR (validity = 'INVALIDATED' AND version = 2));
