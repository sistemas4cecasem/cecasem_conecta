import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { UsersService } from '../users/users.service';
import { AuditService } from '../audit/audit.service';
import { PERMISSIONS } from '../auth/authorization/permission';
import { hasPermission } from '../auth/authorization/role-permissions';
import { AmendmentError, amendmentContent, amendmentFingerprint, assertAmendmentAllowed, canInvalidate, type AmendmentType } from './communication-amendment.rules';
import type { AmendmentDto } from './communication-amendment.dto';
import type { UserIdentity } from '../users/user-projections';
import type { TimelineItem } from '../relationships/timeline.dto';
import { timelineSeek, type TimelinePosition } from '../relationships/timeline.rules';
export const amendmentSelect = { id: true, communicationId: true, type: true, content: true, createdAt: true,
  author: { select: { id: true, givenNames: true, familyNames: true, isActive: true } } } satisfies Prisma.CommunicationAmendmentSelect;
export function amendmentContract(row: Prisma.CommunicationAmendmentGetPayload<{ select: typeof amendmentSelect }>): AmendmentDto {
  return { id: row.id, communicationId: row.communicationId, type: row.type, content: row.content, createdAt: row.createdAt.toISOString(),
    author: { id: row.author.id, displayName: row.author.givenNames + ' ' + row.author.familyNames, isActive: row.author.isActive } };
}
@Injectable()
export class CommunicationAmendmentsService {
  constructor(private readonly prisma: PrismaService, private readonly users: UsersService, private readonly audit: AuditService) {}
  private authorize(actor: UserIdentity | null, permission: string) {
    if (!actor?.isActive || !hasPermission(actor.role, permission) || !hasPermission(actor.role, PERMISSIONS.COMMUNICATION_READ) || !hasPermission(actor.role, PERMISSIONS.PROCESS_READ)) throw new AmendmentError('FORBIDDEN');
    return actor;
  }
  create(communicationId: string, type: AmendmentType, input: unknown, actorId: string, requestKey: string): Promise<AmendmentDto> {
    const content = amendmentContent(type, input, requestKey), fingerprint = amendmentFingerprint(communicationId, type, content);
    return this.users.withLockedCredentials(actorId, async (current, tx) => {
      const actor = this.authorize(current, type === 'INVALIDATION' ? PERMISSIONS.COMMUNICATION_INVALIDATE : PERMISSIONS.COMMUNICATION_AMEND);
      // Orden de locks: credenciales y luego comunicación; no se bloquea/modifica el proceso.
      const [row] = await tx.$queryRaw<{ id: string; processId: string; validity: string; registeredByUserId: string }[]>`SELECT id, "processId", validity, "registeredByUserId" FROM "Communication" WHERE id=${communicationId}::uuid FOR UPDATE`;
      if (!row) throw new AmendmentError('COMMUNICATION_NOT_FOUND');
      if (type === 'INVALIDATION' && !canInvalidate(actor.role, actor.id, row.registeredByUserId)) throw new AmendmentError('FORBIDDEN');
      const prior = await tx.communicationAmendment.findUnique({ where: { authorUserId_requestKey: { authorUserId: actor.id, requestKey } }, select: { ...amendmentSelect, requestFingerprint: true } });
      if (prior) { if (prior.requestFingerprint !== fingerprint) throw new AmendmentError('REQUEST_CONFLICT'); return amendmentContract(prior); }
      assertAmendmentAllowed(type, row.validity);
      const created = await tx.communicationAmendment.create({ data: { communicationId, type, content, authorUserId: actor.id, requestKey, requestFingerprint: fingerprint, createdAt: new Date() }, select: amendmentSelect });
      if (type === 'INVALIDATION') {
        await tx.communication.update({ where: { id: communicationId }, data: { validity: 'INVALIDATED', version: { increment: 1 } } });
        await this.audit.recordCommunicationInvalidated(communicationId, row.processId, actor.id, created.id, tx);
      }
      return amendmentContract(created);
    });
  }
  async list(id: string, page: number, actorId: string) {
    return this.prisma.$transaction(async tx => {
      this.authorize(await this.users.findIdentityById(actorId, tx), PERMISSIONS.COMMUNICATION_READ);
      if (!await tx.communication.findUnique({ where: { id }, select: { id: true } })) throw new AmendmentError('COMMUNICATION_NOT_FOUND');
      const where = { communicationId: id };
      return { items: (await tx.communicationAmendment.findMany({ where, select: amendmentSelect, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], skip: (page - 1) * 25, take: 25 })).map(amendmentContract),
        total: await tx.communicationAmendment.count({ where }), page, pageSize: 25 };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  async timelineItems(processId: string, after: TimelinePosition | undefined, limit: number, tx: Prisma.TransactionClient): Promise<TimelineItem[]> {
    return (await tx.communicationAmendment.findMany({ where: { communication: { processId }, ...timelineSeek(after, 'AMENDMENT', 'createdAt') }, select: amendmentSelect,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: limit })).map(row => {
      const item = amendmentContract(row);
      return { id: item.id, kind: item.type === 'CORRECTION' ? 'COMMUNICATION_CORRECTED' : item.type === 'ANNOTATION' ? 'COMMUNICATION_ANNOTATED' : 'COMMUNICATION_INVALIDATED',
        occurredAt: item.createdAt, registeredAt: item.createdAt, actor: item.author, summary: item.type,
        payload: { amendmentId: item.id, communicationId: item.communicationId, content: item.content } };
    });
  }
}
