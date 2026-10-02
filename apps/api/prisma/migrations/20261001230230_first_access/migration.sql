-- CreateTable
CREATE TABLE "FirstAccessToken" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "FirstAccessToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FirstAccessToken_tokenHash_key" ON "FirstAccessToken"("tokenHash");

-- CreateIndex
CREATE INDEX "FirstAccessToken_userId_idx" ON "FirstAccessToken"("userId");

-- CreateIndex
CREATE INDEX "FirstAccessToken_createdByUserId_idx" ON "FirstAccessToken"("createdByUserId");

-- AddForeignKey
ALTER TABLE "FirstAccessToken" ADD CONSTRAINT "FirstAccessToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "FirstAccessToken" ADD CONSTRAINT "FirstAccessToken_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Estado derivado de fechas; nunca almacenar el token plano ni un estado redundante.
ALTER TABLE "FirstAccessToken" ADD CONSTRAINT "FirstAccessToken_expiration_check" CHECK ("expiresAt" > "createdAt");
ALTER TABLE "FirstAccessToken" ADD CONSTRAINT "FirstAccessToken_use_check" CHECK ("usedAt" IS NULL OR "usedAt" >= "createdAt");
ALTER TABLE "FirstAccessToken" ADD CONSTRAINT "FirstAccessToken_revocation_check" CHECK ("revokedAt" IS NULL OR "revokedAt" >= "createdAt");
ALTER TABLE "FirstAccessToken" ADD CONSTRAINT "FirstAccessToken_terminal_check" CHECK ("usedAt" IS NULL OR "revokedAt" IS NULL);
ALTER TABLE "FirstAccessToken" ADD CONSTRAINT "FirstAccessToken_hash_check" CHECK ("tokenHash" ~ '^[0-9a-f]{64}$');
