import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma, type ProcessState } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { normalizedSearchText } from '../../common/search/search-text';
import { DirectoryTargetService, type InstitutionalTarget, type TargetSummary } from '../directory/directory-target.service';
import { UsersService } from '../users/users.service';
import { hasPermission } from '../auth/authorization/role-permissions';
import { PERMISSIONS } from '../auth/authorization/permission';

export interface SearchProcess {
  type: 'PROCESS'; id: string; purpose: string; state: ProcessState; target: TargetSummary;
}
export interface ProcessSearchQuery { name: string; page: number; pageSize: number }
const processSelect = { id: true, purpose: true, state: true, organizationId: true, personId: true } satisfies Prisma.RelationshipProcessSelect;

/** Lectura pública de Relaciones; no utiliza los contratos de mutación por fila. */
@Injectable()
export class RelationshipSearchService {
  constructor(private readonly prisma: PrismaService, private readonly users: UsersService, private readonly directory: DirectoryTargetService) {}

  async contexts(ids: string[], tx: Prisma.TransactionClient): Promise<Map<string, SearchProcess>> {
    if (!ids.length) return new Map();
    const rows = await tx.relationshipProcess.findMany({ where: { id: { in: [...new Set(ids)] } }, select: processSelect });
    const targets: InstitutionalTarget[] = rows.map(row => row.organizationId ? { organizationId: row.organizationId } : { personId: row.personId! });
    const summaries = await this.directory.summaries(targets, tx);
    return new Map(rows.map(row => [row.id, { type: 'PROCESS', id: row.id, purpose: row.purpose, state: row.state,
      target: summaries.get((row.organizationId ? 'ORGANIZATION:' + row.organizationId : 'PERSON:' + row.personId))! }]));
  }

  async search(query: ProcessSearchQuery, actorId: string) {
    return this.prisma.$transaction(async tx => {
      const actor = await this.users.findIdentityById(actorId, tx);
      if (!actor?.isActive || !hasPermission(actor.role, PERMISSIONS.PROCESS_READ) || !hasPermission(actor.role, PERMISSIONS.DIRECTORY_READ)) throw new ForbiddenException();
      if (!query.name) return { items: [] as SearchProcess[], total: 0, page: query.page, pageSize: query.pageSize };
      const tokens = query.name.split(' ').map(token => Prisma.sql`label LIKE ${'%' + token + '%'}`);
      const [result] = await tx.$queryRaw<{ ids: string[]; total: number }[]>(Prisma.sql`
        WITH names AS (SELECT id, ${normalizedSearchText(Prisma.sql`purpose`)} AS label FROM "RelationshipProcess"),
        matches AS (SELECT *, CASE WHEN label = ${query.name} THEN 0 WHEN label LIKE ${query.name + '%'} THEN 1 ELSE 2 END AS rank
          FROM names WHERE ${Prisma.join(tokens, ' AND ')})
        SELECT ARRAY(SELECT id::text FROM matches ORDER BY rank, label COLLATE "C", id
          LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}) AS ids,
          (SELECT count(*)::int FROM matches) AS total`);
      const contexts = await this.contexts(result.ids, tx);
      return { items: result.ids.map(id => contexts.get(id)!), total: result.total, page: query.page, pageSize: query.pageSize };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
}
