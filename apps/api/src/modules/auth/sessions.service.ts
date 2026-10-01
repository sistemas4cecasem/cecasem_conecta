import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppEnvironment } from '../../config/environment';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { UsersService } from '../users/users.service';
import { UserIdentity } from '../users/user-projections';
import { createSessionToken, hashSessionToken, sessionIsValid } from './session-token';

@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService, private readonly users: UsersService,
    private readonly config: ConfigService<AppEnvironment, true>) {}

  async create(userId: string, tx: Prisma.TransactionClient): Promise<string> {
    const token = createSessionToken();
    const createdAt = new Date();
    await tx.userSession.create({ data: { userId, tokenHash: hashSessionToken(token)!, createdAt,
      expiresAt: new Date(createdAt.getTime() + this.config.get('SESSION_TTL_SECONDS', { infer: true }) * 1000) } });
    return token;
  }

  async findIdentity(token: string | undefined): Promise<UserIdentity | null> {
    const tokenHash = token === undefined ? null : hashSessionToken(token);
    if (!tokenHash) return null;
    const session = await this.prisma.userSession.findUnique({ where: { tokenHash } });
    if (!session || !sessionIsValid(session)) return null;
    const user = await this.users.findIdentityById(session.userId);
    return user?.isActive ? user : null;
  }

  async revoke(token: string | undefined, tx: Prisma.TransactionClient = this.prisma): Promise<void> {
    const tokenHash = token === undefined ? null : hashSessionToken(token);
    if (!tokenHash) return;
    await tx.$executeRaw`UPDATE "UserSession" SET "revokedAt" = GREATEST("createdAt", ${new Date()})
      WHERE "tokenHash" = ${tokenHash} AND "revokedAt" IS NULL`;
  }

  async revokeAllForUser(userId: string, tx: Prisma.TransactionClient = this.prisma): Promise<void> {
    await tx.$executeRaw`UPDATE "UserSession" SET "revokedAt" = GREATEST("createdAt", ${new Date()})
      WHERE "userId" = ${userId}::uuid AND "revokedAt" IS NULL`;
  }
}
