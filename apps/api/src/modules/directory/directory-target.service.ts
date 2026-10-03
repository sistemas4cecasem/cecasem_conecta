import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { DirectoryActorPolicy } from './directory-actor.policy';

export type InstitutionalTarget = { organizationId: string; personId?: never } | { personId: string; organizationId?: never };
export type TargetSummary = { kind: 'ORGANIZATION' | 'PERSON'; id: string; label: string; isActive: boolean };
export class UnavailableDirectoryTarget extends Error {}

/** Interfaz pública de lectura. No modifica fichas ni produce verificaciones. */
@Injectable()
export class DirectoryTargetService {
  constructor(private readonly actors: DirectoryActorPolicy) {}

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
