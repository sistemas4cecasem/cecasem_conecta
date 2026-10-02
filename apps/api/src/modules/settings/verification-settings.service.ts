import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { UsersService } from '../users/users.service';
import { AuditService } from '../audit/audit.service';
import { PERMISSIONS } from '../auth/authorization/permission';
import { hasPermission } from '../auth/authorization/role-permissions';
import type { VerificationSettingsDto } from './verification-settings.dto';
const settingsSelect = { personalVerificationMonths: true, institutionalVerificationMonths: true, version: true } as const;
@Injectable()
export class VerificationSettingsService {
  constructor(private readonly prisma: PrismaService, private readonly users: UsersService, private readonly audit: AuditService) {}
  get(tx: Prisma.TransactionClient = this.prisma) {
    return tx.verificationSettings.findUniqueOrThrow({ where: { id: 1 }, select: settingsSelect });
  }
  update(input: VerificationSettingsDto, actorId: string) {
    return this.prisma.$transaction(async tx => {
      const actor = await this.users.findIdentityById(actorId, tx);
      if (!actor?.isActive || !hasPermission(actor.role, PERMISSIONS.SETTINGS_VERIFICATION_UPDATE)) throw new ForbiddenException();
      await tx.$queryRaw`SELECT id FROM "VerificationSettings" WHERE id=1 FOR UPDATE`;
      const previous = await this.get(tx);
      if (previous.version !== input.expectedVersion) throw new ConflictException('Los intervalos cambiaron. Recargue y revise su propuesta.');
      const next = { personalVerificationMonths: input.personalVerificationMonths, institutionalVerificationMonths: input.institutionalVerificationMonths };
      if (next.personalVerificationMonths === previous.personalVerificationMonths && next.institutionalVerificationMonths === previous.institutionalVerificationMonths) return previous;
      const result = await tx.verificationSettings.update({ where: { id: 1 }, data: { ...next, version: { increment: 1 } }, select: settingsSelect });
      await this.audit.recordVerificationSettings(actorId, randomUUID(), previous, next, tx);
      return result;
    });
  }
}
