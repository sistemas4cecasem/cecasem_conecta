import { Injectable } from '@nestjs/common';
import { DuplicateState, Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { UsersService } from '../users/users.service';
import { hasPermission } from '../auth/authorization/role-permissions';
import { PERMISSIONS, type Permission } from '../auth/authorization/permission';
import { DirectoryActorPolicy } from './directory-actor.policy';
import { DirectoryError } from './directory.errors';
import { canonicalPair, identityFingerprint, similarity, type DuplicateKind } from './duplicates.rules';
import type { PageQueryDto } from './directory.dto';
import type { DuplicateDecisionDto } from './duplicates.dto';

export const duplicateOrganizationSelect = { id: true, name: true, alias: true, country: true, parentId: true,
  version: true, duplicateOfId: true, isActive: true, lastVerifiedAt: true,
  parent: { select: { id: true, name: true } } } satisfies Prisma.OrganizationSelect;
export const duplicatePersonSelect = { id: true, displayName: true, givenNames: true, familyNames: true,
  version: true, duplicateOfId: true, isActive: true, lastVerifiedAt: true } satisfies Prisma.PersonSelect;
const candidateInclude = { organizationA: { select: duplicateOrganizationSelect }, organizationB: { select: duplicateOrganizationSelect },
  personA: { select: duplicatePersonSelect }, personB: { select: duplicatePersonSelect },
  resolvedBy: { select: { id: true, givenNames: true, familyNames: true, isActive: true } } } as const;
export type CandidateRow = Prisma.DuplicateCandidateGetPayload<{ include: typeof candidateInclude }>;
export function candidateActors(row: CandidateRow) {
  if (row.organizationA && row.organizationB) return { kind: 'organization' as const, a: row.organizationA, b: row.organizationB };
  if (row.personA && row.personB) return { kind: 'person' as const, a: row.personA, b: row.personB };
  throw new Error('Candidato sin pareja íntegra.');
}
export function candidateContract(row: CandidateRow) {
  const { kind, a, b } = candidateActors(row);
  return { id: row.id, kind, a, b, score: row.score, signals: row.signals, state: row.state, version: row.version,
    examinedVersionA: row.examinedVersionA, examinedVersionB: row.examinedVersionB, detectedAt: row.detectedAt,
    stale: a.version !== row.examinedVersionA || b.version !== row.examinedVersionB || !!a.duplicateOfId || !!b.duplicateOfId,
    resolvedAt: row.resolvedAt, resolvedBy: row.resolvedBy, principalId: row.principalOrganizationId ?? row.principalPersonId };
}
@Injectable()
export class DuplicateDetectionService {
  constructor(private readonly prisma: PrismaService, private readonly users: UsersService, private readonly actors: DirectoryActorPolicy) {}
  async authorize(actorId: string, permission: Permission, tx: Prisma.TransactionClient) {
    const actor = await this.users.findIdentityById(actorId, tx);
    if (!actor?.isActive || !hasPermission(actor.role, permission)) throw new DirectoryError('FORBIDDEN');
  }
  async candidate(id: string, tx: Prisma.TransactionClient = this.prisma): Promise<CandidateRow> {
    const row = await tx.duplicateCandidate.findUnique({ where: { id }, include: candidateInclude });
    if (!row) throw new DirectoryError('DUPLICATE_CANDIDATE_NOT_FOUND');
    return row;
  }
  assertCurrent(row: CandidateRow, input?: DuplicateDecisionDto): void {
    const { a, b } = candidateActors(row);
    if (a.duplicateOfId || b.duplicateOfId) throw new DirectoryError('ACTOR_ALREADY_CONSOLIDATED', {
      principalId: a.duplicateOfId ?? b.duplicateOfId!, principalPath: (row.organizationAId ? 'organizations/' : 'people/') + (a.duplicateOfId ?? b.duplicateOfId),
    });
    if (row.examinedVersionA !== a.version || row.examinedVersionB !== b.version) throw new DirectoryError('DUPLICATE_CANDIDATE_STALE');
    if (input && (input.expectedCandidateVersion !== row.version || input.expectedVersionA !== a.version || input.expectedVersionB !== b.version)) throw new DirectoryError('CONSOLIDATION_VERSION_CONFLICT');
    if (row.state !== DuplicateState.PENDING) throw new DirectoryError('INVALID_CONSOLIDATION_TARGET');
  }
  async listPending(query: PageQueryDto) {
    return this.prisma.$transaction(async tx => {
      const where = { state: DuplicateState.PENDING };
      const [rows, total] = await Promise.all([tx.duplicateCandidate.findMany({ where, include: candidateInclude,
        orderBy: [{ detectedAt: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }), tx.duplicateCandidate.count({ where })]);
      return { items: rows.map(candidateContract), total, page: query.page, pageSize: query.pageSize };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  async listActor(kind: DuplicateKind, id: string, query: PageQueryDto, actorId: string) {
    return this.prisma.$transaction(async tx => {
      await this.authorize(actorId, PERMISSIONS.DIRECTORY_READ, tx); await this.actors.lock(tx, true);
      const current = kind === 'organization' ? await tx.organization.findUnique({ where: { id }, select: duplicateOrganizationSelect })
        : await tx.person.findUnique({ where: { id }, select: duplicatePersonSelect });
      if (!current) throw new DirectoryError(kind === 'organization' ? 'ORGANIZATION_NOT_FOUND' : 'PERSON_NOT_FOUND');
      // Consulta explícita: escaneo por cursor de 200 fichas, sin descartar candidatos
      // por país, actividad o verificación. Nunca modifica los nombres originales.
      if (!current.duplicateOfId) {
        let cursor: string | undefined;
        for (;;) {
          const page = kind === 'organization' ? await tx.organization.findMany({ where: { duplicateOfId: null, id: { not: id, ...(cursor ? { gt: cursor } : {}) } },
            select: duplicateOrganizationSelect, orderBy: { id: 'asc' }, take: 200 })
            : await tx.person.findMany({ where: { duplicateOfId: null, id: { not: id, ...(cursor ? { gt: cursor } : {}) } },
              select: duplicatePersonSelect, orderBy: { id: 'asc' }, take: 200 });
          for (const other of page) {
            const [a, b] = canonicalPair(current, other), evaluation = similarity(kind, a, b);
            if (!evaluation.matches) continue;
            const pair = kind === 'organization' ? { organizationAId: a.id, organizationBId: b.id } : { personAId: a.id, personBId: b.id };
            const identityA = identityFingerprint(kind, a), identityB = identityFingerprint(kind, b);
            const existing = await tx.duplicateCandidate.findFirst({ where: { ...pair, identityA, identityB } });
            if (!existing) await tx.duplicateCandidate.create({ data: { ...pair, identityA, identityB, examinedVersionA: a.version,
              examinedVersionB: b.version, score: evaluation.score, signals: evaluation.signals } });
            else if (existing.state === DuplicateState.PENDING && (existing.examinedVersionA !== a.version || existing.examinedVersionB !== b.version)) {
              await tx.duplicateCandidate.update({ where: { id: existing.id }, data: { examinedVersionA: a.version,
                examinedVersionB: b.version, score: evaluation.score, signals: evaluation.signals, version: { increment: 1 } } });
            }
          }
          if (page.length < 200) break;
          cursor = page.at(-1)!.id;
        }
      }
      const where: Prisma.DuplicateCandidateWhereInput = kind === 'organization' ? { OR: [{ organizationAId: id }, { organizationBId: id }] }
        : { OR: [{ personAId: id }, { personBId: id }] };
      const [rows, total] = await Promise.all([tx.duplicateCandidate.findMany({ where, include: candidateInclude, orderBy: [{ detectedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize, take: query.pageSize }), tx.duplicateCandidate.count({ where })]);
      return { items: rows.map(candidateContract), total, page: query.page, pageSize: query.pageSize };
    }, { timeout: 30000 });
  }
  dismiss(id: string, input: DuplicateDecisionDto, actorId: string) {
    return this.prisma.$transaction(async tx => {
      await this.authorize(actorId, PERMISSIONS.DIRECTORY_DUPLICATES_DISMISS, tx); await this.actors.lock(tx, true);
      await tx.$queryRaw`SELECT id FROM "DuplicateCandidate" WHERE id=${id}::uuid FOR UPDATE`;
      const row = await this.candidate(id, tx);
      // Repetir exactamente la decisión no cambia autor, fecha ni versión.
      if (row.state === DuplicateState.NOT_DUPLICATE && input.expectedCandidateVersion === row.version - 1
        && input.expectedVersionA === row.examinedVersionA && input.expectedVersionB === row.examinedVersionB) return candidateContract(row);
      this.assertCurrent(row, input);
      await tx.duplicateCandidate.update({ where: { id }, data: { state: DuplicateState.NOT_DUPLICATE, resolvedByUserId: actorId,
        resolvedAt: new Date(), version: { increment: 1 } } });
      return candidateContract(await this.candidate(id, tx));
    });
  }
}
