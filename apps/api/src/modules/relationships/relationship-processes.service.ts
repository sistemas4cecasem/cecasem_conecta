import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { AuditAction, ParticipantOrigin, Prisma, ProcessAuthority, ProcessEventType, ProcessState } from '../../generated/prisma/client';
import { UsersService } from '../users/users.service';
import type { UserIdentity } from '../users/user-projections';
import { hasPermission } from '../auth/authorization/role-permissions';
import { PERMISSIONS, type Permission } from '../auth/authorization/permission';
import { AuditService } from '../audit/audit.service';
import { DirectoryTargetService, UnavailableDirectoryTarget } from '../directory/directory-target.service';
import { PROCESS_TRANSITIONS, ProcessError, processAuthority, processClosure, processObservation, processPurpose, processReopening, processTarget, processTransition, processVersion } from './relationship-process.rules';
import type { ChangeProcessStateDto, CloseProcessDto, CreateRelationshipProcessDto, ProcessDetailDto, ProcessEventDto, ProcessQueryDto, ProcessUserDto, RelationshipProcessDto, ReopenProcessDto } from './relationship-process.dto';
import { ProcessParticipationService } from './process-participation.service';
import { ContactRestrictionsService } from './contact-restrictions.service';
import { timelineSeek, type TimelinePosition } from './timeline.rules';
import type { TimelineItem } from './timeline.dto';

const userSelect = { id: true, givenNames: true, familyNames: true, isActive: true } as const;
const processSelect = { id: true, purpose: true, organizationId: true, personId: true, sourceIntentId: true,
  state: true, version: true, createdAt: true, updatedAt: true, lastActivityAt: true, currentResult: true,
  closureObservation: true, closedAt: true, createdBy: { select: userSelect }, closedBy: { select: userSelect } } satisfies Prisma.RelationshipProcessSelect;
const eventSelect = { id: true, type: true, previousState: true, newState: true, result: true, observation: true,
  authority: true, version: true, createdAt: true, actor: { select: userSelect } } satisfies Prisma.RelationshipProcessEventSelect;
type ProcessRow = Prisma.RelationshipProcessGetPayload<{ select: typeof processSelect }>;
type EventRow = Prisma.RelationshipProcessEventGetPayload<{ select: typeof eventSelect }>;
type ProcessMutation = { kind: 'state'; input: ChangeProcessStateDto } | { kind: 'close'; input: CloseProcessDto } | { kind: 'reopen'; input: ReopenProcessDto };
const mutationPermissions = { state: PERMISSIONS.PROCESS_STATE_CHANGE, close: PERMISSIONS.PROCESS_CLOSE, reopen: PERMISSIONS.PROCESS_REOPEN };
const mutationEvents = { state: ProcessEventType.STATE_CHANGED, close: ProcessEventType.CLOSED, reopen: ProcessEventType.REOPENED };
const mutationAudits = { state: AuditAction.PROCESS_STATE_CHANGED, close: AuditAction.PROCESS_CLOSED, reopen: AuditAction.PROCESS_REOPENED };
function publicUser(user: { id: string; givenNames: string; familyNames: string; isActive: boolean }): ProcessUserDto {
  return { id: user.id, displayName: [user.givenNames, user.familyNames].join(' '), isActive: user.isActive };
}
function publicEvent(row: EventRow): ProcessEventDto {
  return { ...row, actor: publicUser(row.actor), createdAt: row.createdAt.toISOString() };
}

@Injectable()
export class RelationshipProcessesService {
  constructor(private readonly prisma: PrismaService, private readonly users: UsersService,
    private readonly targets: DirectoryTargetService, private readonly audit: AuditService,
    private readonly participation: ProcessParticipationService, private readonly restrictions: ContactRestrictionsService) {}

  private requirePermission(user: UserIdentity | null, permission: Permission): UserIdentity {
    if (!user?.isActive || !hasPermission(user.role, permission)) throw new ProcessError('FORBIDDEN');
    return user;
  }
  private async authority(processId: string, actor: UserIdentity, tx: Prisma.TransactionClient) {
    return processAuthority(actor.role, await this.participation.isParticipant(processId, actor.id, tx));
  }
  private async contract(row: ProcessRow, actor: UserIdentity, tx: Prisma.TransactionClient): Promise<RelationshipProcessDto> {
    const authority = await this.authority(row.id, actor, tx);
    return { id: row.id, purpose: row.purpose, sourceIntentId: row.sourceIntentId, state: row.state, version: row.version,
      target: await this.targets.summary(row.organizationId ? { organizationId: row.organizationId } : { personId: row.personId! }, tx),
      createdBy: publicUser(row.createdBy), createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), lastActivityAt: row.lastActivityAt.toISOString(),
      currentResult: row.currentResult, closureObservation: row.closureObservation, closedAt: row.closedAt?.toISOString() ?? null, closedBy: row.closedBy ? publicUser(row.closedBy) : null,
      allowedStates: authority && hasPermission(actor.role, PERMISSIONS.PROCESS_STATE_CHANGE) ? [...PROCESS_TRANSITIONS[row.state]] : [],
      canClose: !!authority && row.state !== ProcessState.CLOSED && hasPermission(actor.role, PERMISSIONS.PROCESS_CLOSE),
      canReopen: !!authority && row.state === ProcessState.CLOSED && hasPermission(actor.role, PERMISSIONS.PROCESS_REOPEN),
      exceptionalAdministration: authority === ProcessAuthority.ADMINISTRATOR };
  }
  private async requireRow(id: string, tx: Prisma.TransactionClient) {
    const row = await tx.relationshipProcess.findUnique({ where: { id }, select: processSelect });
    if (!row) throw new ProcessError('PROCESS_NOT_FOUND');
    return row;
  }
  private async participantsInTransaction(id: string, tx: Prisma.TransactionClient) {
    const rows = await tx.processParticipant.findMany({ where: { processId: id }, select: { user: { select: userSelect }, joinedAt: true, origin: true }, orderBy: [{ joinedAt: 'asc' }, { userId: 'asc' }] });
    return rows.map(row => ({ user: publicUser(row.user), joinedAt: row.joinedAt.toISOString(), origin: row.origin }));
  }
  private async detail(row: ProcessRow, actor: UserIdentity, tx: Prisma.TransactionClient): Promise<ProcessDetailDto> {
    const events = await tx.relationshipProcessEvent.findMany({ where: { processId: row.id }, select: eventSelect, orderBy: [{ createdAt: 'desc' }, { version: 'desc' }], take: 25 });
    return { ...await this.contract(row, actor, tx), participants: await this.participantsInTransaction(row.id, tx), events: events.map(publicEvent),
      eventsTotal: await tx.relationshipProcessEvent.count({ where: { processId: row.id } }) };
  }
  async create(input: CreateRelationshipProcessDto, actorId: string): Promise<ProcessDetailDto> {
    return this.users.withLockedCredentials(actorId, async (current, tx) => {
      const actor = this.requirePermission(current, PERMISSIONS.PROCESS_CREATE);
      return this.createInTransaction(input, actor, tx);
    });
  }
  /** Uso interno de relationships: el caso de uso autoriza al actor antes de construir el proceso. */
  async createInTransaction(input: CreateRelationshipProcessDto, actor: UserIdentity, tx: Prisma.TransactionClient,
    source?: { intentId: string; at: Date; operationId: string }): Promise<ProcessDetailDto> {
    const purpose = processPurpose(input.purpose), target = processTarget(input);
    try { await this.targets.requireUsable(target, tx); } catch (error) {
      if (error instanceof UnavailableDirectoryTarget) throw new ProcessError('PROCESS_TARGET_UNAVAILABLE');
      throw error;
    }
    await this.restrictions.assertContactAllowed(target, tx);
    const now = new Date(Math.max(Date.now(), +(source?.at ?? 0)));
    const row = await tx.relationshipProcess.create({ data: { purpose, ...target, createdByUserId: actor.id,
      sourceIntentId: source?.intentId,
      createdAt: now, updatedAt: now, lastActivityAt: now }, select: processSelect });
    await this.participation.ensureParticipant(row.id, actor.id, ParticipantOrigin.PROCESS_CREATOR, tx);
    const event = await tx.relationshipProcessEvent.create({ data: { processId: row.id, type: ProcessEventType.CREATED,
      newState: ProcessState.PREPARATION, actorUserId: actor.id, authority: ProcessAuthority.PARTICIPANT, version: 1, createdAt: now } });
    await this.audit.recordProcess(AuditAction.PROCESS_CREATED, event.id, actor.id, source?.operationId ?? randomUUID(), tx);
    return this.detail(row, actor, tx);
  }
  async list(query: ProcessQueryDto, actorId: string) {
    return this.prisma.$transaction(async tx => {
      const actor = this.requirePermission(await this.users.findIdentityById(actorId, tx), PERMISSIONS.PROCESS_READ);
      const where: Prisma.RelationshipProcessWhereInput = { ...(query.state === 'all' ? {} : { state: query.state }),
        ...(query.createdByUserId ? { createdByUserId: query.createdByUserId } : {}), ...(query.organizationId ? { organizationId: query.organizationId } : {}), ...(query.personId ? { personId: query.personId } : {}) };
      const rows = await tx.relationshipProcess.findMany({ where, select: processSelect, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize });
      const items: RelationshipProcessDto[] = [];
      for (const row of rows) items.push(await this.contract(row, actor, tx));
      return { items, total: await tx.relationshipProcess.count({ where }), page: query.page, pageSize: query.pageSize };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  async get(id: string, actorId: string): Promise<ProcessDetailDto> {
    return this.prisma.$transaction(async tx => {
      const actor = this.requirePermission(await this.users.findIdentityById(actorId, tx), PERMISSIONS.PROCESS_READ);
      return this.detail(await this.requireRow(id, tx), actor, tx);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  async participants(id: string, actorId: string) {
    return this.prisma.$transaction(async tx => {
      this.requirePermission(await this.users.findIdentityById(actorId, tx), PERMISSIONS.PROCESS_READ);
      await this.requireRow(id, tx);
      return this.participantsInTransaction(id, tx);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  async events(id: string, query: Pick<ProcessQueryDto, 'page' | 'pageSize'>, actorId: string) {
    return this.prisma.$transaction(async tx => {
      this.requirePermission(await this.users.findIdentityById(actorId, tx), PERMISSIONS.PROCESS_READ);
      await this.requireRow(id, tx);
      const where = { processId: id };
      const rows = await tx.relationshipProcessEvent.findMany({ where, select: eventSelect, orderBy: [{ createdAt: 'desc' }, { version: 'desc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize });
      return { items: rows.map(publicEvent), total: await tx.relationshipProcessEvent.count({ where }), page: query.page, pageSize: query.pageSize };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  changeState(id: string, input: ChangeProcessStateDto, actorId: string) { return this.mutate(id, { kind: 'state', input }, actorId); }
  /** Lectura pública acotada de eventos funcionales para el timeline autorizado. */
  async timelineItems(processId: string, after: TimelinePosition | undefined, limit: number, tx: Prisma.TransactionClient): Promise<TimelineItem[]> {
    const kinds = { CREATED: 'PROCESS_CREATED', STATE_CHANGED: 'PROCESS_STATE_CHANGED', CLOSED: 'PROCESS_CLOSED', REOPENED: 'PROCESS_REOPENED' } as const;
    const summaries = { CREATED: 'Proceso iniciado', STATE_CHANGED: 'Cambio de estado', CLOSED: 'Proceso cerrado', REOPENED: 'Proceso reabierto' };
    const rows = await tx.relationshipProcessEvent.findMany({ where: { processId, ...timelineSeek(after, 'EVENT', 'createdAt') }, select: eventSelect,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: limit });
    return rows.map(row => ({ id: row.id, kind: kinds[row.type], occurredAt: row.createdAt.toISOString(), registeredAt: row.createdAt.toISOString(),
      actor: publicUser(row.actor), summary: summaries[row.type], payload: { eventId: row.id, previousState: row.previousState, newState: row.newState, result: row.result, observation: row.observation } }));
  }
  /** Productores formales externos a relationships: el propietario del proceso controla el lock. */
  async requireOpportunityOrigin(id: string, tx: Prisma.TransactionClient) {
    const row = await tx.relationshipProcess.findUnique({ where: { id }, select: { id: true, purpose: true } });
    if (!row) throw new ProcessError('PROCESS_NOT_FOUND'); return row;
  }
  async requireAttachmentProcess(id: string, tx: Prisma.TransactionClient, uploading: boolean) {
    if (uploading) await tx.$queryRaw`SELECT id FROM "RelationshipProcess" WHERE id=${id}::uuid FOR UPDATE`;
    const row = await this.requireRow(id, tx);
    return { id: row.id, state: row.state };
  }
  async lockForCommunication(id: string, tx: Prisma.TransactionClient) {
    await tx.$queryRaw`SELECT id FROM "RelationshipProcess" WHERE id=${id}::uuid FOR UPDATE`;
    const row = await this.requireRow(id, tx);
    return { id: row.id, state: row.state, version: row.version, lastActivityAt: row.lastActivityAt,
      target: row.organizationId ? { organizationId: row.organizationId } : { personId: row.personId! } };
  }
  async recordCommunicationActivity(id: string, registeredAt: Date, tx: Prisma.TransactionClient): Promise<void> {
    const row = await this.requireRow(id, tx);
    await tx.relationshipProcess.update({ where: { id }, data: { version: { increment: 1 },
      lastActivityAt: new Date(Math.max(+row.lastActivityAt, +registeredAt)), updatedAt: new Date(Math.max(+row.updatedAt, +registeredAt)) } });
  }
  /** Misma semántica monotónica de actuaciones formales, bajo lock del propietario. */
  async recordMeetingActivity(id: string, registeredAt: Date, tx: Prisma.TransactionClient): Promise<void> {
    await this.recordCommunicationActivity(id, registeredAt, tx);
  }
  async requireCommunicationProcess(id: string, tx: Prisma.TransactionClient): Promise<void> {
    if (!await tx.relationshipProcess.findUnique({ where: { id }, select: { id: true } })) throw new ProcessError('PROCESS_NOT_FOUND');
  }
  close(id: string, input: CloseProcessDto, actorId: string) { return this.mutate(id, { kind: 'close', input }, actorId); }
  reopen(id: string, input: ReopenProcessDto, actorId: string) { return this.mutate(id, { kind: 'reopen', input }, actorId); }

  private mutate(id: string, command: ProcessMutation, actorId: string): Promise<ProcessDetailDto> {
    return this.users.withLockedCredentials(actorId, async (current, tx) => {
      const actor = this.requirePermission(current, mutationPermissions[command.kind]);
      await tx.$queryRaw`SELECT id FROM "RelationshipProcess" WHERE id=${id}::uuid FOR UPDATE`;
      const row = await this.requireRow(id, tx), authority = await this.authority(id, actor, tx);
      if (!authority) throw new ProcessError('FORBIDDEN');
      processVersion(row.version, command.input.expectedVersion);
      const now = new Date(Math.max(Date.now(), +row.lastActivityAt));
      let changes: Prisma.RelationshipProcessUncheckedUpdateManyInput;
      let observation: string | null;
      if (command.kind === 'state') {
        processTransition(row.state, command.input.state);
        observation = processObservation(command.input.reason);
        changes = { state: command.input.state };
      } else if (command.kind === 'close') {
        changes = { ...processClosure(row.state, command.input.result, command.input.observation), closedAt: now, closedByUserId: actor.id };
        observation = processObservation(command.input.observation);
      } else {
        changes = processReopening(row.state, command.input.state, command.input.reason);
        observation = processObservation(command.input.reason);
      }
      const updated = await tx.relationshipProcess.updateMany({ where: { id, state: row.state, version: command.input.expectedVersion }, data: { ...changes, version: { increment: 1 }, updatedAt: now, lastActivityAt: now } });
      if (updated.count !== 1) throw new ProcessError('VERSION_CONFLICT');
      const next = await this.requireRow(id, tx);
      const event = await tx.relationshipProcessEvent.create({ data: { processId: id, type: mutationEvents[command.kind],
        previousState: row.state, newState: next.state, result: command.kind === 'close' ? next.currentResult : null,
        observation, actorUserId: actor.id, authority, version: next.version, createdAt: now } });
      await this.audit.recordProcess(mutationAudits[command.kind], event.id, actor.id, randomUUID(), tx);
      return this.detail(next, actor, tx);
    });
  }
}
