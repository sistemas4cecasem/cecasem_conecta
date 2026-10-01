-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMINISTRATOR', 'BOARD', 'RESEARCH', 'PLANNING');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "givenNames" VARCHAR(150) NOT NULL,
    "familyNames" VARCHAR(150) NOT NULL,
    "username" VARCHAR(64) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "role" "UserRole" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deactivatedAt" TIMESTAMPTZ(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailAccount" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "address" VARCHAR(254) NOT NULL,
    "provider" VARCHAR(150),
    "displayName" VARCHAR(150) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserEmailAccount" (
    "userId" UUID NOT NULL,
    "emailAccountId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserEmailAccount_pkey" PRIMARY KEY ("userId","emailAccountId")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "EmailAccount_address_key" ON "EmailAccount"("address");

-- CreateIndex
CREATE INDEX "UserEmailAccount_emailAccountId_idx" ON "UserEmailAccount"("emailAccountId");

-- AddForeignKey
ALTER TABLE "UserEmailAccount" ADD CONSTRAINT "UserEmailAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "UserEmailAccount" ADD CONSTRAINT "UserEmailAccount_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Invariantes que Prisma no representa como CHECK en schema.prisma.
-- La desactivación conserva la fila; activo y fecha deben cambiar atómicamente.
ALTER TABLE "User" ADD CONSTRAINT "User_active_deactivation_check"
    CHECK (("isActive" AND "deactivatedAt" IS NULL) OR (NOT "isActive" AND "deactivatedAt" IS NOT NULL));

-- Las escrituras directas también deben usar la representación canónica.
-- No se eliminan puntos ni sufijos '+' y no se aplican reglas por proveedor.
ALTER TABLE "User" ADD CONSTRAINT "User_email_normalized_check"
    CHECK ("email" = lower(btrim("email")) AND "email" <> '' AND "email" !~ '[[:space:]]');
ALTER TABLE "EmailAccount" ADD CONSTRAINT "EmailAccount_address_normalized_check"
    CHECK ("address" = lower(btrim("address")) AND "address" <> '' AND "address" !~ '[[:space:]]');
