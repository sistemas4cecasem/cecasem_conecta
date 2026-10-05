import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { RelationshipProcessesService } from './relationship-processes.service';
import { ContactRestrictionsService } from './contact-restrictions.service';

export type InactivityKind = 'intent' | 'process';
export type InactivityCandidate = { id: string; lastActivityAt: Date; organizationId: string | null; personId: string | null; authorUserId?: string };

/** Frontera pública de Relationships para seguimiento; no cambia actividad ni negocio. */
@Injectable()
export class InactivitySourcesService {
  constructor(private readonly prisma: PrismaService, private readonly processes: RelationshipProcessesService,
    private readonly restrictions: ContactRestrictionsService) {}

  candidates(kind: InactivityKind, cutoff: Date, after?: { lastActivityAt: Date; id: string }): Promise<InactivityCandidate[]> {
    const seek = after ? { OR: [{ lastActivityAt: { gt: after.lastActivityAt } }, { lastActivityAt: after.lastActivityAt, id: { gt: after.id } }] } : {};
    const common = { lastActivityAt: { lte: cutoff }, ...seek };
    const select = { id: true, lastActivityAt: true, organizationId: true, personId: true } as const;
    const orderBy = [{ lastActivityAt: 'asc' as const }, { id: 'asc' as const }];
    return kind === 'intent'
      ? this.prisma.contactIntent.findMany({ where: { ...common, state: 'ACTIVE' }, select: { ...select, authorUserId: true }, orderBy, take: 25 })
      : this.prisma.relationshipProcess.findMany({ where: { ...common, state: { not: 'CLOSED' } }, select, orderBy, take: 25 });
  }

  audience(kind: InactivityKind, rows: InactivityCandidate[], tx: Prisma.TransactionClient) {
    return kind === 'intent' ? Promise.resolve(rows.map(row => ({ processId: row.id, userId: row.authorUserId! })))
      : this.processes.notificationParticipants(rows.map(row => row.id), tx);
  }

  async allowedTargets(rows: InactivityCandidate[], tx: Prisma.TransactionClient) {
    const keys = await this.restrictions.inactivityAllowedTargets(rows.map(row => row.organizationId ? { organizationId: row.organizationId } : { personId: row.personId! }), tx);
    return new Set(rows.filter(row => keys.has(row.organizationId ? 'organization:' + row.organizationId : 'person:' + row.personId)).map(row => row.id));
  }

  async revalidate(kind: InactivityKind, candidate: InactivityCandidate, tx: Prisma.TransactionClient) {
    // NOWAIT evita invertir Users → recurso de los productores: si hay actividad pendiente, reintentar.
    if (kind === 'intent') await tx.$queryRaw`SELECT id FROM "ContactIntent" WHERE id=${candidate.id}::uuid FOR UPDATE NOWAIT`;
    else await tx.$queryRaw`SELECT id FROM "RelationshipProcess" WHERE id=${candidate.id}::uuid FOR UPDATE NOWAIT`;
    const row = kind === 'intent' ? await tx.contactIntent.findUnique({ where: { id: candidate.id } })
      : await tx.relationshipProcess.findUnique({ where: { id: candidate.id } });
    if (!row || +row.lastActivityAt !== +candidate.lastActivityAt || (kind === 'intent' ? row.state !== 'ACTIVE' : row.state === 'CLOSED')) return false;
    return row.organizationId === candidate.organizationId && row.personId === candidate.personId;
  }

  async summaries(intentIds: string[], processIds: string[]) {
    const select = { id: true, purpose: true, organization: { select: { name: true } }, person: { select: { givenNames: true, familyNames: true } } } as const;
    const [intents, processes] = await Promise.all([
      this.prisma.contactIntent.findMany({ where: { id: { in: intentIds } }, select }),
      this.prisma.relationshipProcess.findMany({ where: { id: { in: processIds } }, select }),
    ]);
    return [...intents, ...processes].map(row => ({ id: row.id, purpose: row.purpose.slice(0, 160),
      context: row.organization?.name ?? (row.person ? [row.person.givenNames, row.person.familyNames].join(' ') : '') }));
  }
}
