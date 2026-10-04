import { Injectable } from '@nestjs/common';
import { ParticipantOrigin, Prisma } from '../../generated/prisma/client';
import type { ProcessParticipant } from '../../generated/prisma/client';
import { UsersService } from '../users/users.service';
import { ProcessError } from './relationship-process.rules';

/** Solo productores de acciones formales; nunca consultas ni notas internas.
 * El productor debe pasar su propia transacción: un fallo revierte acción y participación.
 */
@Injectable()
export class ProcessParticipationService {
  constructor(private readonly users: UsersService) {}

  async ensureParticipant(processId: string, userId: string, origin: ParticipantOrigin, tx: Prisma.TransactionClient): Promise<ProcessParticipant> {
    if (!Object.values(ParticipantOrigin).includes(origin)) throw new ProcessError('INVALID_PROCESS');
    const process = await tx.relationshipProcess.findUnique({ where: { id: processId }, select: { createdByUserId: true, createdAt: true } });
    if (!process) throw new ProcessError('PROCESS_NOT_FOUND');
    const user = await this.users.findIdentityById(userId, tx);
    if (!user?.isActive || (origin === ParticipantOrigin.PROCESS_CREATOR && process.createdByUserId !== userId)) throw new ProcessError('FORBIDDEN');
    // ON CONFLICT DO NOTHING conserva el primer origen/fecha incluso con productores concurrentes.
    await tx.processParticipant.createMany({ data: { processId, userId, origin,
      joinedAt: origin === ParticipantOrigin.PROCESS_CREATOR ? process.createdAt : new Date() }, skipDuplicates: true });
    return tx.processParticipant.findUniqueOrThrow({ where: { processId_userId: { processId, userId } } });
  }

  async isParticipant(processId: string, userId: string, tx: Prisma.TransactionClient): Promise<boolean> {
    return !!await tx.processParticipant.findUnique({ where: { processId_userId: { processId, userId } }, select: { userId: true } });
  }
}
