import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { AuditAction, DuplicateState, Prisma, ReconciliationOutcome } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PERMISSIONS } from '../auth/authorization/permission';
import { DirectoryActorPolicy } from './directory-actor.policy';
import { DirectoryHistoryService, type DirectoryTarget, type FieldChange } from './directory-history.service';
import { DirectoryService } from './directory.service';
import { DirectoryError } from './directory.errors';
import { DuplicateDetectionService, candidateActors, candidateContract, type CandidateRow } from './duplicate-detection.service';
import { requireUnconsolidated, type DuplicateKind } from './duplicates.rules';
import type { ConsolidateDto } from './duplicates.dto';

const labelSelect = { id: true, name: true, duplicateOfId: true } as const;
const personLabelSelect = { id: true, displayName: true, duplicateOfId: true } as const;
const contactInclude = { contactMethod: { select: { id: true, type: true, value: true, condition: true, version: true, valueVersion: true } } } as const;
const relationInclude = { person: { select: personLabelSelect }, organization: { select: labelSelect } } as const;
const actorVerification = { orderBy: [{ verifiedAt: 'desc' as const }, { id: 'desc' as const }], take: 1,
  select: { id: true, verifiedAt: true, objectVersion: true, actor: { select: { id: true, givenNames: true, familyNames: true } } } };
type ContactRow = Prisma.PersonContactGetPayload<{ include: typeof contactInclude }> | Prisma.OrganizationContactGetPayload<{ include: typeof contactInclude }>;
type RelationRow = Prisma.PersonOrganizationRelationGetPayload<{ include: typeof relationInclude }>;
const contextFields = ['sourceDescription', 'sourceUrl', 'notes'] as const;
const relationFields = ['positionTitle', 'area', 'isCurrent', 'startDate', 'endDate', ...contextFields] as const;
function context(row: ContactRow | RelationRow) { return { sourceDescription: row.sourceDescription, sourceUrl: row.sourceUrl, notes: row.notes }; }
function sameContext(a: ContactRow, b: ContactRow) { return contextFields.every(field => a[field] === b[field]); }
function relationValues(row: RelationRow) {
  return { positionTitle: row.positionTitle, area: row.area, isCurrent: row.isCurrent, startDate: row.startDate, endDate: row.endDate, ...context(row) };
}
function sameEpisode(a: RelationRow, b: RelationRow) {
  return relationFields.every(field => JSON.stringify(a[field]) === JSON.stringify(b[field]));
}
@Injectable()
export class ConsolidationService {
  constructor(private readonly prisma: PrismaService, private readonly detection: DuplicateDetectionService,
    private readonly actors: DirectoryActorPolicy, private readonly directory: DirectoryService,
    private readonly history: DirectoryHistoryService, private readonly audit: AuditService) {}
  private async actor(kind: DuplicateKind, id: string, tx: Prisma.TransactionClient) {
    if (kind === 'organization') {
      const row = await tx.organization.findUniqueOrThrow({ where: { id }, include: {
        parent: { select: labelSelect }, children: { select: labelSelect, orderBy: { id: 'asc' } },
        consolidatedRecords: { select: labelSelect, orderBy: { id: 'asc' } },
        categories: { include: { category: { select: { id: true, name: true, isActive: true } } }, orderBy: { categoryId: 'asc' } },
        contacts: { include: contactInclude, orderBy: { id: 'asc' } },
        personRelations: { include: relationInclude, orderBy: { id: 'asc' } }, verifications: actorVerification,
      } });
      return { ...row, kind, label: row.name, relations: row.personRelations };
    }
    const row = await tx.person.findUniqueOrThrow({ where: { id }, include: {
      consolidatedRecords: { select: personLabelSelect, orderBy: { id: 'asc' } },
      contacts: { include: contactInclude, orderBy: { id: 'asc' } }, relations: { include: relationInclude, orderBy: { id: 'asc' } },
      verifications: actorVerification,
    } });
    return { ...row, kind, label: row.displayName };
  }
  private relationTarget(kind: DuplicateKind, principalId: string, source: RelationRow) {
    return { personId: kind === 'person' ? principalId : source.person.duplicateOfId ?? source.personId,
      organizationId: kind === 'organization' ? principalId : source.organization.duplicateOfId ?? source.organizationId };
  }
  private async buildPreview(row: CandidateRow, principalId: string, tx: Prisma.TransactionClient) {
    const { kind, a, b } = candidateActors(row);
    if (![a.id, b.id].includes(principalId)) throw new DirectoryError('INVALID_CONSOLIDATION_TARGET');
    this.detection.assertCurrent(row);
    const duplicateId = a.id === principalId ? b.id : a.id;
    const principal = await this.actor(kind, principalId, tx), duplicate = await this.actor(kind, duplicateId, tx);
    requireUnconsolidated(principal, kind); requireUnconsolidated(duplicate, kind);
    const blockers: string[] = [];
    if (duplicate.consolidatedRecords.length) blockers.push('INVALID_CONSOLIDATION_TARGET');
    if (principal.kind === 'organization' && duplicate.kind === 'organization') {
      // Conservador: no mover sedes ni colapsar matrices; sus FK históricas quedan intactas.
      if (duplicate.children.length || principal.parentId !== duplicate.parentId) blockers.push('CONSOLIDATION_HIERARCHY_CONFLICT');
      for (const start of [principal, duplicate]) {
        const seen = new Set<string>(); let next = start.parentId;
        while (next) {
          if (seen.has(next) || next === principal.id || next === duplicate.id) { blockers.push('CONSOLIDATION_HIERARCHY_CONFLICT'); break; }
          seen.add(next); next = (await tx.organization.findUniqueOrThrow({ where: { id: next }, select: { parentId: true } })).parentId;
        }
      }
    }
    const contacts = duplicate.contacts.filter(item => item.isActive).map(source => {
      const target = principal.contacts.find(item => item.contactMethodId === source.contactMethodId);
      return { sourceId: source.id, contactMethodId: source.contactMethodId, value: source.contactMethod.value,
        targetId: target?.id ?? null, outcome: !target ? 'CREATED' as const : sameContext(source, target) ? 'REUSED' as const : 'KEPT_PRINCIPAL' as const,
        contextConflict: !!target && !sameContext(source, target), reactivate: !!target && !target.isActive,
        sourceContext: context(source), principalContext: target ? context(target) : null };
    });
    const relations = duplicate.relations.filter(item => item.isCurrent).map(source => {
      const targetActor = this.relationTarget(kind, principalId, source);
      const target = principal.relations.find(item => item.personId === targetActor.personId && item.organizationId === targetActor.organizationId && sameEpisode(source, item));
      return { sourceId: source.id, targetId: target?.id ?? null, outcome: target ? 'REUSED' as const : 'CREATED' as const,
        personId: targetActor.personId, organizationId: targetActor.organizationId, positionTitle: source.positionTitle,
        area: source.area, startDate: source.startDate, sourcePerson: source.person, sourceOrganization: source.organization };
    });
    const categories = principal.kind === 'organization' && duplicate.kind === 'organization'
      ? duplicate.categories.filter(item => !principal.categories.some(kept => kept.categoryId === item.categoryId)).map(item => item.category) : [];
    const verificationSettings = await tx.verificationSettings.findUniqueOrThrow({ where: { id: 1 } });
    const previewToken = createHash('sha256').update(JSON.stringify({ candidateVersion: row.version, principal, duplicate, contacts, relations, categories,
      verificationSettings })).digest('hex');
    return { candidate: candidateContract(row), principal, duplicate, contacts, relations, categories,
      blockers: [...new Set(blockers)], previewToken, verificationSettings,
      effects: ['Se conservan ambas fichas, sus referencias, fuentes, historial y verificaciones.',
        'Se mantienen los campos del principal y se añaden las categorías ausentes.',
        'Los contactos activos se añaden o reutilizan; los existentes inactivos se reactivan con confirmación.',
        'Los conflictos conservan el contexto del principal y la evidencia original en la ficha consolidada.',
        'Los vínculos vigentes se representan explícitamente en el principal; los episodios originales permanecen intactos.',
        'Las asociaciones y vínculos añadidos no heredan verificaciones. El principal requiere nueva revisión.',
        'La ficha consolidada queda disponible para consulta histórica y bloqueada para escrituras ordinarias.'] };
  }
  preview(id: string, principalId: string, actorId: string) {
    return this.prisma.$transaction(async tx => {
      await this.detection.authorize(actorId, PERMISSIONS.DIRECTORY_DUPLICATES_MANAGE, tx);
      return this.buildPreview(await this.detection.candidate(id, tx), principalId, tx);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  private async reconcileContacts(kind: DuplicateKind, candidateId: string, principalId: string, sources: ContactRow[], actorId: string, tx: Prisma.TransactionClient) {
    for (const source of sources.filter(item => item.isActive).sort((a, b) => a.contactMethodId.localeCompare(b.contactMethodId))) {
      await tx.$queryRaw`SELECT id FROM "ContactMethod" WHERE id=${source.contactMethodId}::uuid FOR UPDATE`;
      const where = kind === 'person' ? { personId_contactMethodId: { personId: principalId, contactMethodId: source.contactMethodId } }
        : { organizationId_contactMethodId: { organizationId: principalId, contactMethodId: source.contactMethodId } };
      const existing = kind === 'person' ? await tx.personContact.findUnique({ where: where as Prisma.PersonContactWhereUniqueInput, include: contactInclude })
        : await tx.organizationContact.findUnique({ where: where as Prisma.OrganizationContactWhereUniqueInput, include: contactInclude });
      let target = existing;
      const outcome = !existing ? ReconciliationOutcome.CREATED : sameContext(source, existing) ? ReconciliationOutcome.REUSED : ReconciliationOutcome.KEPT_PRINCIPAL;
      if (!target) {
        target = kind === 'person' ? await tx.personContact.create({ data: { personId: principalId, contactMethodId: source.contactMethodId, ...context(source) }, include: contactInclude })
          : await tx.organizationContact.create({ data: { organizationId: principalId, contactMethodId: source.contactMethodId, ...context(source) }, include: contactInclude });
        const changed: FieldChange[] = [{ field: 'associationCreated', previousValue: null, newValue: source.contactMethodId }];
        for (const field of contextFields) if (source[field] !== null) changed.push({ field, previousValue: null, newValue: source[field] });
        const targetRef: DirectoryTarget = kind === 'person' ? { personContactId: target.id } : { organizationContactId: target.id };
        const operationId = await this.history.record(targetRef, actorId, changed, tx);
        await this.audit.recordDirectory(AuditAction.CONTACT_ASSOCIATION_CREATED, targetRef, actorId, operationId, tx);
        // La versión técnica protege las correcciones compartidas; el valor y su verificación no cambian.
        await tx.contactMethod.update({ where: { id: source.contactMethodId }, data: { version: { increment: 1 } } });
      } else if (!target.isActive) {
        target = kind === 'person' ? await tx.personContact.update({ where: { id: target.id }, data: { isActive: true, version: { increment: 1 } }, include: contactInclude })
          : await tx.organizationContact.update({ where: { id: target.id }, data: { isActive: true, version: { increment: 1 } }, include: contactInclude });
        const targetRef: DirectoryTarget = kind === 'person' ? { personContactId: target.id } : { organizationContactId: target.id };
        const operationId = await this.history.record(targetRef, actorId, [{ field: 'isActive', previousValue: false, newValue: true }], tx);
        await this.audit.recordDirectory(AuditAction.CONTACT_ASSOCIATION_STATUS_CHANGED, targetRef, actorId, operationId, tx);
      }
      await tx.duplicateReconciliation.create({ data: { candidateId, outcome, sourceVersion: source.version, targetVersion: target.version,
        ...(kind === 'person' ? { sourcePersonContactId: source.id, targetPersonContactId: target.id }
          : { sourceOrganizationContactId: source.id, targetOrganizationContactId: target.id }) } });
    }
  }
  private async reconcileRelations(kind: DuplicateKind, candidateId: string, principalId: string, sources: RelationRow[], actorId: string, tx: Prisma.TransactionClient) {
    for (const source of sources.filter(item => item.isCurrent)) {
      const actors = this.relationTarget(kind, principalId, source);
      await this.actors.writable('person', actors.personId, tx); await this.actors.writable('organization', actors.organizationId, tx);
      const possible = await tx.personOrganizationRelation.findMany({ where: { ...actors, isCurrent: true }, include: relationInclude, orderBy: { id: 'asc' } });
      let target = possible.find(item => sameEpisode(source, item));
      const outcome = target ? ReconciliationOutcome.REUSED : ReconciliationOutcome.CREATED;
      if (!target) {
        target = await tx.personOrganizationRelation.create({ data: { ...actors, ...relationValues(source) }, include: relationInclude });
        const changes: FieldChange[] = [{ field: 'relationCreated', previousValue: null, newValue: actors.organizationId }];
        for (const field of relationFields) {
          const value = source[field] instanceof Date ? source[field].toISOString().slice(0, 10) : source[field];
          if (value !== null) changes.push({ field, previousValue: field === 'isCurrent' ? false : null, newValue: value });
        }
        await this.history.record({ personRelationId: target.id }, actorId, changes, tx);
      }
      await tx.duplicateReconciliation.create({ data: { candidateId, sourceRelationId: source.id, targetRelationId: target.id,
        sourceVersion: source.version, targetVersion: target.version, outcome } });
    }
  }
  consolidate(id: string, input: ConsolidateDto, actorId: string) {
    return this.prisma.$transaction(async tx => {
      await this.detection.authorize(actorId, PERMISSIONS.DIRECTORY_DUPLICATES_MANAGE, tx);
      if (!input.confirmed || !input.reconcileCurrentRelations || input.contactConflictPolicy !== 'KEEP_PRINCIPAL_CONTEXT') throw new DirectoryError('CONSOLIDATION_CONFIRMATION_REQUIRED');
      await this.actors.lock(tx, true);
      await this.directory.lockHierarchy(tx);
      const initial = await this.detection.candidate(id, tx), actors = candidateActors(initial);
      // Mismo orden para ambos sentidos de selección del principal.
      for (const actor of [actors.a, actors.b].sort((a, b) => a.id.localeCompare(b.id))) {
        const table = Prisma.raw(actors.kind === 'person' ? '"Person"' : '"Organization"');
        await tx.$queryRaw(Prisma.sql`SELECT id FROM ${table} WHERE id=${actor.id}::uuid FOR UPDATE`);
      }
      await tx.$queryRaw`SELECT id FROM "DuplicateCandidate" WHERE id=${id}::uuid FOR UPDATE`;
      const row = await this.detection.candidate(id, tx); this.detection.assertCurrent(row, input);
      const preview = await this.buildPreview(row, input.principalId, tx);
      if (preview.previewToken !== input.previewToken) throw new DirectoryError('CONSOLIDATION_VERSION_CONFLICT');
      if (preview.blockers.includes('CONSOLIDATION_HIERARCHY_CONFLICT')) throw new DirectoryError('CONSOLIDATION_HIERARCHY_CONFLICT');
      if (preview.blockers.length) throw new DirectoryError('INVALID_CONSOLIDATION_TARGET');
      const { principal, duplicate } = preview, kind = actors.kind, operationId = randomUUID();
      await this.reconcileContacts(kind, id, principal.id, duplicate.contacts, actorId, tx);
      await this.reconcileRelations(kind, id, principal.id, duplicate.relations, actorId, tx);
      const principalChanges: FieldChange[] = [];
      if (principal.kind === 'organization' && duplicate.kind === 'organization') {
        if (preview.categories.length) {
          await tx.organizationCategory.createMany({ data: preview.categories.map(category => ({ organizationId: principal.id, categoryId: category.id })) });
          principalChanges.push({ field: 'categoryIds', previousValue: principal.categories.map(item => item.categoryId).sort(),
            newValue: [...principal.categories.map(item => item.categoryId), ...preview.categories.map(item => item.id)].sort() });
        }
        await tx.organization.update({ where: { id: duplicate.id }, data: { duplicateOfId: principal.id, version: { increment: 1 } } });
        await tx.organization.update({ where: { id: principal.id }, data: { version: { increment: 1 } } });
        principalChanges.push({ field: 'consolidatedOrganizationIds', previousValue: principal.consolidatedRecords.map(item => item.id).sort(),
          newValue: [...principal.consolidatedRecords.map(item => item.id), duplicate.id].sort() });
      } else {
        await tx.person.update({ where: { id: duplicate.id }, data: { duplicateOfId: principal.id, version: { increment: 1 } } });
        await tx.person.update({ where: { id: principal.id }, data: { version: { increment: 1 } } });
        principalChanges.push({ field: 'consolidatedPersonIds', previousValue: principal.consolidatedRecords.map(item => item.id).sort(),
          newValue: [...principal.consolidatedRecords.map(item => item.id), duplicate.id].sort() });
      }
      await this.history.record(kind === 'organization' ? { organizationId: duplicate.id } : { personId: duplicate.id }, actorId,
        [{ field: kind === 'organization' ? 'duplicateOfOrganizationId' : 'duplicateOfPersonId', previousValue: null, newValue: principal.id }], tx,
        { operationId, replacement: { previous: { id: duplicate.id, kind, label: duplicate.label }, next: { id: principal.id, kind, label: principal.label } } });
      await this.history.record(kind === 'organization' ? { organizationId: principal.id } : { personId: principal.id }, actorId, principalChanges, tx,
        { operationId, replacement: { previous: { id: duplicate.id, kind, label: duplicate.label }, next: { id: principal.id, kind, label: principal.label } } });
      await tx.duplicateCandidate.update({ where: { id }, data: { state: DuplicateState.CONSOLIDATED, resolvedByUserId: actorId,
        resolvedAt: new Date(), operationId, version: { increment: 1 }, ...(kind === 'organization' ? { principalOrganizationId: principal.id } : { principalPersonId: principal.id }) } });
      await this.audit.recordConsolidation(actorId, id, kind === 'organization' ? { principalOrganizationId: principal.id, duplicateOrganizationId: duplicate.id }
        : { principalPersonId: principal.id, duplicatePersonId: duplicate.id }, operationId, tx);
      return { candidate: candidateContract(await this.detection.candidate(id, tx)), principalId: principal.id, duplicateId: duplicate.id,
        principalPath: (kind === 'organization' ? 'organizations/' : 'people/') + principal.id, operationId };
    }, { timeout: 30000 });
  }
}
