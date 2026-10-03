import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { DirectoryError } from './directory.errors';
import { requireUnconsolidated, type DuplicateKind } from './duplicates.rules';

@Injectable()
export class DirectoryActorPolicy {
  // Antes de jerarquía → actores → medios → asociaciones. Las escrituras ordinarias
  // comparten el lock; solo detección/resolución/consolidación requieren exclusión.
  async lock(tx: Prisma.TransactionClient, exclusive = false): Promise<void> {
    if (exclusive) await tx.$queryRaw`SELECT pg_advisory_xact_lock(1128612692, 2)::text`;
    else await tx.$queryRaw`SELECT pg_advisory_xact_lock_shared(1128612692, 2)::text`;
  }
  async writable(kind: DuplicateKind, id: string, tx: Prisma.TransactionClient): Promise<void> {
    const actor = kind === 'organization' ? await tx.organization.findUnique({ where: { id }, select: { id: true, version: true, duplicateOfId: true } })
      : await tx.person.findUnique({ where: { id }, select: { id: true, version: true, duplicateOfId: true } });
    if (!actor) throw new DirectoryError(kind === 'organization' ? 'ORGANIZATION_NOT_FOUND' : 'PERSON_NOT_FOUND');
    requireUnconsolidated(actor, kind);
  }
}
