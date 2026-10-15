import { DirectoryActorPolicy } from './directory-actor.policy';
import { OrganizationFilterService } from './organization-filter.service';
import { Injectable } from '@nestjs/common';
import { AuditAction, Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UsersService } from '../users/users.service';
import { hasPermission } from '../auth/authorization/role-permissions';
import { PERMISSIONS, type Permission } from '../auth/authorization/permission';
import { DirectoryHistoryService, type FieldChange, type DirectoryTarget } from './directory-history.service';
import { DirectoryError } from './directory.errors';
import { assertAcyclic, assertVersion, interestAreas, institutionalText, website } from './directory.rules';
import type { DirectoryQueryDto, DirectoryStatusDto, OrganizationInputDto, OrganizationEditDto, OrganizationQueryDto, PageQueryDto } from './directory.dto';

const organizationSelect = {
  id: true, name: true, country: true, alias: true, description: true, officialWebsite: true, isActive: true,
  duplicateOfId: true, duplicateOf: { select: { id: true, name: true } }, consolidatedRecords: { select: { id: true, name: true } }, version: true, branchOfId: true, createdAt: true, updatedAt: true,
  dataImportBatchId: true, dataImportBatch: { select: { id: true, originalFilename: true, createdAt: true } },
  branchOf: { select: { id: true, name: true, isActive: true } },
  interestAreas: true,
} satisfies Prisma.OrganizationSelect;
type OrganizationRow = Prisma.OrganizationGetPayload<{ select: typeof organizationSelect }>;
function organizationContract(row: OrganizationRow) { return { ...row }; }
function normalizedOrganization(input: OrganizationInputDto) {
  return { name: input.branchOfId ? '' : institutionalText(input.name, 250, true)!, country: institutionalText(input.country, 150,!!input.branchOfId),
    alias: institutionalText(input.alias, 150), description: institutionalText(input.description, 5000),
    interestAreas: input.branchOfId ? [] : interestAreas(input.interestAreas), officialWebsite: website(input.officialWebsite), branchOfId: input.branchOfId ?? null };
}
function paging(query: PageQueryDto) { return { skip: (query.page - 1) * query.pageSize, take: query.pageSize }; }

@Injectable()
export class DirectoryService {
  constructor(private readonly actors: DirectoryActorPolicy, private readonly prisma: PrismaService, private readonly users: UsersService,
    private readonly history: DirectoryHistoryService, private readonly audit: AuditService, private readonly filters: OrganizationFilterService) {}

  private async authorize(actorId: string, permission: Permission, tx: Prisma.TransactionClient): Promise<void> {
    const actor = await this.users.findIdentityById(actorId, tx);
    if (!actor?.isActive || !hasPermission(actor.role, permission)) throw new DirectoryError('FORBIDDEN');
    await this.actors.lock(tx);
  }
  private async organization(id: string, tx: Prisma.TransactionClient = this.prisma): Promise<OrganizationRow> {
    const row = await tx.organization.findUnique({ where: { id }, select: organizationSelect });
    if (!row) throw new DirectoryError('ORGANIZATION_NOT_FOUND');
    return row;
  }
  private async organizationContracts(rows: OrganizationRow[], tx: Prisma.TransactionClient) {
    const ancestors = new Map(rows.map(row => [row.id, {id:row.id,branchOfId:row.branchOfId,interestAreas:row.interestAreas}]));
    let missing = [...new Set(rows.flatMap(row => row.branchOfId ? [row.branchOfId] : []))].filter(id => !ancestors.has(id));
    while (missing.length) {
      const owners = await tx.organization.findMany({where:{id:{in:missing}},select:{id:true,branchOfId:true,interestAreas:true}});
      if (owners.length !== missing.length) throw new DirectoryError('ORGANIZATION_NOT_FOUND');
      for (const owner of owners) ancestors.set(owner.id, owner);
      missing = [...new Set(owners.flatMap(row => row.branchOfId ? [row.branchOfId] : []))].filter(id => !ancestors.has(id));
    }
    return rows.map(row => {
      let owner = ancestors.get(row.id)!;
      const visited = new Set<string>();
      while (owner.branchOfId) {
        if (visited.has(owner.id)) throw new DirectoryError('INVALID_HIERARCHY');
        visited.add(owner.id); owner = ancestors.get(owner.branchOfId)!;
      }
      return {...organizationContract(row),interestAreas:owner.interestAreas};
    });
  }
  async getOrganization(id: string) {
    return this.prisma.$transaction(tx => this.getOrganizationWithinTransaction(id,tx),{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
  }

  async getOrganizationWithinTransaction(id:string,tx:Prisma.TransactionClient) {return (await this.organizationContracts([await this.organization(id,tx)],tx))[0];}

  async listOrganizations(query: OrganizationQueryDto, actorId?: string) {
    if (query.country !== undefined || query.withCommunications !== undefined) {
      return this.prisma.$transaction(async tx => {
        const filter = await this.filters.predicate(query, tx, actorId);
        const [result] = await tx.$queryRaw<{ ids: string[]; total: number }[]>(Prisma.sql`
          WITH matches AS (SELECT o.id, o.name FROM "Organization" o WHERE (${filter})
            ${query.branchOfId ? Prisma.sql`AND o."branchOfId" = ${query.branchOfId}::uuid` : Prisma.sql`AND o."branchOfId" IS NULL`}
            ${query.name ? Prisma.sql`AND o.name ILIKE ${'%' + query.name + '%'}` : Prisma.empty})
          SELECT ARRAY(SELECT id::text FROM matches ORDER BY name, id LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}) AS ids,
            (SELECT count(*)::int FROM matches) AS total`);
        const rows = await tx.organization.findMany({ where: { id: { in: result.ids } }, select: organizationSelect });
        const byId = new Map(rows.map(row => [row.id, row]));
        return { items: await this.organizationContracts(result.ids.map(id => byId.get(id)!),tx), total: result.total, page: query.page, pageSize: query.pageSize };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    }
    const where: Prisma.OrganizationWhereInput = { ...(query.status === 'all' ? {} : { isActive: query.status === 'active' }),
      branchOfId: query.branchOfId ?? null, ...(query.name ? { name: { contains: query.name, mode: 'insensitive' } } : {}) };
    return this.prisma.$transaction(async tx => {
      const [rows,total]=await Promise.all([
        tx.organization.findMany({where,select:organizationSelect,orderBy:[{name:'asc'},{id:'asc'}],...paging(query)}),
        tx.organization.count({where}),
      ]);
      return {items:await this.organizationContracts(rows,tx),total,page:query.page,pageSize:query.pageSize};
    },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
  }
  async branches(id: string, query: DirectoryQueryDto) {
    await this.organization(id);
    return this.listOrganizations({ ...query, branchOfId: id });
  }

  // Namespace exclusivo del directorio, clave jerarquía. Nunca usa el lock administrativo.
  async lockHierarchy(tx: Prisma.TransactionClient): Promise<void> {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(1128612692, 1)::text`;
  }
  private async validateBranchOwner(id: string | undefined, branchOfId: string | null, tx: Prisma.TransactionClient): Promise<void> {
    const ancestors: string[] = [];
    let next = branchOfId;
    while (next) {
      ancestors.push(next);
      await this.actors.writable('organization', next, tx);
      assertAcyclic(id ?? '', ancestors);
      const owner = await tx.organization.findUnique({ where: { id: next }, select: { branchOfId: true } });
      if (!owner) throw new DirectoryError('ORGANIZATION_NOT_FOUND');
      next = owner.branchOfId;
    }
  }
  async createOrganization(input: OrganizationInputDto, actorId: string) {
    return this.prisma.$transaction(tx => this.createOrganizationWithinTransaction(input,actorId,tx), {timeout:10000});
  }
  async createOrganizationWithinTransaction(input: OrganizationInputDto, actorId: string, tx: Prisma.TransactionClient) {
    const normalized = normalizedOrganization(input);
    await this.authorize(actorId, PERMISSIONS.DIRECTORY_WRITE, tx);
    if (normalized.branchOfId) { await this.lockHierarchy(tx); await this.validateBranchOwner(undefined, normalized.branchOfId, tx); normalized.name=(await this.organization(normalized.branchOfId,tx)).name; }
    const row = await tx.organization.create({ data: normalized, select: organizationSelect });
    const initialRelations: FieldChange[] = [];
    if (normalized.branchOfId) initialRelations.push({ field: 'branchOfId', previousValue: null, newValue: normalized.branchOfId });
    if (normalized.interestAreas.length) initialRelations.push({ field: 'interestAreas', previousValue: [], newValue: normalized.interestAreas });
    if (initialRelations.length) await this.history.record({ organizationId: row.id }, actorId, initialRelations, tx);
    return (await this.organizationContracts([row],tx))[0];
  }

  async editOrganization(id:string,input:OrganizationEditDto,actorId:string) {
    return this.prisma.$transaction(tx=>this.editOrganizationWithinTransaction(id,input,actorId,tx),{timeout:10000});
  }
  async editOrganizationWithinTransaction(id:string,input:OrganizationEditDto,actorId:string,tx:Prisma.TransactionClient,expectedBranchOfId?:string) {
    const normalized=normalizedOrganization(input);
    await this.authorize(actorId, PERMISSIONS.DIRECTORY_WRITE, tx);
    await this.lockHierarchy(tx);
    await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${id}::uuid FOR UPDATE`;
    const current = await this.organization(id, tx);
    if(expectedBranchOfId&&current.branchOfId!==expectedBranchOfId)throw new DirectoryError('ORGANIZATION_NOT_FOUND');
    await this.actors.writable('organization', id, tx);
    assertVersion(current.version, input.expectedVersion);
    await this.validateBranchOwner(id, normalized.branchOfId, tx);
    if(normalized.branchOfId)normalized.name=(await this.organization(normalized.branchOfId,tx)).name;
    const changes: FieldChange[] = [];
    for (const field of ['name', 'country', 'alias', 'description', 'officialWebsite', 'branchOfId'] as const) {
      if (current[field] !== normalized[field]) changes.push({ field, previousValue: current[field], newValue: normalized[field] });
    }
    if (JSON.stringify(current.interestAreas) !== JSON.stringify(normalized.interestAreas)) changes.push({ field: 'interestAreas', previousValue: current.interestAreas, newValue: normalized.interestAreas });
    if (!changes.length) return (await this.organizationContracts([current],tx))[0];
    const result = await tx.organization.updateMany({ where: { id, version: input.expectedVersion },
      data: { ...normalized, version: { increment: 1 } } });
    if (result.count !== 1) throw new DirectoryError('VERSION_CONFLICT');
    const operationId = await this.history.record({ organizationId: id }, actorId, changes, tx);
    await this.audit.recordDirectory(AuditAction.ORGANIZATION_UPDATED, { organizationId: id }, actorId, operationId, tx);
    return (await this.organizationContracts([await this.organization(id, tx)],tx))[0];
  }

  async organizationStatus(id: string, input: DirectoryStatusDto, actorId: string) {
    return this.prisma.$transaction(async tx => {
      await this.authorize(actorId, PERMISSIONS.DIRECTORY_STATUS_UPDATE, tx);
      await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${id}::uuid FOR UPDATE`;
      const current = await this.organization(id, tx);
      await this.actors.writable('organization', id, tx);
      assertVersion(current.version, input.expectedVersion);
      if (current.isActive === input.isActive) return (await this.organizationContracts([current],tx))[0];
      await tx.organization.update({ where: { id }, data: { isActive: input.isActive, version: { increment: 1 } } });
      const operationId = await this.history.record({ organizationId: id }, actorId,
        [{ field: 'isActive', previousValue: current.isActive, newValue: input.isActive }], tx);
      await this.audit.recordDirectory(AuditAction.ORGANIZATION_STATUS_CHANGED, { organizationId: id }, actorId, operationId, tx);
      return (await this.organizationContracts([await this.organization(id, tx)],tx))[0];
    });
  }
  async organizationHistory(id: string, query: PageQueryDto) {
    await this.organization(id);
    return this.listHistory({ organizationId: id }, query);
  }
  async listHistory(target: DirectoryTarget, query: PageQueryDto) {
    return this.history.list(target, query);
  }
}
