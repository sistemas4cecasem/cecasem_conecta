import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { hashOpaqueToken } from './opaque-token';

export function firstAccessIsValid(token: { usedAt: Date | null; revokedAt: Date | null; expiresAt: Date }, now = new Date()): boolean {
  return token.usedAt === null && token.revokedAt === null && token.expiresAt.getTime() > now.getTime();
}

@Injectable()
export class FirstAccessTokensService {
  constructor(private readonly prisma: PrismaService) {}

  findByToken(token: string) {
    const tokenHash = hashOpaqueToken(token);
    return tokenHash ? this.prisma.firstAccessToken.findUnique({ where: { tokenHash } }) : Promise.resolve(null);
  }

  // Emisión, consumo y desactivación llaman esto después del lock de User.
  async revokePendingForUser(userId: string, tx: Prisma.TransactionClient): Promise<void> {
    await tx.$executeRaw`UPDATE "FirstAccessToken" SET "revokedAt" = GREATEST("createdAt", ${new Date()})
      WHERE "userId" = ${userId}::uuid AND "usedAt" IS NULL AND "revokedAt" IS NULL`;
  }
}
