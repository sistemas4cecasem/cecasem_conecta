import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client';
export type HistoryValue = string | boolean | string[] | null;
export interface FieldChange { field: string; previousValue: HistoryValue; newValue: HistoryValue }
@Injectable()
export class DirectoryHistoryService {
  async record(target: { organizationId: string } | { categoryId: string }, actorUserId: string,
    changes: FieldChange[], tx: Prisma.TransactionClient): Promise<string> {
    const operationId = randomUUID();
    await tx.directoryChange.createMany({ data: changes.map(change => ({ ...target, actorUserId, operationId,
      field: change.field, previousValue: change.previousValue === null ? Prisma.JsonNull : change.previousValue,
      newValue: change.newValue === null ? Prisma.JsonNull : change.newValue })) });
    return operationId;
  }
}
