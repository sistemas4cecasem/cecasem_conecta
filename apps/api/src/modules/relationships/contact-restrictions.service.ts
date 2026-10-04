import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { AuditAction, Prisma, RestrictionState } from '../../generated/prisma/client';
import { UsersService } from '../users/users.service';
import type { UserIdentity } from '../users/user-projections';
import { hasPermission } from '../auth/authorization/role-permissions';
import { PERMISSIONS, type Permission } from '../auth/authorization/permission';
import { AuditService } from '../audit/audit.service';
import { DirectoryTargetService, UnavailableDirectoryTarget, type InstitutionalTarget } from '../directory/directory-target.service';
import { RestrictionError, restrictionReason, restrictionTarget, requireActiveRestriction } from './contact-restriction.rules';
import type { ContactRestrictionDto, ContactRestrictionQueryDto, CreateContactRestrictionDto, LiftContactRestrictionDto } from './contact-restriction.dto';
const userSelect = { id: true, givenNames: true, familyNames: true, isActive: true } as const;
const restrictionSelect = { id: true, organizationId: true, personId: true, reason: true, state: true, version: true,
  createdAt: true, updatedAt: true, liftedAt: true, liftReason: true, registeredBy: { select: userSelect }, liftedBy: { select: userSelect } } satisfies Prisma.ContactRestrictionSelect;
type RestrictionRow = Prisma.ContactRestrictionGetPayload<{ select: typeof restrictionSelect }>;
function targetOf(row: { organizationId: string | null; personId: string | null }): InstitutionalTarget {
  return row.organizationId ? { organizationId: row.organizationId } : { personId: row.personId! };
}
@Injectable()
export class ContactRestrictionsService {
  constructor(private readonly prisma: PrismaService, private readonly users: UsersService,
    private readonly targets: DirectoryTargetService, private readonly audit: AuditService) {}
  private requirePermission(user: UserIdentity | null, permission: Permission): UserIdentity {
    if (!user?.isActive || !hasPermission(user.role, permission)) throw new RestrictionError('FORBIDDEN');
    return user;
  }
  /** Después de Users/Directory; el lock permanece hasta confirmar la actuación protegida. */
  private async lockTarget(target: InstitutionalTarget, tx: Prisma.TransactionClient): Promise<void> {
    const key = (target.organizationId ? 'organization:' + target.organizationId : 'person:' + target.personId).toLowerCase();
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(1128612693, hashtext(${key}))::text`;
  }
  async getActiveRestriction(target: InstitutionalTarget, tx: Prisma.TransactionClient = this.prisma) {
    return tx.contactRestriction.findFirst({ where: { ...restrictionTarget(target), state: RestrictionState.ACTIVE }, select: { id: true, reason: true, createdAt: true } });
  }
  /** Interfaz pública: la transacción del productor es obligatoria para evitar una ventana de carrera. */
  async assertContactAllowed(target: InstitutionalTarget, tx: Prisma.TransactionClient): Promise<void> {
    const exclusive = restrictionTarget(target);
    await this.lockTarget(exclusive, tx);
    if (await this.getActiveRestriction(exclusive, tx)) throw new RestrictionError('CONTACT_RESTRICTED');
  }
  private async contract(row: RestrictionRow, actor: UserIdentity, tx: Prisma.TransactionClient): Promise<ContactRestrictionDto> {
    const identity = (user: RestrictionRow['registeredBy']) => ({ id: user.id, displayName: user.givenNames + ' ' + user.familyNames, isActive: user.isActive });
    return { id: row.id, reason: row.reason, state: row.state, version: row.version, target: await this.targets.summary(targetOf(row), tx),
      registeredBy: identity(row.registeredBy), createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
      liftedAt: row.liftedAt?.toISOString() ?? null, liftedBy: row.liftedBy ? identity(row.liftedBy) : null, liftReason: row.liftReason,
      canLift: row.state === RestrictionState.ACTIVE && hasPermission(actor.role, PERMISSIONS.RESTRICTION_LIFT) };
  }
  private async requireRow(id: string, tx: Prisma.TransactionClient) {
    const row = await tx.contactRestriction.findUnique({ where: { id }, select: restrictionSelect });
    if (!row) throw new RestrictionError('RESTRICTION_NOT_FOUND');
    return row;
  }
  async create(input: CreateContactRestrictionDto, actorId: string): Promise<ContactRestrictionDto> {
    const target = restrictionTarget(input), reason = restrictionReason(input.reason);
    return this.users.withLockedCredentials(actorId, async (current, tx) => {
      const actor = this.requirePermission(current, PERMISSIONS.RESTRICTION_CREATE);
      try { await this.targets.requireUsable(target, tx); } catch (error) {
        if (error instanceof UnavailableDirectoryTarget) throw new RestrictionError('RESTRICTION_TARGET_UNAVAILABLE');
        throw error;
      }
      await this.lockTarget(target, tx);
      if (await this.getActiveRestriction(target, tx)) throw new RestrictionError('RESTRICTION_ALREADY_ACTIVE');
      const now = new Date();
      const row = await tx.contactRestriction.create({ data: { ...target, reason, registeredByUserId: actor.id, createdAt: now, updatedAt: now }, select: restrictionSelect });
      await this.audit.recordContactRestriction(AuditAction.CONTACT_RESTRICTION_CREATED, row.id, actor.id, randomUUID(), tx);
      return this.contract(row, actor, tx);
    });
  }
  async lift(id: string, input: LiftContactRestrictionDto, actorId: string): Promise<ContactRestrictionDto> {
    const reason = restrictionReason(input.reason);
    return this.users.withLockedCredentials(actorId, async (current, tx) => {
      const actor = this.requirePermission(current, PERMISSIONS.RESTRICTION_LIFT);
      const initial = await this.requireRow(id, tx);
      await this.lockTarget(targetOf(initial), tx);
      await tx.$queryRaw`SELECT id FROM "ContactRestriction" WHERE id=${id}::uuid FOR UPDATE`;
      const row = await this.requireRow(id, tx);
      requireActiveRestriction(row.state, row.version, input.expectedVersion);
      const now = new Date(Math.max(Date.now(), +row.createdAt));
      const changed = await tx.contactRestriction.updateMany({ where: { id, state: RestrictionState.ACTIVE, version: input.expectedVersion },
        data: { state: RestrictionState.LIFTED, version: { increment: 1 }, liftedAt: now, liftedByUserId: actor.id, liftReason: reason, updatedAt: now } });
      if (changed.count !== 1) throw new RestrictionError('VERSION_CONFLICT');
      await this.audit.recordContactRestriction(AuditAction.CONTACT_RESTRICTION_LIFTED, id, actor.id, randomUUID(), tx);
      return this.contract(await this.requireRow(id, tx), actor, tx);
    });
  }
  async get(id: string, actorId: string): Promise<ContactRestrictionDto> {
    return this.prisma.$transaction(async tx => {
      const actor = this.requirePermission(await this.users.findIdentityById(actorId, tx), PERMISSIONS.RESTRICTION_READ);
      return this.contract(await this.requireRow(id, tx), actor, tx);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  async list(query: ContactRestrictionQueryDto, actorId: string) {
    return this.prisma.$transaction(async tx => {
      const actor = this.requirePermission(await this.users.findIdentityById(actorId, tx), PERMISSIONS.RESTRICTION_READ);
      const where: Prisma.ContactRestrictionWhereInput = { ...(query.state === 'all' ? {} : { state: query.state }),
        ...(query.organizationId ? { organizationId: query.organizationId } : {}), ...(query.personId ? { personId: query.personId } : {}) };
      const rows = await tx.contactRestriction.findMany({ where, select: restrictionSelect, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize });
      const items: ContactRestrictionDto[] = [];
      for (const row of rows) items.push(await this.contract(row, actor, tx));
      return { items, total: await tx.contactRestriction.count({ where }), page: query.page, pageSize: query.pageSize };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
}
