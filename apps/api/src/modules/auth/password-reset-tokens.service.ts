import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { hashOpaqueToken } from './opaque-token';

export function passwordResetIsValid(token: { usedAt: Date | null; revokedAt: Date | null; expiresAt: Date }, now = new Date()): boolean {
  return token.usedAt === null && token.revokedAt === null && token.expiresAt.getTime() > now.getTime();
}
@Injectable()
export class PasswordResetTokensService {
  constructor(private readonly prisma: PrismaService) {}
  findByToken(token: string) {
    const tokenHash = hashOpaqueToken(token);
    return tokenHash ? this.prisma.passwordResetToken.findUnique({ where: { tokenHash } }) : Promise.resolve(null);
  }
  // Siempre después del lock de User; incluye pendientes ya expirados.
  revokePendingForUser(userId: string, tx: Prisma.TransactionClient): Promise<{ id: string }[]> {
    return tx.$queryRaw`UPDATE "PasswordResetToken" SET "revokedAt" = GREATEST("createdAt", ${new Date()})
      WHERE "userId" = ${userId}::uuid AND "usedAt" IS NULL AND "revokedAt" IS NULL RETURNING id`;
  }
}
