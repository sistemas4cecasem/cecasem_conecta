import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { PageQueryDto } from './directory.dto';
import { changeContract, historyObjectTypes, readHistorySnapshot, referenceIds, type HistoryReference, type HistoryReplacement, type HistoryValue } from './directory-history.contract';
export type { HistoryValue } from './directory-history.contract';
export interface FieldChange { field: string; previousValue: HistoryValue; newValue: HistoryValue }
export type DirectoryTarget = { organizationId: string } | { categoryId: string } | { personId: string } | { personRelationId: string } | { contactMethodId: string } | { personContactId: string } | { organizationContactId: string };
export interface HistoryRecordOptions { operationId: string; replacement: HistoryReplacement }
@Injectable()
export class DirectoryHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  private async related(target: DirectoryTarget, tx: Prisma.TransactionClient): Promise<HistoryReference[]> {
    if ('personRelationId' in target) {
      const row = await tx.personOrganizationRelation.findUniqueOrThrow({ where: { id: target.personRelationId },
        select: { person: { select: { id: true, displayName: true } }, organization: { select: { id: true, name: true } } } });
      return [{ id: row.person.id, kind: 'person', label: row.person.displayName }, { id: row.organization.id, kind: 'organization', label: row.organization.name }];
    }
    const medium = { select: { id: true, value: true } };
    if ('personContactId' in target) {
      const row = await tx.personContact.findUniqueOrThrow({ where: { id: target.personContactId },
        select: { person: { select: { id: true, displayName: true } }, contactMethod: medium } });
      return [{ id: row.person.id, kind: 'person', label: row.person.displayName }, { id: row.contactMethod.id, kind: 'contactMethod', label: row.contactMethod.value }];
    }
    if ('organizationContactId' in target) {
      const row = await tx.organizationContact.findUniqueOrThrow({ where: { id: target.organizationContactId },
        select: { organization: { select: { id: true, name: true } }, contactMethod: medium } });
      return [{ id: row.organization.id, kind: 'organization', label: row.organization.name }, { id: row.contactMethod.id, kind: 'contactMethod', label: row.contactMethod.value }];
    }
    return [];
  }
  async record(target: DirectoryTarget, actorUserId: string,
    changes: FieldChange[], tx: Prisma.TransactionClient, options?: HistoryRecordOptions): Promise<string> {
    const operationId = options?.operationId ?? randomUUID();
    const effective = changes.filter(change => JSON.stringify(change.previousValue) !== JSON.stringify(change.newValue));
    if (!effective.length) return operationId;
    const related = await this.related(target, tx);
    const ids = (kind: HistoryReference['kind']) => [...new Set(effective.flatMap(change => [change.previousValue, change.newValue]
      .flatMap(value => { const ref = referenceIds(change.field, value); return ref?.kind === kind ? ref.ids : []; })))].sort();
    const categoryIds = ids('category'), organizationIds = ids('organization'), contactIds = ids('contactMethod');
    const [categories, organizations, contacts] = await Promise.all([
      categoryIds.length ? tx.category.findMany({ where: { id: { in: categoryIds } }, select: { id: true, name: true } }) : [],
      organizationIds.length ? tx.organization.findMany({ where: { id: { in: organizationIds } }, select: { id: true, name: true } }) : [],
      contactIds.length ? tx.contactMethod.findMany({ where: { id: { in: contactIds } }, select: { id: true, value: true } }) : [],
    ]);
    const labels = new Map([...categories, ...organizations, ...contacts.map(row => ({ id: row.id, name: row.value }))].map(row => [row.id, row.name]));
    const refs = (field: string, value: HistoryValue): HistoryReference[] => {
      const referenced = referenceIds(field, value);
      return referenced?.ids.map(id => ({ id, kind: referenced.kind, label: labels.get(id) ?? null })) ?? [];
    };
    await tx.directoryChange.createMany({ data: effective.map(change => ({ ...target, actorUserId, operationId,
      field: change.field, previousValue: change.previousValue === null ? Prisma.JsonNull : change.previousValue,
      newValue: change.newValue === null ? Prisma.JsonNull : change.newValue,
      referenceSnapshot: { previous: refs(change.field, change.previousValue).map(ref => ({ ...ref })),
        next: refs(change.field, change.newValue).map(ref => ({ ...ref })), related: related.map(ref => ({ ...ref })),
        replacement: options ? { previous: { ...options.replacement.previous }, next: { ...options.replacement.next } } : null } })) });
    return operationId;
  }

  async list(target: DirectoryTarget, query: PageQueryDto) {
    const entry = Object.entries(historyObjectTypes).find(([key]) => key in target);
    if (!entry) throw new Error('Objetivo de historial inválido.');
    const [key, objectType] = entry;
    const id = Object.values(target)[0];
    // El identificador SQL procede exclusivamente de la lista cerrada anterior, nunca de un DTO.
    const predicate = Prisma.sql`${Prisma.raw('"' + key + '"')} = ${id}::uuid`;
    return this.prisma.$transaction(async tx => {
      const [operations, count] = await Promise.all([
        tx.$queryRaw<{ operationId: string; createdAt: Date }[]>(Prisma.sql`SELECT "operationId", min("createdAt") AS "createdAt"
          FROM "DirectoryChange" WHERE ${predicate} GROUP BY "operationId"
          ORDER BY min("createdAt") DESC, "operationId" DESC LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`),
        tx.$queryRaw<{ total: bigint }[]>(Prisma.sql`SELECT count(DISTINCT "operationId") AS total FROM "DirectoryChange" WHERE ${predicate}`),
      ]);
      const rows = operations.length ? await tx.directoryChange.findMany({ where: { ...target, operationId: { in: operations.map(op => op.operationId) } },
        select: { operationId: true, field: true, previousValue: true, newValue: true, referenceSnapshot: true,
          actor: { select: { id: true, givenNames: true, familyNames: true, isActive: true } } }, orderBy: [{ field: 'asc' }, { id: 'asc' }] }) : [];
      const items = operations.map(operation => {
        const changes = rows.filter(row => row.operationId === operation.operationId);
        const snapshot = readHistorySnapshot(changes[0].referenceSnapshot);
        return { ...operation, objectType, actor: changes[0].actor, relatedReferences: snapshot?.related ?? [], contextRecorded: snapshot !== null, replacement: snapshot?.replacement ?? null,
          changes: changes.map(changeContract) };
      });
      return { items, total: Number(count[0].total), page: query.page, pageSize: query.pageSize };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
}
