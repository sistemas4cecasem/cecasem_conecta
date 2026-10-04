import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { UsersService } from '../users/users.service';
import { PERMISSIONS } from '../auth/authorization/permission';
import { hasPermission } from '../auth/authorization/role-permissions';
import { RelationshipProcessesService } from './relationship-processes.service';
import { ProcessError } from './relationship-process.rules';
import type { TimelineItem } from './timeline.dto';
import { internalNoteBody, timelineSeek, type TimelinePosition } from './timeline.rules';
const noteSelect = { id: true, body: true, createdAt: true, author: { select: { id: true, givenNames: true, familyNames: true, isActive: true } } } satisfies Prisma.InternalNoteSelect;
function noteItem(row: Prisma.InternalNoteGetPayload<{ select: typeof noteSelect }>): TimelineItem {
  return { id: row.id, kind: 'INTERNAL_NOTE', occurredAt: row.createdAt.toISOString(), registeredAt: row.createdAt.toISOString(), summary: 'Nota interna',
    actor: { id: row.author.id, displayName: row.author.givenNames + ' ' + row.author.familyNames, isActive: row.author.isActive }, payload: { noteId: row.id, body: row.body } };
}
@Injectable()
export class InternalNotesService {
  constructor(private readonly users: UsersService, private readonly processes: RelationshipProcessesService) {}
  create(processId: string, body: unknown, actorId: string): Promise<TimelineItem> {
    const original = internalNoteBody(body);
    return this.users.withLockedCredentials(actorId, async (actor, tx) => {
      if (!actor?.isActive || !hasPermission(actor.role, PERMISSIONS.INTERNAL_NOTE_CREATE) || !hasPermission(actor.role, PERMISSIONS.PROCESS_READ)) throw new ProcessError('FORBIDDEN');
      await this.processes.requireCommunicationProcess(processId, tx);
      // No actuación externa: no participante, actividad, versión, estado, evento ni auditoría.
      return noteItem(await tx.internalNote.create({ data: { processId, body: original, authorUserId: actor.id, createdAt: new Date() }, select: noteSelect }));
    });
  }
  async timelineItems(processId: string, after: TimelinePosition | undefined, limit: number, tx: Prisma.TransactionClient): Promise<TimelineItem[]> {
    return (await tx.internalNote.findMany({ where: { processId, ...timelineSeek(after, 'NOTE', 'createdAt') }, select: noteSelect,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: limit })).map(noteItem);
  }
}
