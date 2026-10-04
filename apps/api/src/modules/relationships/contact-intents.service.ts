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
import { canCancelIntent, canConvertIntent, IntentError, intentPurpose, intentTarget, requireActiveIntent } from './contact-intent.rules';
import type { ContactIntentDto, ContactIntentQueryDto, ConvertedContactIntentDto, CreateContactIntentDto } from './contact-intent.dto';
import type { ProcessDetailDto } from './relationship-process.dto';
import { RelationshipProcessesService } from './relationship-processes.service';
import { ProcessError } from './relationship-process.rules';
import { ContactRestrictionsService } from './contact-restrictions.service';

const identitySelect = { id: true, givenNames: true, familyNames: true, isActive: true } as const;
const intentSelect = { id: true, purpose: true, state: true, version: true, organizationId: true, personId: true,
  createdAt: true, updatedAt: true, lastActivityAt: true, cancelledAt: true, authorUserId: true,
  author: { select: identitySelect }, cancelledBy: { select: identitySelect }, originatedProcess: { select: { id: true } } } satisfies Prisma.ContactIntentSelect;
type IntentRow = Prisma.ContactIntentGetPayload<{ select: typeof intentSelect }>;

@Injectable()
export class ContactIntentsService {
  constructor(private readonly prisma: PrismaService, private readonly users: UsersService,
    private readonly targets: DirectoryTargetService, private readonly audit: AuditService,
    private readonly processes: RelationshipProcessesService, private readonly restrictions: ContactRestrictionsService) {}

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
      target, processId: row.originatedProcess?.id ?? null,
      canConvert: row.state === ContactIntentState.ACTIVE && !row.originatedProcess && hasPermission(reader.role, PERMISSIONS.INTENT_CONVERT) && canConvertIntent(reader.role, reader.id, row.authorUserId),
      canCancel: row.state === ContactIntentState.ACTIVE && hasPermission(reader.role, PERMISSIONS.INTENT_CANCEL) && canCancelIntent(reader.role, reader.id, row.authorUserId) };
  }
  async create(input: CreateContactIntentDto, actorId: string): Promise<ContactIntentDto> {
    const purpose = intentPurpose(input.purpose), target = intentTarget(input);
    return this.users.withLockedCredentials(actorId, async (current, tx) => {
      const actor = this.requirePermission(current, PERMISSIONS.INTENT_CREATE);
      try { await this.targets.requireUsable(target, tx); } catch (error) {
        if (error instanceof UnavailableDirectoryTarget) throw new IntentError('INTENT_TARGET_UNAVAILABLE');
        throw error;
      }
      await this.restrictions.assertContactAllowed(target, tx);
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
  async convert(id: string, expectedVersion: number, actorId: string): Promise<ConvertedContactIntentDto> {
    return this.users.withLockedCredentials(actorId, async (current, tx) => {
      const actor = this.requirePermission(current, PERMISSIONS.INTENT_CONVERT);
      await tx.$queryRaw`SELECT id FROM "ContactIntent" WHERE id=${id}::uuid FOR UPDATE`;
      const row = await tx.contactIntent.findUnique({ where: { id }, select: intentSelect });
      if (!row) throw new IntentError('INTENT_NOT_FOUND');
      if (!canConvertIntent(actor.role, actor.id, row.authorUserId)) throw new IntentError('FORBIDDEN');
      requireActiveIntent(row.state, row.version, expectedVersion);
      if (row.originatedProcess) throw new IntentError('INTENT_NOT_ACTIVE');
      const now = new Date(Math.max(Date.now(), +row.lastActivityAt));
      const operationId = randomUUID();
      let process: ProcessDetailDto;
      try {
        process = await this.processes.createInTransaction({ purpose: row.purpose,
          ...(row.organizationId ? { organizationId: row.organizationId } : { personId: row.personId! }) }, actor, tx, { intentId: id, at: now, operationId });
      } catch (error) {
        if (error instanceof ProcessError && error.code === 'PROCESS_TARGET_UNAVAILABLE') throw new IntentError('INTENT_TARGET_UNAVAILABLE');
        throw error;
      }
      const changed = await tx.contactIntent.updateMany({ where: { id, state: ContactIntentState.ACTIVE, version: expectedVersion },
        data: { state: ContactIntentState.CONVERTED, version: { increment: 1 }, lastActivityAt: new Date(process.createdAt), updatedAt: new Date(process.createdAt) } });
      if (changed.count !== 1) throw new IntentError('VERSION_CONFLICT');
      await this.audit.recordContactIntent(AuditAction.CONTACT_INTENT_CONVERTED, id, actor.id, operationId, tx);
      return { intent: await this.contract(await tx.contactIntent.findUniqueOrThrow({ where: { id }, select: intentSelect }), actor, tx), process };
    });
  }
}
