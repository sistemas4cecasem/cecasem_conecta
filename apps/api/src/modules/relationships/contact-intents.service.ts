import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { AuditAction, ContactIntentState, Prisma } from '../../generated/prisma/client';
import { UsersService } from '../users/users.service';
import type { UserIdentity } from '../users/user-projections';
import { hasPermission } from '../auth/authorization/role-permissions';
import { PERMISSIONS, type Permission } from '../auth/authorization/permission';
import { AuditService } from '../audit/audit.service';
import { DirectoryTargetService, UnavailableDirectoryTarget } from '../directory/directory-target.service';
import { canCancelIntent, IntentError, intentPurpose, intentTarget, requireActiveIntent } from './contact-intent.rules';
import type { ContactIntentDto, ContactIntentQueryDto, CreateContactIntentDto } from './contact-intent.dto';

const identitySelect = { id: true, givenNames: true, familyNames: true, isActive: true } as const;
const intentSelect = { id: true, purpose: true, state: true, version: true, organizationId: true, personId: true,
  createdAt: true, updatedAt: true, lastActivityAt: true, cancelledAt: true, authorUserId: true,
  author: { select: identitySelect }, cancelledBy: { select: identitySelect } } satisfies Prisma.ContactIntentSelect;
type IntentRow = Prisma.ContactIntentGetPayload<{ select: typeof intentSelect }>;

@Injectable()
export class ContactIntentsService {
  constructor(private readonly prisma: PrismaService, private readonly users: UsersService,
    private readonly targets: DirectoryTargetService, private readonly audit: AuditService) {}

  private requirePermission(user: UserIdentity | null, permission: Permission): UserIdentity {
    if (!user?.isActive || !hasPermission(user.role, permission)) throw new IntentError('FORBIDDEN');
    return user;
  }
  private async contract(row: IntentRow, reader: UserIdentity, tx: Prisma.TransactionClient): Promise<ContactIntentDto> {
    const identity = (user: IntentRow['author']) => ({ id: user.id, displayName: [user.givenNames, user.familyNames].join(' '), isActive: user.isActive });
    const target = await this.targets.summary(row.organizationId ? { organizationId: row.organizationId } : { personId: row.personId! }, tx);
    return { id: row.id, purpose: row.purpose, state: row.state, version: row.version,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), lastActivityAt: row.lastActivityAt.toISOString(),
      cancelledAt: row.cancelledAt?.toISOString() ?? null, author: identity(row.author), cancelledBy: row.cancelledBy ? identity(row.cancelledBy) : null,
      target, canCancel: row.state === ContactIntentState.ACTIVE && hasPermission(reader.role, PERMISSIONS.INTENT_CANCEL) && canCancelIntent(reader.role, reader.id, row.authorUserId) };
  }
  async create(input: CreateContactIntentDto, actorId: string): Promise<ContactIntentDto> {
    const purpose = intentPurpose(input.purpose), target = intentTarget(input);
    return this.users.withLockedCredentials(actorId, async (current, tx) => {
      const actor = this.requirePermission(current, PERMISSIONS.INTENT_CREATE);
      try { await this.targets.requireUsable(target, tx); } catch (error) {
        if (error instanceof UnavailableDirectoryTarget) throw new IntentError('INTENT_TARGET_UNAVAILABLE');
        throw error;
      }
      const now = new Date();
      const row = await tx.contactIntent.create({ data: { purpose, ...target, authorUserId: actor.id,
        createdAt: now, updatedAt: now, lastActivityAt: now }, select: intentSelect });
      await this.audit.recordContactIntent(AuditAction.CONTACT_INTENT_CREATED, row.id, actor.id, randomUUID(), tx);
      return this.contract(row, actor, tx);
    });
  }
  async list(query: ContactIntentQueryDto, actorId: string) {
    return this.prisma.$transaction(async tx => {
      const actor = this.requirePermission(await this.users.findIdentityById(actorId, tx), PERMISSIONS.INTENT_READ);
      const where: Prisma.ContactIntentWhereInput = { ...(query.state === 'all' ? {} : { state: query.state }),
        ...(query.authorUserId ? { authorUserId: query.authorUserId } : {}), ...(query.organizationId ? { organizationId: query.organizationId } : {}),
        ...(query.personId ? { personId: query.personId } : {}) };
      const rows = await tx.contactIntent.findMany({ where, select: intentSelect, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize, take: query.pageSize });
      const total = await tx.contactIntent.count({ where });
      const items: ContactIntentDto[] = [];
      for (const row of rows) items.push(await this.contract(row, actor, tx));
      return { items, total, page: query.page, pageSize: query.pageSize };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  async get(id: string, actorId: string): Promise<ContactIntentDto> {
    return this.prisma.$transaction(async tx => {
      const actor = this.requirePermission(await this.users.findIdentityById(actorId, tx), PERMISSIONS.INTENT_READ);
      const row = await tx.contactIntent.findUnique({ where: { id }, select: intentSelect });
      if (!row) throw new IntentError('INTENT_NOT_FOUND');
      return this.contract(row, actor, tx);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  async cancel(id: string, expectedVersion: number, actorId: string): Promise<ContactIntentDto> {
    return this.users.withLockedCredentials(actorId, async (current, tx) => {
      const actor = this.requirePermission(current, PERMISSIONS.INTENT_CANCEL);
      await tx.$queryRaw`SELECT id FROM "ContactIntent" WHERE id=${id}::uuid FOR UPDATE`;
      const row = await tx.contactIntent.findUnique({ where: { id }, select: intentSelect });
      if (!row) throw new IntentError('INTENT_NOT_FOUND');
      if (!canCancelIntent(actor.role, actor.id, row.authorUserId)) throw new IntentError('FORBIDDEN');
      requireActiveIntent(row.state, row.version, expectedVersion);
      const now = new Date(Math.max(Date.now(), +row.lastActivityAt));
      const changed = await tx.contactIntent.updateMany({ where: { id, state: ContactIntentState.ACTIVE, version: expectedVersion },
        data: { state: ContactIntentState.CANCELLED, version: { increment: 1 }, cancelledAt: now, cancelledByUserId: actor.id, lastActivityAt: now, updatedAt: now } });
      if (changed.count !== 1) throw new IntentError('VERSION_CONFLICT');
      await this.audit.recordContactIntent(AuditAction.CONTACT_INTENT_CANCELLED, id, actor.id, randomUUID(), tx);
      return this.contract(await tx.contactIntent.findUniqueOrThrow({ where: { id }, select: intentSelect }), actor, tx);
    });
  }
}
