import { Injectable } from '@nestjs/common';
import { OrganizationFilterService } from './organization-filter.service';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { DirectorySearchQuery, SearchEmail, SearchOrganization, SearchPage, SearchPerson } from './directory-search.contract';
import { searchInput } from './directory-search.rules';
import { normalizedSearchText as normalized } from '../../common/search/search-text';

const organizationSelect = { id: true, name: true, alias: true, country: true, isActive: true,
  parent: { select: { id: true, name: true, isActive: true } }, duplicateOf: { select: { id: true, name: true, isActive: true } } } satisfies Prisma.OrganizationSelect;
const personIdentity = { id: true, displayName: true, isActive: true,
  duplicateOf: { select: { id: true, displayName: true, isActive: true } } } satisfies Prisma.PersonSelect;
const organizationIdentity = { id: true, name: true, isActive: true,
  duplicateOf: { select: { id: true, name: true, isActive: true } } } satisfies Prisma.OrganizationSelect;
const contextLimit = 10;

/** Interfaz pública de consulta de directory. Solo este módulo consulta su persistencia. */
@Injectable()
export class DirectorySearchService {
  constructor(private readonly prisma: PrismaService, private readonly filters: OrganizationFilterService) {}

  private empty<T>(query: DirectorySearchQuery): SearchPage<T> {
    return { items: [], total: 0, page: query.page, pageSize: query.pageSize };
  }
  private async matchingIds(kind: 'organization' | 'person', query: DirectorySearchQuery, tx: Prisma.TransactionClient) {
    const input = searchInput(query.q);
    if (!input.name) return { ids: [] as string[], total: 0 };
    // Todos los identificadores SQL provienen de estas constantes, nunca de la petición.
    const table = kind === 'organization' ? Prisma.sql`"Organization"` : Prisma.sql`"Person"`;
    const label = kind === 'organization' ? Prisma.sql`name` : Prisma.sql`"displayName"`;
    const alternate = kind === 'organization' ? Prisma.sql`alias` : Prisma.sql`concat_ws(' ', "givenNames", "familyNames")`;
    const tokens = input.name.split(' ').map(token => Prisma.sql`combined LIKE ${'%' + token + '%'}`);
    const filter = kind === 'organization' && query.organizationFilters ? await this.filters.predicate(query.organizationFilters, tx, query.actorId) : Prisma.sql`TRUE`;
    const [result] = await tx.$queryRaw<{ ids: string[]; total: number }[]>(Prisma.sql`
      WITH names AS (
        SELECT id, "isActive", "duplicateOfId", ${normalized(label)} AS label,
          ${normalized(alternate)} AS alternate FROM ${table} o WHERE (${filter})
      ), matches AS (
        SELECT *, CASE WHEN label = ${input.name} OR alternate = ${input.name} THEN 0
          WHEN label LIKE ${input.name + '%'} OR alternate LIKE ${input.name + '%'} THEN 1 ELSE 2 END AS rank
        FROM (SELECT *, label || ' ' || alternate AS combined FROM names) searchable
        WHERE (${Prisma.join(tokens, ' AND ')}) AND (
          ${query.includeInactive} OR ("isActive" AND "duplicateOfId" IS NULL)
          OR ("duplicateOfId" IS NOT NULL AND (label = ${input.name} OR alternate = ${input.name})))
      )
      SELECT ARRAY(SELECT id::text FROM matches
        ORDER BY (NOT "isActive" OR "duplicateOfId" IS NOT NULL), rank, label COLLATE "C", id
        LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}) AS ids,
        (SELECT count(*)::int FROM matches) AS total`);
    return result;
  }
  async searchOrganizations(query: DirectorySearchQuery): Promise<SearchPage<SearchOrganization>> {
    if (!searchInput(query.q).name) return this.empty(query);
    return this.prisma.$transaction(async tx => {
      const { ids, total } = await this.matchingIds('organization', query, tx);
      const rows = await tx.organization.findMany({ where: { id: { in: ids } }, select: organizationSelect });
      const byId = new Map(rows.map(row => [row.id, row]));
      return { items: ids.map(id => ({ type: 'ORGANIZATION' as const, ...byId.get(id)! })), total, page: query.page, pageSize: query.pageSize };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  async searchPeople(query: DirectorySearchQuery): Promise<SearchPage<SearchPerson>> {
    if (!searchInput(query.q).name) return this.empty(query);
    return this.prisma.$transaction(async tx => {
      const { ids, total } = await this.matchingIds('person', query, tx);
      const rows = await tx.person.findMany({ where: { id: { in: ids } }, select: {
        ...personIdentity, relations: { where: { isCurrent: true }, take: 3, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: { id: true, positionTitle: true, organization: { select: { id: true, name: true, isActive: true } } } },
        _count: { select: { relations: { where: { isCurrent: true } } } },
      } });
      const byId = new Map(rows.map(({ relations, _count, ...row }) => [row.id,
        { type: 'PERSON' as const, ...row, currentRelations: relations, currentRelationsTotal: _count.relations }]));
      return { items: ids.map(id => byId.get(id)!), total, page: query.page, pageSize: query.pageSize };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  async findEmailWithContext(query: DirectorySearchQuery): Promise<SearchEmail | null> {
    const email = searchInput(query.q).email;
    if (!email) return null;
    return this.prisma.$transaction(async tx => {
      const row = await tx.contactMethod.findFirst({ where: { type: 'EMAIL', normalizedValue: email }, select: {
        id: true, value: true, condition: true,
        people: { take: contextLimit, orderBy: [{ isActive: 'desc' }, { id: 'asc' }], select: { id: true, isActive: true, person: { select: personIdentity } } },
        organizations: { take: contextLimit, orderBy: [{ isActive: 'desc' }, { id: 'asc' }], select: { id: true, isActive: true, organization: { select: organizationIdentity } } },
        _count: { select: { people: true, organizations: true } },
      } });
      if (!row) return null;
      return { type: 'EMAIL', id: row.id, value: row.value, condition: row.condition,
        people: { items: row.people, total: row._count.people, limit: contextLimit },
        organizations: { items: row.organizations, total: row._count.organizations, limit: contextLimit } };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
}
