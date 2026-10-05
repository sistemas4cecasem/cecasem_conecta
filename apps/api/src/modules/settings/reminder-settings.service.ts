import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { UsersService } from '../users/users.service';
import { AuditService } from '../audit/audit.service';
import type { UpdateReminderSettingsDto } from './reminder-settings.dto';

const select = { intervalDays: true, version: true } as const;
@Injectable()
export class ReminderSettingsService {
  constructor(private readonly prisma: PrismaService, private readonly users: UsersService, private readonly audit: AuditService) {}
  snapshot(tx: Prisma.TransactionClient = this.prisma) { return tx.reminderSettings.findUniqueOrThrow({ where: { id: 1 }, select }); }
  get(actorId: string) {
    return this.users.withLockedCredentials(actorId, (user, tx) => {
      if (!user?.isActive || user.role !== 'ADMINISTRATOR') throw new ForbiddenException();
      return this.snapshot(tx);
    });
  }
  update(input: UpdateReminderSettingsDto, actorId: string) {
    return this.users.withLockedCredentials(actorId, async (user, tx) => {
      if (!user?.isActive || user.role !== 'ADMINISTRATOR') throw new ForbiddenException();
      await tx.$queryRaw`SELECT id FROM "ReminderSettings" WHERE id=1 FOR UPDATE`;
      const previous = await this.snapshot(tx);
      if (previous.version !== input.expectedVersion) throw new ConflictException('El intervalo cambió. Recargue y revise su propuesta.');
      if (previous.intervalDays === input.intervalDays) return previous;
      const result = await tx.reminderSettings.update({ where: { id: 1 }, data: { intervalDays: input.intervalDays, version: { increment: 1 } }, select });
      await this.audit.recordReminderSettings(actorId, randomUUID(), previous.intervalDays, input.intervalDays, tx);
      return result;
    });
  }
}
