import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { UsersService } from '../users/users.service';
import { VerificationSettingsService } from '../settings/verification-settings.service';
import { hasPermission } from '../auth/authorization/role-permissions';
import { PERMISSIONS } from '../auth/authorization/permission';
import { DirectoryError } from './directory.errors';
import { institutionalText, website } from './directory.rules';
import { verificationCondition, verificationTargets, type VerificationKind } from './verification.rules';
import type { VerifyDto } from './verification.dto';
import type { PageQueryDto } from './directory.dto';

const authorSelect = { id: true, givenNames: true, familyNames: true, isActive: true } as const;
const eventSelect = { id: true, verifiedAt: true, sourceDescription: true, sourceUrl: true, actor: { select: authorSelect } } as const;
interface VerificationContext { id: string; version: number; contactValueVersion: number | null; contactMethodId: string | null }
@Injectable()
export class VerificationClock { now(): Date { return new Date(); } }
@Injectable()
export class VerificationService {
  constructor(private readonly prisma: PrismaService, private readonly users: UsersService,
    private readonly settings: VerificationSettingsService, private readonly clock: VerificationClock) {}
  private async context(kind: VerificationKind, id: string, tx: Prisma.TransactionClient): Promise<VerificationContext> {
    const table = Prisma.raw('"' + verificationTargets[kind].table + '"');
    const contact = kind === 'personContact' || kind === 'organizationContact';
    const rows = await tx.$queryRaw<VerificationContext[]>(Prisma.sql`SELECT t.id,t.version,
      ${contact ? Prisma.sql`m."valueVersion"` : Prisma.sql`NULL::integer`} AS "contactValueVersion",
      ${contact ? Prisma.sql`m.id` : Prisma.sql`NULL::uuid`} AS "contactMethodId"
      FROM ${table} t ${contact ? Prisma.sql`JOIN "ContactMethod" m ON m.id=t."contactMethodId"` : Prisma.empty} WHERE t.id=${id}::uuid`);
    if (!rows[0]) throw new DirectoryError(kind === 'organization' ? 'ORGANIZATION_NOT_FOUND' : kind === 'person' ? 'PERSON_NOT_FOUND'
      : kind === 'relation' ? 'PERSON_RELATION_NOT_FOUND' : 'CONTACT_ASSOCIATION_NOT_FOUND');
    return rows[0];
  }
  private async condition(kind: VerificationKind, current: VerificationContext, tx: Prisma.TransactionClient) {
    const settings = await this.settings.get(tx);
    const latest = await tx.verification.findFirst({ where: { [verificationTargets[kind].column]: current.id },
      select: { ...eventSelect, objectVersion: true, contactValueVersion: true }, orderBy: [{ verifiedAt: 'desc' }, { id: 'desc' }] });
    const intervalMonths = verificationTargets[kind].classification === 'personal' ? settings.personalVerificationMonths : settings.institutionalVerificationMonths;
    return { objectType: kind, classification: verificationTargets[kind].classification, intervalMonths,
      ...verificationCondition(latest, current, intervalMonths, this.clock.now()), lastVerifiedAt: latest?.verifiedAt ?? null,
      lastVerifiedBy: latest?.actor ?? null, version: current.version, contactValueVersion: current.contactValueVersion };
  }
  status(kind: VerificationKind, id: string) {
    return this.prisma.$transaction(async tx => this.condition(kind, await this.context(kind, id, tx), tx),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  verify(kind: VerificationKind, id: string, input: VerifyDto, actorId: string) {
    const sourceDescription = institutionalText(input.sourceDescription, 1000), sourceUrl = website(input.sourceUrl);
    return this.prisma.$transaction(async tx => {
      const actor = await this.users.findIdentityById(actorId, tx);
      if (!actor?.isActive || !hasPermission(actor.role, PERMISSIONS.DIRECTORY_VERIFY)) throw new DirectoryError('FORBIDDEN');
      const initial = await this.context(kind, id, tx);
      // Mismo orden que las mutaciones de contactos: canal, luego asociación.
      if (initial.contactMethodId) await tx.$queryRaw`SELECT id FROM "ContactMethod" WHERE id=${initial.contactMethodId}::uuid FOR SHARE`;
      const table = Prisma.raw('"' + verificationTargets[kind].table + '"');
      await tx.$queryRaw(Prisma.sql`SELECT id FROM ${table} WHERE id=${id}::uuid FOR UPDATE`);
      const current = await this.context(kind, id, tx);
      if ((current.contactMethodId && input.expectedContactValueVersion === undefined) || (!current.contactMethodId && input.expectedContactValueVersion !== undefined)) throw new DirectoryError('INVALID_DIRECTORY');
      if (current.version !== input.expectedVersion || (current.contactMethodId && current.contactValueVersion !== input.expectedContactValueVersion)) throw new DirectoryError('VERSION_CONFLICT');
      const verifiedAt = this.clock.now();
      const event = await tx.verification.create({ data: { [verificationTargets[kind].column]: id, actorUserId: actorId, verifiedAt,
        objectVersion: current.version, contactValueVersion: current.contactValueVersion, sourceDescription, sourceUrl }, select: eventSelect });
      // Proyección materializada existente. No altera updatedAt, versión ni estados.
      await tx.$executeRaw(Prisma.sql`UPDATE ${table} SET "lastVerifiedAt"=${verifiedAt} WHERE id=${id}::uuid`);
      return { event: { ...event, objectType: kind }, condition: await this.condition(kind, current, tx) };
    });
  }
  history(kind: VerificationKind, id: string, query: PageQueryDto) {
    return this.prisma.$transaction(async tx => {
      await this.context(kind, id, tx);
      const where = { [verificationTargets[kind].column]: id };
      const [items, total] = await Promise.all([
        tx.verification.findMany({ where, select: eventSelect, orderBy: [{ verifiedAt: 'desc' }, { id: 'desc' }],
          skip: (query.page - 1) * query.pageSize, take: query.pageSize }), tx.verification.count({ where }),
      ]);
      return { items: items.map(event => ({ ...event, objectType: kind })), total, page: query.page, pageSize: query.pageSize };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
}
