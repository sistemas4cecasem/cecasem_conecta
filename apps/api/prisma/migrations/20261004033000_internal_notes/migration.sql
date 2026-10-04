-- CreateTable
CREATE TABLE "InternalNote" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "processId" UUID NOT NULL,
    "body" VARCHAR(5000) NOT NULL,
    "authorUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InternalNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InternalNote_processId_createdAt_id_idx" ON "InternalNote"("processId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "InternalNote_authorUserId_idx" ON "InternalNote"("authorUserId");

-- AddForeignKey
ALTER TABLE "InternalNote" ADD CONSTRAINT "InternalNote_processId_fkey" FOREIGN KEY ("processId") REFERENCES "RelationshipProcess"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "InternalNote" ADD CONSTRAINT "InternalNote_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "InternalNote" ADD CONSTRAINT "InternalNote_body_check" CHECK (length(body) BETWEEN 1 AND 5000 AND length(regexp_replace(body, '[[:space:]]', '', 'g')) > 0);
