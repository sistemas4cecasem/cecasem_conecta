import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { UsersService } from '../users/users.service';
import { PERMISSIONS } from '../auth/authorization/permission';
import { hasPermission } from '../auth/authorization/role-permissions';
import { VerificationSettingsService } from '../settings/verification-settings.service';
import { OrganizationFilterService } from './organization-filter.service';
import { verificationCondition } from './verification.rules';

const organizationSelect = {
  id: true, name: true, alias: true, country: true, isActive: true, parent: { select: { id: true, name: true } },
  categories: { orderBy: { categoryId: 'asc' }, select: { category: { select: { id: true, name: true } } } },
  contacts: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true, isActive: true, lastVerifiedAt: true, dataImportBatchId: true,
    contactMethod: { select: { id: true, type: true, value: true, label: true, condition: true } } } },
  createdAt: true, updatedAt: true, lastVerifiedAt: true, dataImportBatchId: true,
  dataImportBatch: { select: { originalFilename: true } }, version: true,
  verifications: { orderBy: [{ verifiedAt: 'desc' }, { id: 'desc' }], take: 1,
    select: { verifiedAt: true, objectVersion: true, contactValueVersion: true } },
} satisfies Prisma.OrganizationSelect;

const personSelect = {
  id: true, displayName: true, givenNames: true, familyNames: true, isActive: true, createdAt: true, updatedAt: true,
  version: true, lastVerifiedAt: true, dataImportBatchId: true, dataImportBatch: { select: { originalFilename: true } },
  verifications: { orderBy: [{ verifiedAt: 'desc' }, { id: 'desc' }], take: 1,
    select: { verifiedAt: true, objectVersion: true, contactValueVersion: true } },
  contacts: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: {
    id: true, isActive: true, lastVerifiedAt: true, version: true, dataImportBatchId: true,
    contactMethod: { select: { id: true, type: true, value: true, label: true, condition: true, valueVersion: true } },
    verifications: { orderBy: [{ verifiedAt: 'desc' }, { id: 'desc' }], take: 1,
      select: { verifiedAt: true, objectVersion: true, contactValueVersion: true } },
  } },
  relations: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: {
    id: true, organizationId: true, positionTitle: true, area: true, isCurrent: true, startDate: true, endDate: true,
    lastVerifiedAt: true, version: true, dataImportBatchId: true,
    organization: { select: { id: true, name: true } },
  } },
} satisfies Prisma.PersonSelect;

export interface OrganizationExportFilters {
  name?: string; country?: string; categoryId?: string; status?: 'active' | 'inactive' | 'all';
  verificationStatus?: 'CURRENT' | 'REVIEW_DUE' | 'NEVER_VERIFIED'; withCommunications?: boolean;
}
export interface ContactsExportFilters { name?: string; status?: 'active' | 'inactive' | 'all'; contactType?: string; relationStatus?: 'current' | 'historical' | 'all' }

@Injectable()
export class DirectoryExportService {
  constructor(private readonly prisma: PrismaService, private readonly users: UsersService,
    private readonly settings: VerificationSettingsService, private readonly organizationFilters: OrganizationFilterService) {}

  private async authorize(actorId: string, tx: Prisma.TransactionClient) {
    const actor = await this.users.findIdentityById(actorId, tx);
    if (!actor?.isActive || !hasPermission(actor.role, PERMISSIONS.DIRECTORY_READ)) throw new ForbiddenException();
  }

  async organizations(filters: OrganizationExportFilters, page: number, pageSize: number, actorId: string) {
    return this.prisma.$transaction(async tx => {
      await this.authorize(actorId, tx);
      const filter = await this.organizationFilters.predicate({ ...filters, status: filters.status ?? 'active' }, tx, actorId);
      const where = Prisma.sql`(${filter}) ${filters.name ? Prisma.sql`AND o.name ILIKE ${'%' + filters.name + '%'}` : Prisma.empty}`;
      const ids = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT o.id::text AS id FROM "Organization" o WHERE ${where} ORDER BY o.name, o.id LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`);
      const totals = await tx.$queryRaw<{ total: number }[]>(Prisma.sql`SELECT count(*)::int AS total FROM "Organization" o WHERE ${where}`);
      const rows = ids.length ? await tx.organization.findMany({ where: { id: { in: ids.map(row => row.id) } }, select: organizationSelect }) : [];
      const byId = new Map(rows.map(row => [row.id, row]));
      const settings = await this.settings.get(tx);
      const items = ids.flatMap(({ id }) => {
        const row = byId.get(id); if (!row) return [];
        const latest = row.verifications[0] ?? null;
        return [{ ...row, lastVerifiedAt: latest?.verifiedAt ?? null, verificationStatus: verificationCondition(latest, { version: row.version, contactValueVersion: null },
          settings.institutionalVerificationMonths, new Date()).verificationStatus }];
      });
      return { items, total: totals[0]?.total ?? 0 };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  async contacts(filters: ContactsExportFilters, page: number, pageSize: number, actorId: string) {
    return this.prisma.$transaction(async tx => {
      await this.authorize(actorId, tx);
      const where: Prisma.PersonWhereInput = {
        ...(filters.status && filters.status !== 'all' ? { isActive: filters.status === 'active' } : {}),
        ...(filters.name ? { displayName: { contains: filters.name, mode: 'insensitive' } } : {}),
      };
      const people = await tx.person.findMany({ where, select: personSelect, orderBy: [{ displayName: 'asc' }, { id: 'asc' }], skip: (page - 1) * pageSize, take: pageSize });
      const total = await tx.person.count({ where });
      const settings = await this.settings.get(tx), now = new Date();
      return { total, items: people.map(person => {
        const latest = person.verifications[0] ?? null;
        return { ...person, lastVerifiedAt: latest?.verifiedAt ?? null, verificationStatus: verificationCondition(latest, { version: person.version, contactValueVersion: null }, settings.personalVerificationMonths, now).verificationStatus,
          contacts: person.contacts.filter(contact => !filters.contactType || contact.contactMethod.type === filters.contactType),
          relations: person.relations.filter(relation => filters.relationStatus === 'all' || !filters.relationStatus ||
            relation.isCurrent === (filters.relationStatus === 'current')) };
      }) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
}
