import { Injectable } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { ParticipantOrigin, Prisma, ProcessState, RecipientType } from '../../generated/prisma/client';
import { UsersService } from '../users/users.service';
import { PERMISSIONS, type Permission } from '../auth/authorization/permission';
import { hasPermission } from '../auth/authorization/role-permissions';
import { RelationshipProcessesService } from '../relationships/relationship-processes.service';
import { ProcessParticipationService } from '../relationships/process-participation.service';
import { ContactRestrictionsService } from '../relationships/contact-restrictions.service';
import { AuditService } from '../audit/audit.service';
import { CommunicationError, requestFingerprint, validateSentOriginal, receivedRequestFingerprint, validateReceivedOriginal } from './communication.rules';
import type { UserIdentity } from '../users/user-projections';
import type { InstitutionalTarget } from '../directory/directory-target.service';
import type { CommunicationHistoryItemDto } from './communication-history.dto';
import { timelineSeek, type TimelinePosition } from '../relationships/timeline.rules';
import type { TimelineItem } from '../relationships/timeline.dto';
import type { CommunicationDto, CommunicationPaginationDto, CommunicationsPageDto, CommunicationSummaryDto, CreateSentCommunicationDto, CreateReceivedCommunicationDto } from './communication.dto';
import { amendmentSelect, amendmentContract } from './communication-amendments.service';
const userSelect = { id: true, givenNames: true, familyNames: true, isActive: true } as const;
const summarySelect = { validity: true, id: true, processId: true, direction: true, subject: true, sentAt: true, receivedAt: true, occurredAt: true, createdAt: true } satisfies Prisma.CommunicationSelect;
const invalidationSelect = { where: { type: 'INVALIDATION' as const }, select: amendmentSelect, take: 1 };
const communicationSelect = { ...summarySelect, amendments: invalidationSelect, validity: true, version: true, emailAccountId: true, accountAddressSnapshot: true, accountDisplayNameSnapshot: true, senderSnapshot: true, bodyOriginal: true,
  registeredBy: { select: userSelect }, recipients: { select: { type: true, addressOriginal: true, normalizedAddress: true, position: true, emailAccountId: true, emailAccountDisplayNameSnapshot: true }, orderBy: [{ type: 'asc' }, { position: 'asc' }] } } satisfies Prisma.CommunicationSelect;
type Row = Prisma.CommunicationGetPayload<{ select: typeof communicationSelect }>;
const summary = (row: Prisma.CommunicationGetPayload<{ select: typeof summarySelect }>): CommunicationSummaryDto => ({ id: row.id, processId: row.processId, direction: row.direction, validity: row.validity, subject: row.subject,
  sentAt: row.sentAt?.toISOString() ?? null, receivedAt: row.receivedAt?.toISOString() ?? null, occurredAt: row.occurredAt.toISOString(), createdAt: row.createdAt.toISOString() });
function contract(row: Row): CommunicationDto {
  return { ...summary({ validity: row.validity, id: row.id, processId: row.processId, direction: row.direction, subject: row.subject, sentAt: row.sentAt, receivedAt: row.receivedAt, occurredAt: row.occurredAt, createdAt: row.createdAt }), validity: row.validity, version: row.version, invalidation: row.amendments[0] ? amendmentContract(row.amendments[0]) : null,
    emailAccount: row.emailAccountId ? { id: row.emailAccountId, address: row.accountAddressSnapshot!, displayName: row.accountDisplayNameSnapshot! } : null, sender: row.senderSnapshot, recipients: row.recipients.map(item => ({ type: item.type, addressOriginal: item.addressOriginal, normalizedAddress: item.normalizedAddress, position: item.position, emailAccount: item.emailAccountId ? { id: item.emailAccountId, displayName: item.emailAccountDisplayNameSnapshot! } : null })), bodyOriginal: row.bodyOriginal,
    registeredBy: { id: row.registeredBy.id, displayName: row.registeredBy.givenNames + ' ' + row.registeredBy.familyNames, isActive: row.registeredBy.isActive } };
}
@Injectable()
export class CommunicationsService {
  constructor(private readonly prisma: PrismaService, private readonly users: UsersService, private readonly processes: RelationshipProcessesService,
    private readonly participation: ProcessParticipationService, private readonly restrictions: ContactRestrictionsService, private readonly audit: AuditService) {}
  private authorize(user: UserIdentity | null, permission: Permission): UserIdentity {
    if (!user?.isActive || !hasPermission(user.role, permission) || !hasPermission(user.role, PERMISSIONS.PROCESS_READ)) throw new CommunicationError('FORBIDDEN');
    return user;
  }
  async availableAccounts(actorId: string) {
    return this.prisma.$transaction(async tx => {
      this.authorize(await this.users.findIdentityById(actorId, tx), PERMISSIONS.SENT_COMMUNICATION_CREATE);
      return this.users.availableCommunicationAccounts(actorId, tx);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  async registerSent(processId: string, input: CreateSentCommunicationDto, actorId: string, requestKey: string): Promise<CommunicationDto> {
    const original = validateSentOriginal(input);
    if (typeof requestKey !== 'string' || !isUUID(requestKey)) throw new CommunicationError('INVALID_COMMUNICATION');
    const fingerprint = requestFingerprint(processId, original);
    return this.users.withLockedCredentials(actorId, async (current, tx) => {
      const actor = this.authorize(current, PERMISSIONS.SENT_COMMUNICATION_CREATE);
      const prior = await tx.communication.findUnique({ where: { registeredByUserId_requestKey: { registeredByUserId: actor.id, requestKey } }, select: { id: true, requestFingerprint: true } });
      if (prior) {
        if (prior.requestFingerprint !== fingerprint) throw new CommunicationError('REQUEST_CONFLICT');
        return contract(await tx.communication.findUniqueOrThrow({ where: { id: prior.id }, select: communicationSelect }));
      }
      const account = await this.users.lockCommunicationAccount(actor.id, original.emailAccountId, tx);
      if (!account) throw new CommunicationError('MAILBOX_UNAVAILABLE');
      const process = await this.processes.lockForCommunication(processId, tx);
      if (process.state === ProcessState.CLOSED) throw new CommunicationError('PROCESS_CLOSED');
      await this.restrictions.assertContactAllowed(process.target, tx);
      const createdAt = new Date();
      // La fecha se revalida tras esperar locks; el original no se transforma.
      validateSentOriginal(original, createdAt);
      // Misma normalización que el check/index PostgreSQL, incluso con direcciones Unicode.
      const normalizedRows = await tx.$queryRaw<{ address: string; normalized: string }[]>(Prisma.sql`SELECT address, lower(address) AS normalized FROM unnest(ARRAY[${Prisma.join([account.address, ...original.to, ...original.cc, ...original.bcc])}]::text[]) AS recipients(address)`);
      const normalizedAddresses = new Map(normalizedRows.map(row => [row.address, row.normalized]));
      const recipients = ([['TO', original.to], ['CC', original.cc], ['BCC', original.bcc]] as const).flatMap(([type, addresses]) =>
        addresses.map((addressOriginal, position) => ({ type: RecipientType[type], addressOriginal, normalizedAddress: normalizedAddresses.get(addressOriginal)!, position })));
      const row = await tx.communication.create({ data: { processId, emailAccountId: account.id, senderSnapshot: account.address, senderNormalizedAddress: normalizedAddresses.get(account.address)!, accountAddressSnapshot: account.address, accountDisplayNameSnapshot: account.displayName,
        subject: original.subject, bodyOriginal: original.body, sentAt: new Date(original.sentAt), occurredAt: new Date(original.sentAt), createdAt, registeredByUserId: actor.id, requestKey, requestFingerprint: fingerprint,
        recipients: { create: recipients } }, select: communicationSelect });
      await this.participation.ensureParticipant(processId, actor.id, ParticipantOrigin.SENT_COMMUNICATION, tx);
      await this.processes.recordCommunicationActivity(processId, createdAt, tx);
      await this.audit.recordSentCommunication(row.id, actor.id, randomUUID(), tx);
      return contract(row);
    });
  }
  async registerReceived(processId: string, input: CreateReceivedCommunicationDto, actorId: string, requestKey: string): Promise<CommunicationDto> {
    const original = validateReceivedOriginal(input);
    if (typeof requestKey !== 'string' || !isUUID(requestKey)) throw new CommunicationError('INVALID_COMMUNICATION');
    const fingerprint = receivedRequestFingerprint(processId, original);
    return this.users.withLockedCredentials(actorId, async (current, tx) => {
      const actor = this.authorize(current, PERMISSIONS.RECEIVED_COMMUNICATION_CREATE);
      const prior = await tx.communication.findUnique({ where: { registeredByUserId_requestKey: { registeredByUserId: actor.id, requestKey } }, select: { id: true, requestFingerprint: true } });
      if (prior) {
        if (prior.requestFingerprint !== fingerprint) throw new CommunicationError('REQUEST_CONFLICT');
        return contract(await tx.communication.findUniqueOrThrow({ where: { id: prior.id }, select: communicationSelect }));
      }
      // Un hecho recibido no inicia un acercamiento: cerrado y no contacto se conservan.
      await this.processes.lockForCommunication(processId, tx);
      const createdAt = new Date(); validateReceivedOriginal(original, createdAt);
      const normalizedRows = await tx.$queryRaw<{ address: string; normalized: string }[]>(Prisma.sql`SELECT address, lower(address) AS normalized FROM unnest(ARRAY[${Prisma.join([original.sender, ...original.to, ...original.cc, ...original.bcc])}]::text[]) AS recipients(address)`);
      const normalized = new Map(normalizedRows.map(row => [row.address, row.normalized]));
      const accounts = await this.users.matchingCommunicationAccounts([...normalized.values()], tx);
      const recipients = ([['TO', original.to], ['CC', original.cc], ['BCC', original.bcc]] as const).flatMap(([type, addresses]) => addresses.map((addressOriginal, position) => {
        const account = accounts.find(item => item.address === normalized.get(addressOriginal));
        return { type: RecipientType[type], addressOriginal, normalizedAddress: normalized.get(addressOriginal)!, position, emailAccountId: account?.id, emailAccountDisplayNameSnapshot: account?.displayName };
      }));
      const row = await tx.communication.create({ data: { processId, direction: 'RECEIVED', senderSnapshot: original.sender, senderNormalizedAddress: normalized.get(original.sender)!,
        subject: original.subject, bodyOriginal: original.body, receivedAt: new Date(original.receivedAt), occurredAt: new Date(original.receivedAt), createdAt, registeredByUserId: actor.id, requestKey, requestFingerprint: fingerprint,
        recipients: { create: recipients } }, select: communicationSelect });
      await this.participation.ensureParticipant(processId, actor.id, ParticipantOrigin.RECEIVED_COMMUNICATION, tx);
      await this.processes.recordCommunicationActivity(processId, createdAt, tx);
      await this.audit.recordReceivedCommunication(row.id, processId, actor.id, randomUUID(), tx);
      return contract(row);
    });
  }
  async get(id: string, actorId: string): Promise<CommunicationDto> {
    return this.prisma.$transaction(async tx => {
      this.authorize(await this.users.findIdentityById(actorId, tx), PERMISSIONS.COMMUNICATION_READ);
      const row = await tx.communication.findUnique({ where: { id }, select: communicationSelect });
      if (!row) throw new CommunicationError('COMMUNICATION_NOT_FOUND');
      return contract(row);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  async list(processId: string, query: CommunicationPaginationDto, actorId: string): Promise<CommunicationsPageDto> {
    return this.prisma.$transaction(async tx => {
      this.authorize(await this.users.findIdentityById(actorId, tx), PERMISSIONS.COMMUNICATION_READ);
      await this.processes.requireCommunicationProcess(processId, tx);
      const items = await tx.communication.findMany({ where: { processId }, select: summarySelect, orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }], take: query.pageSize, skip: (query.page - 1) * query.pageSize });
      return { items: items.map(summary), total: await this.countForProcess(processId, tx), page: query.page, pageSize: query.pageSize };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  /** Contratos públicos mínimos para lectores internos autorizados, dentro de su snapshot. */
  countForProcess(processId: string, tx: Prisma.TransactionClient): Promise<number> { return tx.communication.count({ where: { processId } }); }
  async recentForProcess(processId: string, tx: Prisma.TransactionClient): Promise<CommunicationSummaryDto[]> {
    return (await tx.communication.findMany({ where: { processId, validity: 'VALID' }, select: summarySelect, orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }], take: 5 })).map(summary);
  }
  async recentByRecipientAddress(address: string, tx: Prisma.TransactionClient): Promise<CommunicationSummaryDto[]> {
    const [normalized] = await tx.$queryRaw<{ address: string }[]>`SELECT lower(${address.trim()}) AS address`;
    return (await tx.communication.findMany({ where: { validity: 'VALID', recipients: { some: { normalizedAddress: normalized.address } } }, select: summarySelect,
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }], take: 5 })).map(summary);
  }
  /** Proyección mínima de hechos reales; no incluye cuerpos ni modifica actividad. */
  async historyForProcess(processId: string, tx: Prisma.TransactionClient) {
    const items = await tx.communication.findMany({ where: { processId, validity: 'VALID' }, select: { ...summarySelect, senderSnapshot: true, recipients: { select: { type: true, addressOriginal: true, position: true }, orderBy: [{ type: 'asc' }, { position: 'asc' }] } }, orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }], take: 5 });
    return { exists: items.length > 0, total: await tx.communication.count({ where: { processId, validity: 'VALID' } }), lastOccurredAt: items[0]?.occurredAt.toISOString() ?? null,
      items: items.map(row => ({ ...summary(row), sender: row.senderSnapshot, recipients: row.recipients })) };
  }
  async recentByInvolvedAddress(address: string, tx: Prisma.TransactionClient): Promise<CommunicationSummaryDto[]> {
    const [normalized] = await tx.$queryRaw<{ address: string }[]>`SELECT lower(${address.trim()}) AS address`;
    return (await tx.communication.findMany({ where: { validity: 'VALID', OR: [{ senderNormalizedAddress: normalized.address }, { recipients: { some: { normalizedAddress: normalized.address } } }] }, select: summarySelect,
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }], take: 5 })).map(summary);
  }
  /** Una consulta limitada y un conteo por actor, independientemente del número de procesos. */
  async historyForActor(target: InstitutionalTarget, tx: Prisma.TransactionClient) {
    const where = { process: target, validity: 'VALID' } satisfies Prisma.CommunicationWhereInput;
    const rows = await tx.communication.findMany({ where, select: { ...summarySelect, senderSnapshot: true,
      process: { select: { id: true, purpose: true } }, _count: { select: { recipients: true } },
      recipients: { select: { type: true, addressOriginal: true, position: true }, orderBy: [{ type: 'asc' }, { position: 'asc' }], take: 10 } },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }], take: 5 });
    const total = await tx.communication.count({ where });
    const items: CommunicationHistoryItemDto[] = rows.map(row => ({ ...summary(row), sender: row.senderSnapshot,
      process: row.process, recipients: row.recipients, recipientTotal: row._count.recipients }));
    return { exists: total > 0, total, lastOccurredAt: items[0]?.occurredAt ?? null, lastDirection: items[0]?.direction ?? null, items };
  }
  /** Snapshots históricos por lotes, sin cargar ni devolver cuerpos completos. */
  async timelineItems(processId: string, after: TimelinePosition | undefined, limit: number, tx: Prisma.TransactionClient): Promise<TimelineItem[]> {
    const rows = await tx.communication.findMany({ where: { processId, ...timelineSeek(after, 'COMMUNICATION', 'occurredAt') },
      select: { validity: true, amendments: invalidationSelect, id: true, direction: true, occurredAt: true, createdAt: true, senderSnapshot: true, subject: true, registeredBy: { select: userSelect },
        _count: { select: { recipients: true } }, recipients: { select: { type: true, addressOriginal: true, position: true }, orderBy: [{ type: 'asc' }, { position: 'asc' }], take: 10 } },
      orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }], take: limit });
    return rows.map(row => ({ id: row.id, kind: row.direction === 'SENT' ? 'SENT_COMMUNICATION' : 'RECEIVED_COMMUNICATION', occurredAt: row.occurredAt.toISOString(), registeredAt: row.createdAt.toISOString(),
      actor: { id: row.registeredBy.id, displayName: row.registeredBy.givenNames + ' ' + row.registeredBy.familyNames, isActive: row.registeredBy.isActive }, summary: row.subject,
      payload: { validity: row.validity, invalidation: row.amendments[0] ? amendmentContract(row.amendments[0]) : null, communicationId: row.id, sender: row.senderSnapshot, subject: row.subject, recipients: row.recipients, recipientTotal: row._count.recipients } }));
  }
}
