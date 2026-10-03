import { DirectoryActorPolicy } from './directory-actor.policy';
import { Injectable } from '@nestjs/common';
import { AuditAction, Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UsersService } from '../users/users.service';
import { hasPermission } from '../auth/authorization/role-permissions';
import { PERMISSIONS, type Permission } from '../auth/authorization/permission';
import { DirectoryHistoryService, type FieldChange, type DirectoryTarget } from './directory-history.service';
import { DirectoryError } from './directory.errors';
import { assertAcyclic, assertVersion, categoryName, institutionalText, website } from './directory.rules';
import type { CategoryInputDto, CategoryEditDto, DirectoryQueryDto, DirectoryStatusDto, OrganizationInputDto, OrganizationEditDto, PageQueryDto } from './directory.dto';

const categorySelect = { id: true, name: true, isActive: true, version: true, createdAt: true, updatedAt: true } satisfies Prisma.CategorySelect;
const organizationSelect = {
  id: true, name: true, country: true, alias: true, description: true, officialWebsite: true, isActive: true,
  duplicateOfId: true, duplicateOf: { select: { id: true, name: true } }, consolidatedRecords: { select: { id: true, name: true } }, version: true, parentId: true, createdAt: true, updatedAt: true, lastVerifiedAt: true,
  parent: { select: { id: true, name: true, isActive: true } },
  categories: { select: { category: { select: categorySelect } }, orderBy: { categoryId: 'asc' } },
} satisfies Prisma.OrganizationSelect;
type OrganizationRow = Prisma.OrganizationGetPayload<{ select: typeof organizationSelect }>;
function organizationContract(row: OrganizationRow) { return { ...row, categories: row.categories.map(link => link.category) }; }
function normalizedOrganization(input: OrganizationInputDto) {
  return { name: institutionalText(input.name, 250, true)!, country: institutionalText(input.country, 150),
    alias: institutionalText(input.alias, 150), description: institutionalText(input.description, 5000),
    officialWebsite: website(input.officialWebsite), parentId: input.parentId ?? null };
}
function paging(query: PageQueryDto) { return { skip: (query.page - 1) * query.pageSize, take: query.pageSize }; }

@Injectable()
export class DirectoryService {
  constructor(private readonly actors: DirectoryActorPolicy, private readonly prisma: PrismaService, private readonly users: UsersService,
    private readonly history: DirectoryHistoryService, private readonly audit: AuditService) {}

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
  async getOrganization(id: string) { return organizationContract(await this.organization(id)); }

  async listOrganizations(query: DirectoryQueryDto) {
    const where: Prisma.OrganizationWhereInput = { ...(query.status === 'all' ? {} : { isActive: query.status === 'active' }),
      ...(query.parentId ? { parentId: query.parentId } : {}), ...(query.name ? { name: { contains: query.name, mode: 'insensitive' } } : {}) };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.organization.findMany({ where, select: organizationSelect, orderBy: [{ name: 'asc' }, { id: 'asc' }], ...paging(query) }),
      this.prisma.organization.count({ where }),
    ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    return { items: rows.map(organizationContract), total, page: query.page, pageSize: query.pageSize };
  }
  async children(id: string, query: DirectoryQueryDto) {
    await this.organization(id);
    return this.listOrganizations({ ...query, parentId: id });
  }

  // Namespace exclusivo del directorio, clave jerarquía. Nunca usa el lock administrativo.
  async lockHierarchy(tx: Prisma.TransactionClient): Promise<void> {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(1128612692, 1)::text`;
  }
  private async validateParent(id: string | undefined, parentId: string | null, tx: Prisma.TransactionClient): Promise<void> {
    const ancestors: string[] = [];
    let next = parentId;
    while (next) {
      ancestors.push(next);
      await this.actors.writable('organization', next, tx);
      assertAcyclic(id ?? '', ancestors);
      const parent = await tx.organization.findUnique({ where: { id: next }, select: { parentId: true } });
      if (!parent) throw new DirectoryError('ORGANIZATION_NOT_FOUND');
      next = parent.parentId;
    }
  }
  private async validateCategories(ids: string[], retainedIds: string[], tx: Prisma.TransactionClient): Promise<void> {
    if (ids.length > 100 || new Set(ids).size !== ids.length) throw new DirectoryError('INVALID_DIRECTORY');
    // Protege la comprobación de actividad frente a un cambio de estado concurrente.
    for (const id of [...ids].sort()) await tx.$queryRaw`SELECT id FROM "Category" WHERE id = ${id}::uuid FOR SHARE`;
    const categories = await tx.category.findMany({ where: { id: { in: ids } }, select: { id: true, isActive: true } });
    if (categories.length !== ids.length) throw new DirectoryError('CATEGORY_NOT_FOUND');
    if (categories.some(category => !category.isActive && !retainedIds.includes(category.id))) throw new DirectoryError('CATEGORY_INACTIVE');
  }
  async createOrganization(input: OrganizationInputDto, actorId: string) {
    const normalized = normalizedOrganization(input);
    const categoryIds = input.categoryIds ?? [];
    return this.prisma.$transaction(async tx => {
      await this.authorize(actorId, PERMISSIONS.DIRECTORY_WRITE, tx);
      if (normalized.parentId) { await this.lockHierarchy(tx); await this.validateParent(undefined, normalized.parentId, tx); }
      await this.validateCategories(categoryIds, [], tx);
      const row = await tx.organization.create({ data: { ...normalized,
        categories: { create: categoryIds.map(categoryId => ({ categoryId })) } }, select: organizationSelect });
      const initialRelations: FieldChange[] = [];
      if (normalized.parentId) initialRelations.push({ field: 'parentId', previousValue: null, newValue: normalized.parentId });
      if (categoryIds.length) initialRelations.push({ field: 'categoryIds', previousValue: [], newValue: [...categoryIds].sort() });
      if (initialRelations.length) await this.history.record({ organizationId: row.id }, actorId, initialRelations, tx);
      return organizationContract(row);
    }, { timeout: 10000 });
  }

  async editOrganization(id: string, input: OrganizationEditDto, actorId: string) {
    const normalized = normalizedOrganization(input);
    return this.prisma.$transaction(async tx => {
      await this.authorize(actorId, PERMISSIONS.DIRECTORY_WRITE, tx);
      await this.lockHierarchy(tx);
      await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${id}::uuid FOR UPDATE`;
      const current = await this.organization(id, tx);
      await this.actors.writable('organization', id, tx);
      assertVersion(current.version, input.expectedVersion);
      await this.validateParent(id, normalized.parentId, tx);
      const previousIds = current.categories.map(link => link.category.id).sort();
      const categoryIds = [...(input.categoryIds ?? [])].sort();
      await this.validateCategories(categoryIds, previousIds, tx);
      const changes: FieldChange[] = [];
      for (const field of ['name', 'country', 'alias', 'description', 'officialWebsite', 'parentId'] as const) {
        if (current[field] !== normalized[field]) changes.push({ field, previousValue: current[field], newValue: normalized[field] });
      }
      if (JSON.stringify(previousIds) !== JSON.stringify(categoryIds)) changes.push({ field: 'categoryIds', previousValue: previousIds, newValue: categoryIds });
      if (!changes.length) return organizationContract(current);
      const result = await tx.organization.updateMany({ where: { id, version: input.expectedVersion },
        data: { ...normalized, version: { increment: 1 } } });
      if (result.count !== 1) throw new DirectoryError('VERSION_CONFLICT');
      await tx.organizationCategory.deleteMany({ where: { organizationId: id } });
      await tx.organizationCategory.createMany({ data: categoryIds.map(categoryId => ({ organizationId: id, categoryId })) });
      const operationId = await this.history.record({ organizationId: id }, actorId, changes, tx);
      await this.audit.recordDirectory(AuditAction.ORGANIZATION_UPDATED, { organizationId: id }, actorId, operationId, tx);
      return organizationContract(await this.organization(id, tx));
    }, { timeout: 10000 });
  }
  async organizationStatus(id: string, input: DirectoryStatusDto, actorId: string) {
    return this.prisma.$transaction(async tx => {
      await this.authorize(actorId, PERMISSIONS.DIRECTORY_STATUS_UPDATE, tx);
      await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${id}::uuid FOR UPDATE`;
      const current = await this.organization(id, tx);
      await this.actors.writable('organization', id, tx);
      assertVersion(current.version, input.expectedVersion);
      if (current.isActive === input.isActive) return organizationContract(current);
      await tx.organization.update({ where: { id }, data: { isActive: input.isActive, version: { increment: 1 } } });
      const operationId = await this.history.record({ organizationId: id }, actorId,
        [{ field: 'isActive', previousValue: current.isActive, newValue: input.isActive }], tx);
      await this.audit.recordDirectory(AuditAction.ORGANIZATION_STATUS_CHANGED, { organizationId: id }, actorId, operationId, tx);
      return organizationContract(await this.organization(id, tx));
    });
  }
  async organizationHistory(id: string, query: PageQueryDto) {
    await this.organization(id);
    return this.listHistory({ organizationId: id }, query);
  }
  async listHistory(target: DirectoryTarget, query: PageQueryDto) {
    return this.history.list(target, query);
  }
  async listCategories(query: DirectoryQueryDto) {
    const where: Prisma.CategoryWhereInput = { ...(query.status === 'all' ? {} : { isActive: query.status === 'active' }),
      ...(query.name ? { name: { contains: query.name, mode: 'insensitive' } } : {}) };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.category.findMany({ where, select: categorySelect, orderBy: [{ name: 'asc' }, { id: 'asc' }], ...paging(query) }),
      this.prisma.category.count({ where }),
    ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    return { items, total, page: query.page, pageSize: query.pageSize };
  }
  private async category(id: string, tx: Prisma.TransactionClient = this.prisma) {
    const row = await tx.category.findUnique({ where: { id }, select: categorySelect });
    if (!row) throw new DirectoryError('CATEGORY_NOT_FOUND');
    return row;
  }
  async createCategory(input: CategoryInputDto, actorId: string) {
    try {
      return await this.prisma.$transaction(async tx => {
        await this.authorize(actorId, PERMISSIONS.DIRECTORY_WRITE, tx);
        return tx.category.create({ data: categoryName(input.name), select: categorySelect });
      });
    } catch (error) { return this.categoryConflict(error); }
  }
  private categoryConflict(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new DirectoryError('CATEGORY_EXISTS');
    throw error;
  }
  async editCategory(id: string, input: CategoryEditDto, actorId: string) {
    const normalized = categoryName(input.name);
    try {
      return await this.prisma.$transaction(async tx => {
        await this.authorize(actorId, PERMISSIONS.DIRECTORY_WRITE, tx);
        await tx.$queryRaw`SELECT id FROM "Category" WHERE id = ${id}::uuid FOR UPDATE`;
        const current = await this.category(id, tx); assertVersion(current.version, input.expectedVersion);
        if (current.name === normalized.name) return current;
        await tx.category.update({ where: { id }, data: { ...normalized, version: { increment: 1 } } });
        const operationId = await this.history.record({ categoryId: id }, actorId,
          [{ field: 'name', previousValue: current.name, newValue: normalized.name }], tx);
        await this.audit.recordDirectory(AuditAction.CATEGORY_UPDATED, { categoryId: id }, actorId, operationId, tx);
        return this.category(id, tx);
      });
    } catch (error) { return this.categoryConflict(error); }
  }
  async categoryStatus(id: string, input: DirectoryStatusDto, actorId: string) {
    return this.prisma.$transaction(async tx => {
      await this.authorize(actorId, PERMISSIONS.DIRECTORY_STATUS_UPDATE, tx);
      await tx.$queryRaw`SELECT id FROM "Category" WHERE id = ${id}::uuid FOR UPDATE`;
      const current = await this.category(id, tx); assertVersion(current.version, input.expectedVersion);
      if (current.isActive === input.isActive) return current;
      await tx.category.update({ where: { id }, data: { isActive: input.isActive, version: { increment: 1 } } });
      const operationId = await this.history.record({ categoryId: id }, actorId,
        [{ field: 'isActive', previousValue: current.isActive, newValue: input.isActive }], tx);
      await this.audit.recordDirectory(AuditAction.CATEGORY_STATUS_CHANGED, { categoryId: id }, actorId, operationId, tx);
      return this.category(id, tx);
    });
  }
  async categoryHistory(id: string, query: PageQueryDto) {
    await this.category(id);
    return this.listHistory({ categoryId: id }, query);
  }
}
