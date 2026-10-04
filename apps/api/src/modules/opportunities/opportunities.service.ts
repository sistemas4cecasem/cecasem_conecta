import { Injectable } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { PrismaService } from '../../database/prisma.service';
import { OpportunityEventType, OpportunityStatus, Prisma } from '../../generated/prisma/client';
import { UsersService } from '../users/users.service';
import type { UserIdentity } from '../users/user-projections';
import { PERMISSIONS, type Permission } from '../auth/authorization/permission';
import { hasPermission } from '../auth/authorization/role-permissions';
import { DirectoryTargetService, UnavailableDirectoryTarget } from '../directory/directory-target.service';
import { RelationshipProcessesService } from '../relationships/relationship-processes.service';
import { CommunicationsService } from '../communications/communications.service';
import { AuditService } from '../audit/audit.service';
import { OpportunityError, OPPORTUNITY_TRANSITIONS, opportunityDescriptions, opportunityFingerprint, opportunityOrigin, opportunityText, opportunityVersion, requireOpportunityTransition, opportunityHistorySeek, type OpportunityDescriptions, type OpportunityHistoryCursor } from './opportunity.rules';
import type { CreateOpportunityDto, DiscardOpportunityDto, OpportunityDto, OpportunityHistoryItemDto, OpportunityQueryDto, OpportunityStateDto, UpdateOpportunityDto } from './opportunity.dto';
const identitySelect = { id: true, givenNames: true, familyNames: true, isActive: true } as const;
const opportunitySelect = { id: true, name: true, description: true, url: true, deadline: true, requirements: true, status: true, discardReason: true, finalResult: true, version: true, createdAt: true, updatedAt: true,
  createdBy: { select: identitySelect }, organizations: { select: { organization: { select: { id: true, name: true, isActive: true } } }, orderBy: { organizationId: 'asc' } },
  process: { select: { id: true, purpose: true } }, communication: { select: { id: true, subject: true, processId: true, validity: true } } } satisfies Prisma.OpportunitySelect;
type OpportunityRow = Prisma.OpportunityGetPayload<{
  select: typeof opportunitySelect;
}>;
const publicUser = (user: {
  id: string;
  givenNames: string;
  familyNames: string;
  isActive: boolean;
}) => ({ id: user.id, displayName: user.givenNames + ' ' + user.familyNames, isActive: user.isActive });
function descriptions(row: OpportunityRow): OpportunityDescriptions { return { name: row.name, description: row.description, url: row.url, deadline: row.deadline?.toISOString().slice(0, 10) ?? null, requirements: row.requirements, organizationIds: row.organizations.map(link => link.organization.id) }; }
const persistent = (value: OpportunityDescriptions) => ({ name: value.name, description: value.description, url: value.url, deadline: value.deadline ? new Date(value.deadline + 'T00:00:00.000Z') : null, requirements: value.requirements });
const auditActions = { CREATED: 'OPPORTUNITY_CREATED', UPDATED: 'OPPORTUNITY_UPDATED', STATUS_CHANGED: 'OPPORTUNITY_STATUS_CHANGED', DISCARDED: 'OPPORTUNITY_DISCARDED', FINISHED: 'OPPORTUNITY_FINISHED' } as const;
/** Contrato interno público para consumidores futuros: hechos confirmados, no callbacks durante la transacción. */
export interface OpportunityActivity {
  id: string;
  opportunityId: string;
  kind: OpportunityEventType;
  createdAt: string;
  actorUserId: string;
  previousStatus: OpportunityStatus | null;
  newStatus: OpportunityStatus;
  name: string;
}
@Injectable()
export class OpportunitiesService {
  constructor(private readonly prisma: PrismaService, private readonly users: UsersService, private readonly targets: DirectoryTargetService, private readonly processes: RelationshipProcessesService, private readonly communications: CommunicationsService, private readonly audit: AuditService) { }
  private authorize(actor: UserIdentity | null, permission: Permission) { if (!actor?.isActive || !hasPermission(actor.role, permission))
    throw new OpportunityError('FORBIDDEN'); return actor; }
  private contract(row: OpportunityRow, actor: UserIdentity): OpportunityDto {
    return { ...persistent(descriptions(row)), deadline: row.deadline?.toISOString().slice(0, 10) ?? null, id: row.id, status: row.status, discardReason: row.discardReason, finalResult: row.finalResult,
      version: row.version, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), createdBy: publicUser(row.createdBy), organizations: row.organizations.map(link => link.organization),
      process: row.process, communication: row.communication, canEdit: hasPermission(actor.role, PERMISSIONS.OPPORTUNITY_UPDATE),
      allowedStatuses: [...OPPORTUNITY_TRANSITIONS[row.status]].filter(status => hasPermission(actor.role, status === 'DISCARDED' ? PERMISSIONS.OPPORTUNITY_DISCARD : status === 'FINISHED' ? PERMISSIONS.OPPORTUNITY_FINISH : PERMISSIONS.OPPORTUNITY_STATE_CHANGE)) };
  }
  private async requireRow(id: string, tx: Prisma.TransactionClient) { const row = await tx.opportunity.findUnique({ where: { id }, select: opportunitySelect }); if (!row)
    throw new OpportunityError('OPPORTUNITY_NOT_FOUND'); return row; }
  private async organizations(ids: string[], retained: string[], tx: Prisma.TransactionClient) {
    try {
      return await this.targets.requireOrganizationLinks(ids, retained, tx);
    }
    catch (error) {
      if (error instanceof UnavailableDirectoryTarget)
        throw new OpportunityError('OPPORTUNITY_ORGANIZATION_UNAVAILABLE');
      throw error;
    }
  }
  private async origin(origin: ReturnType<typeof opportunityOrigin>, actor: UserIdentity, tx: Prisma.TransactionClient) {
    try {
      if (origin.processId) {
        this.authorize(actor, PERMISSIONS.PROCESS_READ);
        await this.processes.requireOpportunityOrigin(origin.processId, tx);
      }
      if (origin.communicationId) {
        this.authorize(actor, PERMISSIONS.COMMUNICATION_READ);
        const row = await this.communications.requireOpportunityOrigin(origin.communicationId, tx);
        if (origin.processId && row.processId !== origin.processId)
          throw new OpportunityError('INVALID_OPPORTUNITY_ORIGIN');
      }
    }
    catch (error) {
      if (error instanceof Error && 'code' in error && ['PROCESS_NOT_FOUND', 'COMMUNICATION_NOT_FOUND'].includes(String(error.code)))
        throw new OpportunityError('INVALID_OPPORTUNITY_ORIGIN');
      throw error;
    }
  }
  private async record(id: string, type: OpportunityEventType, previousStatus: OpportunityStatus | null, newStatus: OpportunityStatus, version: number, changes: Prisma.InputJsonObject, actorId: string, at: Date, tx: Prisma.TransactionClient) {
    const event = await tx.opportunityEvent.create({ data: { opportunityId: id, type, previousStatus, newStatus, version, changes, actorUserId: actorId, createdAt: at } });
    await this.audit.recordOpportunity(auditActions[type], event.id, actorId, tx);
  }
  async create(input: CreateOpportunityDto, actorId: string, requestKey: string): Promise<OpportunityDto> {
    if (!isUUID(requestKey))
      throw new OpportunityError('INVALID_OPPORTUNITY');
    const values = opportunityDescriptions(input), origin = opportunityOrigin(input), fingerprint = opportunityFingerprint(values, origin);
    return this.users.withLockedCredentials(actorId, async (current, tx) => {
      const actor = this.authorize(current, PERMISSIONS.OPPORTUNITY_CREATE);
      const prior = await tx.opportunity.findUnique({ where: { createdByUserId_requestKey: { createdByUserId: actorId, requestKey } }, select: { id: true, requestFingerprint: true } });
      if (prior) {
        if (prior.requestFingerprint !== fingerprint)
          throw new OpportunityError('REQUEST_CONFLICT');
        return this.contract(await this.requireRow(prior.id, tx), actor);
      }
      await this.origin(origin, actor, tx);
      await this.organizations(values.organizationIds, [], tx);
      const now = new Date(), row = await tx.opportunity.create({ data: { ...persistent(values), ...origin, createdByUserId: actorId, requestKey, requestFingerprint: fingerprint, createdAt: now, updatedAt: now,
          organizations: { create: values.organizationIds.map(organizationId => ({ organizationId })) } }, select: opportunitySelect });
      await this.record(row.id, 'CREATED', null, row.status, row.version, { description: { previous: null, next: { ...values, ...origin, organizations: row.organizations.map(link => ({ id: link.organization.id, name: link.organization.name })) } } }, actorId, now, tx);
      return this.contract(row, actor);
    });
  }
  async list(query: OpportunityQueryDto, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const actor = this.authorize(await this.users.findIdentityById(actorId, tx), PERMISSIONS.OPPORTUNITY_READ);
      const where: Prisma.OpportunityWhereInput = { ...(query.status === 'all' ? {} : { status: query.status }), ...(query.organizationId ? { organizations: { some: { organizationId: query.organizationId } } } : {}),
        ...(query.processId ? { processId: query.processId } : {}), ...(query.communicationId ? { communicationId: query.communicationId } : {}) };
      const rows = await tx.opportunity.findMany({ where, select: opportunitySelect, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize });
      return { items: rows.map(row => this.contract(row, actor)), total: await tx.opportunity.count({ where }), page: query.page, pageSize: query.pageSize };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  async get(id: string, actorId: string): Promise<OpportunityDto> {
    return this.prisma.$transaction(async (tx) => { const actor = this.authorize(await this.users.findIdentityById(actorId, tx), PERMISSIONS.OPPORTUNITY_READ); return this.contract(await this.requireRow(id, tx), actor); }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  private async mutate(id: string, expectedVersion: number, actorId: string, permission: Permission, operation: (row: OpportunityRow, actor: UserIdentity, tx: Prisma.TransactionClient) => Promise<OpportunityDto>) {
    opportunityVersion(expectedVersion);
    return this.users.withLockedCredentials(actorId, async (current, tx) => {
      const actor = this.authorize(current, permission);
      await tx.$queryRaw `SELECT id FROM "Opportunity" WHERE id=${id}::uuid FOR UPDATE`;
      const row = await this.requireRow(id, tx);
      if (row.version !== expectedVersion)
        throw new OpportunityError('VERSION_CONFLICT');
      return operation(row, actor, tx);
    });
  }
  async update(id: string, input: UpdateOpportunityDto, actorId: string): Promise<OpportunityDto> {
    return this.mutate(id, input.expectedVersion, actorId, PERMISSIONS.OPPORTUNITY_UPDATE, async (row, actor, tx) => {
      const previous = descriptions(row), next = opportunityDescriptions(input, previous), changes: Record<string, Prisma.InputJsonValue | null> = {};
      for (const key of Object.keys(previous) as (keyof OpportunityDescriptions)[])
        if (JSON.stringify(previous[key]) !== JSON.stringify(next[key]))
          changes[key] = { previous: previous[key], next: next[key] };
      if (!Object.keys(changes).length)
        return this.contract(row, actor);
      const organizations = await this.organizations(next.organizationIds, previous.organizationIds, tx);
      if (changes.organizationIds)
        changes.organizations = { previous: row.organizations.map(link => ({ id: link.organization.id, name: link.organization.name })), next: organizations.map(org => ({ id: org.id, name: org.name })) };
      const at = new Date(Math.max(Date.now(), +row.updatedAt));
      const changed = await tx.opportunity.updateMany({ where: { id, version: input.expectedVersion }, data: { ...persistent(next), version: { increment: 1 }, updatedAt: at } });
      if (changed.count !== 1)
        throw new OpportunityError('VERSION_CONFLICT');
      await tx.opportunityOrganization.deleteMany({ where: { opportunityId: id, organizationId: { notIn: next.organizationIds } } });
      await tx.opportunityOrganization.createMany({ data: next.organizationIds.filter(org => !previous.organizationIds.includes(org)).map(organizationId => ({ opportunityId: id, organizationId })) });
      await this.record(id, 'UPDATED', row.status, row.status, row.version + 1, changes, actorId, at, tx);
      return this.contract(await this.requireRow(id, tx), actor);
    });
  }
  async changeState(id: string, input: OpportunityStateDto, actorId: string) {
    if (input.status === 'DISCARDED')
      throw new OpportunityError('INVALID_OPPORTUNITY_TRANSITION');
    const result = opportunityText(input.finalResult, 5000);
    if (input.status !== 'FINISHED' && result !== null)
      throw new OpportunityError('INVALID_OPPORTUNITY');
    return this.transition(id, input.expectedVersion, input.status, null, result, actorId);
  }
  async discard(id: string, input: DiscardOpportunityDto, actorId: string) { return this.transition(id, input.expectedVersion, 'DISCARDED', opportunityText(input.reason, 5000, true), null, actorId); }
  private async transition(id: string, expectedVersion: number, status: OpportunityStatus, reason: string | null, finalResult: string | null, actorId: string) {
    const permission = status === 'DISCARDED' ? PERMISSIONS.OPPORTUNITY_DISCARD : status === 'FINISHED' ? PERMISSIONS.OPPORTUNITY_FINISH : PERMISSIONS.OPPORTUNITY_STATE_CHANGE;
    return this.mutate(id, expectedVersion, actorId, permission, async (row, actor, tx) => {
      requireOpportunityTransition(row.status, status);
      const at = new Date(Math.max(Date.now(), +row.updatedAt));
      const changed = await tx.opportunity.updateMany({ where: { id, version: expectedVersion, status: row.status }, data: { status, discardReason: reason, finalResult, updatedAt: at, version: { increment: 1 } } });
      if (changed.count !== 1)
        throw new OpportunityError('VERSION_CONFLICT');
      const type = status === 'DISCARDED' ? 'DISCARDED' : status === 'FINISHED' ? 'FINISHED' : 'STATUS_CHANGED';
      await this.record(id, type, row.status, status, row.version + 1, { ...(reason ? { discardReason: { previous: null, next: reason } } : {}), ...(finalResult ? { finalResult: { previous: null, next: finalResult } } : {}) }, actorId, at, tx);
      return this.contract(await this.requireRow(id, tx), actor);
    });
  }
  async requireAttachmentOpportunity(id: string, tx: Prisma.TransactionClient, uploading: boolean) {
    if (uploading)
      await tx.$queryRaw `SELECT id FROM "Opportunity" WHERE id=${id}::uuid FOR UPDATE`;
    const row = await tx.opportunity.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!row)
      throw new OpportunityError('OPPORTUNITY_NOT_FOUND');
    return row;
  }
  async assertRead(id: string, actorId: string, tx: Prisma.TransactionClient) { this.authorize(await this.users.findIdentityById(actorId, tx), PERMISSIONS.OPPORTUNITY_READ); await this.requireAttachmentOpportunity(id, tx, false); }
  /** Proyección pública interna mínima para notificaciones; no incluye contenido privado. */
  notificationSummaries(ids: string[]) {
    if (ids.length > 100 || ids.some(id => !isUUID(id))) throw new OpportunityError('INVALID_OPPORTUNITY');
    return this.prisma.opportunity.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, status: true } });
  }
  async historyItems(id: string, after: OpportunityHistoryCursor | undefined, limit: number, tx: Prisma.TransactionClient): Promise<OpportunityHistoryItemDto[]> {
    const rows = await tx.opportunityEvent.findMany({ where: { opportunityId: id, ...opportunityHistorySeek(after, 'EVENT') }, select: { id: true, type: true, previousStatus: true, newStatus: true, changes: true, createdAt: true, actor: { select: identitySelect } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: limit });
    return rows.map(row => ({ id: row.id, source: 'EVENT', kind: row.type, previousStatus: row.previousStatus, newStatus: row.newStatus, changes: row.changes as Record<string, unknown>, createdAt: row.createdAt.toISOString(), actor: publicUser(row.actor) }));
  }
  /** Frontera pública 4.5: paginación de hechos de dominio confirmados. No implementa notificaciones. */
  recordedActivityUpperBound(): Promise<{ createdAt: Date; id: string } | null> {
    return this.prisma.opportunityEvent.findFirst({ where: { type: { in: ['CREATED', 'STATUS_CHANGED', 'DISCARDED', 'FINISHED'] } },
      select: { createdAt: true, id: true }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
  }
  async recordedActivity(after?: {
    createdAt: Date;
    id: string;
  }, limit = 100, through?: { createdAt: Date; id: string }): Promise<{
    items: OpportunityActivity[];
    next: {
      createdAt: Date;
      id: string;
    } | null;
  }> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || [after, through].some(cursor => cursor && (!isUUID(cursor.id) || !Number.isFinite(+cursor.createdAt))))
      throw new OpportunityError('INVALID_OPPORTUNITY_CURSOR');
    const rows = await this.prisma.opportunityEvent.findMany({ where: { type: { in: ['CREATED', 'STATUS_CHANGED', 'DISCARDED', 'FINISHED'] }, AND: [
      ...(after ? [{ OR: [{ createdAt: { gt: after.createdAt } }, { createdAt: after.createdAt, id: { gt: after.id } }] }] : []),
      ...(through ? [{ OR: [{ createdAt: { lt: through.createdAt } }, { createdAt: through.createdAt, id: { lte: through.id } }] }] : []),
    ] },
      select: { id: true, opportunityId: true, type: true, createdAt: true, actorUserId: true, previousStatus: true, newStatus: true, opportunity: { select: { name: true } } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: limit + 1 });
    const visible = rows.slice(0, limit), last = visible.at(-1);
    return { items: visible.map(row => ({ id: row.id, opportunityId: row.opportunityId, kind: row.type, createdAt: row.createdAt.toISOString(), actorUserId: row.actorUserId, previousStatus: row.previousStatus, newStatus: row.newStatus, name: row.opportunity.name })), next: rows.length > limit && last ? { createdAt: last.createdAt, id: last.id } : null };
  }
}
