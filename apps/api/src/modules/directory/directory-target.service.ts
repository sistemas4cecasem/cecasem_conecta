import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { DirectoryActorPolicy } from './directory-actor.policy';

export type InstitutionalTarget = { organizationId: string; personId?: never } | { personId: string; organizationId?: never };
export type TargetSummary = { kind: 'ORGANIZATION' | 'PERSON'; id: string; label: string; isActive: boolean };
export class UnavailableDirectoryTarget extends Error {}

/** Interfaz pública de lectura. No modifica fichas ni produce verificaciones. */
@Injectable()
export class DirectoryTargetService {
  constructor(private readonly actors: DirectoryActorPolicy) {}

  /** Proyecciones de lectura por lote para contextos transversales autorizados. */
  async summaries(targets: InstitutionalTarget[], tx: Prisma.TransactionClient): Promise<Map<string, TargetSummary>> {
    const organizationIds = [...new Set(targets.flatMap(target => target.organizationId ? [target.organizationId] : []))];
    const personIds = [...new Set(targets.flatMap(target => target.personId ? [target.personId] : []))];
    const organizations = organizationIds.length ? await tx.organization.findMany({ where: { id: { in: organizationIds } }, select: { id: true, name: true, isActive: true } }) : [];
    const people = personIds.length ? await tx.person.findMany({ where: { id: { in: personIds } }, select: { id: true, displayName: true, isActive: true } }) : [];
    return new Map<string, TargetSummary>([
      ...organizations.map(row => ['ORGANIZATION:' + row.id, { kind: 'ORGANIZATION' as const, id: row.id, label: row.name, isActive: row.isActive }] as const),
      ...people.map(row => ['PERSON:' + row.id, { kind: 'PERSON' as const, id: row.id, label: row.displayName, isActive: row.isActive }] as const),
    ]);
  }

  /** Organizaciones vigentes distintas, acotadas y sin los locks de validación de escritura. */
  async currentOrganizationContext(personId: string, limit: number, tx: Prisma.TransactionClient): Promise<{ items: TargetSummary[]; total: number }> {
    const where = { personRelations: { some: { personId, isCurrent: true } } };
    const rows = await tx.organization.findMany({ where, select: { id: true, name: true, isActive: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }], take: limit });
    const total = await tx.organization.count({ where });
    return { items: rows.map(row => ({ kind: 'ORGANIZATION', id: row.id, label: row.name, isActive: row.isActive })), total };
  }

  /** Valida asociaciones nuevas en lote y conserva referencias históricas ya existentes. */
  async requireOrganizationLinks(ids: readonly string[], retainedIds: readonly string[], tx: Prisma.TransactionClient): Promise<{ id: string; name: string; isActive: boolean }[]> {
    await this.actors.lock(tx);
    await tx.$queryRaw(Prisma.sql`SELECT id FROM "Organization" WHERE id IN (${Prisma.join(ids.map(id => Prisma.sql`${id}::uuid`))}) ORDER BY id FOR SHARE`);
    const rows = await tx.organization.findMany({ where: { id: { in: [...ids] } }, select: { id: true, name: true, isActive: true, duplicateOfId: true } });
    if (rows.length !== ids.length || rows.some(row => !retainedIds.includes(row.id) && (!row.isActive || row.duplicateOfId))) throw new UnavailableDirectoryTarget();
    return rows.map(row => ({ id: row.id, name: row.name, isActive: row.isActive }));
  }

  async summary(target: InstitutionalTarget, tx: Prisma.TransactionClient): Promise<TargetSummary> {
    if (target.organizationId) {
      const row = await tx.organization.findUnique({ where: { id: target.organizationId }, select: { id: true, name: true, isActive: true } });
      if (!row) throw new UnavailableDirectoryTarget();
      return { kind: 'ORGANIZATION', id: row.id, label: row.name, isActive: row.isActive };
    }
    const row = await tx.person.findUnique({ where: { id: target.personId }, select: { id: true, displayName: true, isActive: true } });
    if (!row) throw new UnavailableDirectoryTarget();
    return { kind: 'PERSON', id: row.id, label: row.displayName, isActive: row.isActive };
  }

  async requireUsable(target: InstitutionalTarget, tx: Prisma.TransactionClient): Promise<TargetSummary> {
    await this.actors.lock(tx);
    if (target.organizationId) {
      await tx.$queryRaw`SELECT id FROM "Organization" WHERE id=${target.organizationId}::uuid FOR SHARE`;
      const row = await tx.organization.findUnique({ where: { id: target.organizationId }, select: { isActive: true, duplicateOfId: true } });
      if (!row?.isActive || row.duplicateOfId) throw new UnavailableDirectoryTarget();
    } else {
      // El lock de persona impide altas concurrentes de vínculos mediante su FK.
      await tx.$queryRaw`SELECT id FROM "Person" WHERE id=${target.personId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "PersonOrganizationRelation" WHERE "personId"=${target.personId}::uuid ORDER BY id FOR SHARE`;
      const row = await tx.person.findUnique({ where: { id: target.personId }, select: { isActive: true, duplicateOfId: true } });
      if (!row?.isActive || row.duplicateOfId || await tx.personOrganizationRelation.count({ where: { personId: target.personId, isCurrent: true } })) {
        throw new UnavailableDirectoryTarget();
      }
    }
    return this.summary(target, tx);
  }
}
