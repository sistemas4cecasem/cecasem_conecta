import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { UsersService } from '../users/users.service';
import type { UserIdentity } from '../users/user-projections';
import { PERMISSIONS, type Permission } from '../auth/authorization/permission';
import { hasPermission } from '../auth/authorization/role-permissions';
import { CommunicationsService } from '../communications/communications.service';
import { DirectoryReferralsService, UnavailableReferralReference } from '../directory/directory-referrals.service';
import { AuditService } from '../audit/audit.service';
import { referralFields, referralFingerprint, ReferralError } from './referral.rules';
import type { CreateReferralDto, ReferralDto, ReferralQueryDto } from './referral.dto';
import type { TimelineItem } from '../relationships/timeline.dto';
import { timelineSeek, type TimelinePosition } from '../relationships/timeline.rules';
const select = { id: true, sourceCommunicationId: true, createdAt: true, recommendedName: true, recommendedRole: true, organizationNameSnapshot: true,
  mediumType: true, mediumValue: true, notes: true, personId: true, organizationId: true, contactMethodId: true,
  createdBy: { select: { id: true, givenNames: true, familyNames: true, isActive: true } },
  sourceCommunication: { select: { id: true, subject: true, processId: true, validity: true } } } satisfies Prisma.ReferralSelect;
type Row = Prisma.ReferralGetPayload<{ select: typeof select }>;
@Injectable()
export class ReferralsService {
  constructor(private readonly prisma: PrismaService, private readonly users: UsersService, private readonly communications: CommunicationsService,
    private readonly directory: DirectoryReferralsService, private readonly audit: AuditService) {}
  private authorize(actor: UserIdentity | null, permission: Permission) {
    if (!actor?.isActive || !hasPermission(actor.role, permission) || !hasPermission(actor.role, PERMISSIONS.COMMUNICATION_READ) || !hasPermission(actor.role, PERMISSIONS.PROCESS_READ)) throw new ReferralError('FORBIDDEN');
    return actor;
  }
  private async contracts(rows: Row[], tx: Prisma.TransactionClient): Promise<ReferralDto[]> {
    if (!rows.length) return [];
    const refs = await this.directory.describeReferences(rows, tx);
    return rows.map(row => ({ id: row.id, sourceCommunicationId: row.sourceCommunicationId, createdAt: row.createdAt.toISOString(),
      recommendedName: row.recommendedName, recommendedRole: row.recommendedRole, organizationNameSnapshot: row.organizationNameSnapshot,
      mediumType: row.mediumType, mediumValue: row.mediumValue, notes: row.notes, source: row.sourceCommunication,
      createdBy: { id: row.createdBy.id, displayName: row.createdBy.givenNames + ' ' + row.createdBy.familyNames, isActive: row.createdBy.isActive },
      person: row.personId ? refs.people.get(row.personId) ?? null : null, organization: row.organizationId ? refs.organizations.get(row.organizationId) ?? null : null,
      contactMethod: row.contactMethodId ? refs.contacts.get(row.contactMethodId) ?? null : null }));
  }
  async create(sourceCommunicationId: string, input: CreateReferralDto, actorId: string, requestKey: string) {
    const fields = referralFields(input), fingerprint = referralFingerprint(sourceCommunicationId, fields, requestKey);
    return this.users.withLockedCredentials(actorId, async (current, tx) => {
      this.authorize(current, PERMISSIONS.REFERRAL_CREATE);
      const prior = await tx.referral.findUnique({ where: { createdByUserId_requestKey: { createdByUserId: actorId, requestKey } }, select: { ...select, requestFingerprint: true } });
      if (prior) {
        if (prior.requestFingerprint !== fingerprint) throw new ReferralError('REQUEST_CONFLICT');
        return (await this.contracts([prior], tx))[0];
      }
      const source = await this.communications.requireReferralSource(sourceCommunicationId, tx, true);
      if (source.validity !== 'VALID') throw new ReferralError('REFERRAL_SOURCE_INVALIDATED');
      try { await this.directory.requireReferences(fields, tx); }
      catch (error) { if (error instanceof UnavailableReferralReference) throw new ReferralError('REFERRAL_REFERENCE_UNAVAILABLE'); throw error; }
      const row = await tx.referral.create({ data: { ...fields, sourceCommunicationId, createdByUserId: actorId, requestKey, requestFingerprint: fingerprint }, select });
      await this.audit.recordReferral(row.id, actorId, tx);
      return (await this.contracts([row], tx))[0];
    });
  }
  async list(sourceCommunicationId: string, query: ReferralQueryDto, actorId: string) {
    return this.prisma.$transaction(async tx => {
      this.authorize(await this.users.findIdentityById(actorId, tx), PERMISSIONS.REFERRAL_READ);
      await this.communications.requireReferralSource(sourceCommunicationId, tx);
      const where = { sourceCommunicationId };
      const rows = await tx.referral.findMany({ where, select, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize });
      return { items: await this.contracts(rows, tx), total: await tx.referral.count({ where }), page: query.page, pageSize: query.pageSize };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  async get(id: string, actorId: string) {
    return this.prisma.$transaction(async tx => {
      this.authorize(await this.users.findIdentityById(actorId, tx), PERMISSIONS.REFERRAL_READ);
      const row = await tx.referral.findUnique({ where: { id }, select });
      if (!row) throw new ReferralError('REFERRAL_NOT_FOUND');
      return (await this.contracts([row], tx))[0];
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  async timelineItems(processId: string, after: TimelinePosition | undefined, limit: number, tx: Prisma.TransactionClient): Promise<TimelineItem[]> {
    const positions = await tx.referral.findMany({ where: { sourceCommunication: { processId }, ...timelineSeek(after, 'REFERRAL', 'createdAt') },
      select: { id: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: limit });
    if (!positions.length) return [];
    const rows = await tx.referral.findMany({ where: { id: { in: positions.map(row => row.id) } }, select, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
    return (await this.contracts(rows, tx)).map(row => ({ id: row.id, kind: 'REFERRAL_CREATED', occurredAt: row.createdAt, registeredAt: row.createdAt,
      actor: row.createdBy, summary: 'Contacto recomendado registrado', payload: { referralId: row.id, communicationId: row.sourceCommunicationId, referral: row } }));
  }
}
