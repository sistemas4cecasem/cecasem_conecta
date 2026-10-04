import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ContactIntentState, Prisma, ProcessState } from '../../generated/prisma/client';
import { UsersService } from '../users/users.service';
import { hasPermission } from '../auth/authorization/role-permissions';
import { DirectoryTargetService, UnavailableDirectoryTarget, type InstitutionalTarget, type TargetSummary } from '../directory/directory-target.service';
import { ContactRestrictionsService } from './contact-restrictions.service';
import { CommunicationsService } from '../communications/communications.service';
import { ContextError, contextTarget, CONTEXT_ITEM_LIMIT, CONTEXT_ORGANIZATION_LIMIT, CONTEXT_READ_PERMISSIONS } from './relationship-context.rules';
import type { ActorContextDto, ContextUserDto, RelationshipContextDto, RelationshipContextQueryDto } from './relationship-context.dto';
const userSelect = { id: true, givenNames: true, familyNames: true, isActive: true } as const;
const userContract = (user: { id: string; givenNames: string; familyNames: string; isActive: boolean }): ContextUserDto =>
  ({ id: user.id, displayName: user.givenNames + ' ' + user.familyNames, isActive: user.isActive });
const processSelect = { id: true, purpose: true, state: true, createdBy: { select: userSelect }, createdAt: true,
  lastActivityAt: true, currentResult: true, closedAt: true } satisfies Prisma.RelationshipProcessSelect;
@Injectable()
export class RelationshipContextService {
  constructor(private readonly prisma: PrismaService, private readonly users: UsersService,
    private readonly directory: DirectoryTargetService, private readonly restrictions: ContactRestrictionsService, private readonly communications: CommunicationsService) {}
  async get(input: RelationshipContextQueryDto, actorId: string): Promise<RelationshipContextDto> {
    const target = contextTarget(input);
    return this.prisma.$transaction(async tx => {
      const user = await this.users.findIdentityById(actorId, tx);
      if (!user?.isActive || !CONTEXT_READ_PERMISSIONS.every(permission => hasPermission(user.role, permission))) throw new ContextError('FORBIDDEN');
      let summary: TargetSummary;
      try { summary = await this.directory.summary(target, tx); } catch (error) {
        if (error instanceof UnavailableDirectoryTarget) throw new ContextError('CONTEXT_TARGET_NOT_FOUND');
        throw error;
      }
      const direct = await this.actorContext(target, summary, tx);
      const organizations = target.personId ? await this.directory.currentOrganizationContext(target.personId, CONTEXT_ORGANIZATION_LIMIT, tx) : { items: [], total: 0 };
      const related: ActorContextDto[] = [];
      for (const organization of organizations.items) related.push(await this.actorContext({ organizationId: organization.id }, organization, tx));
      return { ...direct, relatedOrganizationContext: { items: related, total: organizations.total } };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  private async actorContext(target: InstitutionalTarget, summary: TargetSummary, tx: Prisma.TransactionClient): Promise<ActorContextDto> {
    const restriction = await this.restrictions.getActiveRestriction(target, tx);
    const activeIntentWhere = { ...target, state: ContactIntentState.ACTIVE };
    const activeProcessWhere = { ...target, state: { not: ProcessState.CLOSED } };
    const closedProcessWhere = { ...target, state: ProcessState.CLOSED };
    const intents = await tx.contactIntent.findMany({ where: activeIntentWhere, select: { id: true, purpose: true, author: { select: userSelect }, createdAt: true, lastActivityAt: true },
      orderBy: [{ lastActivityAt: 'desc' }, { id: 'desc' }], take: CONTEXT_ITEM_LIMIT });
    const activeIntentCount = await tx.contactIntent.count({ where: activeIntentWhere });
    const active = await tx.relationshipProcess.findMany({ where: activeProcessWhere, select: processSelect,
      orderBy: [{ lastActivityAt: 'desc' }, { id: 'desc' }], take: CONTEXT_ITEM_LIMIT });
    const activeProcessCount = await tx.relationshipProcess.count({ where: activeProcessWhere });
    const closed = await tx.relationshipProcess.findMany({ where: closedProcessWhere, select: processSelect,
      orderBy: [{ closedAt: 'desc' }, { lastActivityAt: 'desc' }, { id: 'desc' }], take: CONTEXT_ITEM_LIMIT });
    const closedProcessCount = await tx.relationshipProcess.count({ where: closedProcessWhere });
    const intentCount = await tx.contactIntent.count({ where: target });
    const history = await this.communications.historyForActor(target, tx);
    const processContract = (row: (typeof active)[number]) => ({ id: row.id, purpose: row.purpose, state: row.state, target: summary, createdBy: userContract(row.createdBy),
      createdAt: row.createdAt.toISOString(), lastActivityAt: row.lastActivityAt.toISOString(), result: row.currentResult, closedAt: row.closedAt?.toISOString() ?? null });
    return { target: summary, restriction: restriction ? { ...restriction, createdAt: restriction.createdAt.toISOString() } : null, contactAllowed: !restriction,
      activeIntents: { items: intents.map(row => ({ ...row, target: summary, author: userContract(row.author), createdAt: row.createdAt.toISOString(), lastActivityAt: row.lastActivityAt.toISOString() })), total: activeIntentCount },
      activeProcesses: { items: active.map(processContract), total: activeProcessCount }, recentClosedProcesses: { items: closed.map(processContract), total: closedProcessCount },
      hasRelationshipHistory: intentCount + activeProcessCount + closedProcessCount > 0, hasRegisteredCommunicationHistory: history.exists,
      communicationSummary: { total: history.total, lastOccurredAt: history.lastOccurredAt, lastDirection: history.lastDirection }, recentCommunications: history.items };
  }
}
