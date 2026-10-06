import { ForbiddenException, Injectable } from '@nestjs/common';
import { AuditAction, ContactType, ImportedHistoryKind, Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { UsersService } from '../users/users.service';
import { PERMISSIONS } from '../auth/authorization/permission';
import { hasPermission } from '../auth/authorization/role-permissions';
import { AuditService } from '../audit/audit.service';
import { DirectoryActorPolicy } from './directory-actor.policy';
import { DirectoryHistoryService } from './directory-history.service';
import { comparisonText, similarity } from './duplicates.rules';

type Match = { field: string; kind: 'EXACT' | 'POSSIBLE' | 'EMAIL_EXISTS'; targetType: 'ORGANIZATION' | 'PERSON' | 'CONTACT_METHOD'; id: string; label: string; score: number | null };
type JsonRecord = Record<string, string | number | null>;
interface ImportMatchInput { rowNumber: number; status: 'READY' | 'NEEDS_REVIEW' | 'INVALID'; normalizedValues: JsonRecord | null }

@Injectable()
export class DirectoryImportService {
  constructor(private readonly prisma: PrismaService, private readonly users: UsersService, private readonly actors: DirectoryActorPolicy,
    private readonly history: DirectoryHistoryService, private readonly audit: AuditService) {}

  async assertAdministrator(actorId: string, tx: Prisma.TransactionClient) {
    const actor = await this.users.findIdentityById(actorId, tx);
    if (!actor?.isActive || !hasPermission(actor.role, PERMISSIONS.DATA_IMPORT_EXECUTE)) throw new ForbiddenException();
    await this.actors.lock(tx);
    return actor;
  }

  async matches(rows: ImportMatchInput[], tx: Prisma.TransactionClient): Promise<Map<number, Match[]>> {
    const orgNames = [...new Set(rows.flatMap(row => typeof row.normalizedValues?.organizationName === 'string' ? [row.normalizedValues.organizationName]
      : typeof row.normalizedValues?.name === 'string' ? [row.normalizedValues.name] : []))];
    const personNames = [...new Set(rows.flatMap(row => typeof row.normalizedValues?.displayName === 'string' ? [row.normalizedValues.displayName]
      : typeof row.normalizedValues?.personDisplayName === 'string' ? [row.normalizedValues.personDisplayName] : []))];
    const emailValues = [...new Set(rows.flatMap(row => typeof row.normalizedValues?.normalizedValue === 'string' ? [row.normalizedValues.normalizedValue]
      : typeof row.normalizedValues?.email === 'string' ? [row.normalizedValues.email] : []))];
    const [organizations, people, contacts, pendingCandidates] = await Promise.all([
      orgNames.length ? tx.organization.findMany({ where: { duplicateOfId: null, OR: orgNames.map(name => ({ name: { equals: name, mode: 'insensitive' as const } })) },
        select: { id: true, name: true, alias: true, country: true, parentId: true, version: true, duplicateOfId: true } }) : [],
      personNames.length ? tx.person.findMany({ where: { duplicateOfId: null, OR: personNames.map(name => ({ displayName: { equals: name, mode: 'insensitive' as const } })) },
        select: { id: true, displayName: true, givenNames: true, familyNames: true, version: true, duplicateOfId: true } }) : [],
      emailValues.length ? tx.contactMethod.findMany({ where: { type: ContactType.EMAIL, normalizedValue: { in: emailValues } },
        select: { id: true, value: true, normalizedValue: true } }) : [],
      tx.duplicateCandidate.findMany({ where: { state: 'PENDING' }, take: 1000, orderBy: [{ detectedAt: 'desc' }, { id: 'desc' }],
        select: { organizationA: { select: { id: true, name: true, alias: true, country: true, parentId: true, version: true, duplicateOfId: true } },
          organizationB: { select: { id: true, name: true, alias: true, country: true, parentId: true, version: true, duplicateOfId: true } },
          personA: { select: { id: true, displayName: true, givenNames: true, familyNames: true, version: true, duplicateOfId: true } },
          personB: { select: { id: true, displayName: true, givenNames: true, familyNames: true, version: true, duplicateOfId: true } } } }),
    ]);
    const matches = new Map<number, Match[]>();
    for (const row of rows) {
      const values = row.normalizedValues;
      if (!values || row.status === 'INVALID') continue;
      const rowMatches: Match[] = [];
      const orgName = typeof values.organizationName === 'string' ? values.organizationName : typeof values.name === 'string' ? values.name : null;
      if (orgName) {
        for (const existing of organizations.filter(candidate => comparisonText(candidate.name) === comparisonText(orgName))) rowMatches.push({ field: 'organizationName', kind: 'EXACT', targetType: 'ORGANIZATION', id: existing.id, label: existing.name, score: 1 });
        for (const candidate of pendingCandidates.flatMap(item => [item.organizationA, item.organizationB]).filter((actor): actor is NonNullable<typeof actor> => !!actor)) {
          const evaluation = similarity('organization', { ...candidate }, { id: 'import-row', version: 1, duplicateOfId: null, name: orgName });
          if (evaluation.matches && !rowMatches.some(match => match.id === candidate.id)) rowMatches.push({ field: 'organizationName', kind: 'POSSIBLE', targetType: 'ORGANIZATION', id: candidate.id, label: candidate.name, score: evaluation.score });
        }
      }
      const personName = typeof values.personDisplayName === 'string' ? values.personDisplayName : typeof values.displayName === 'string' ? values.displayName : null;
      if (personName) {
        for (const existing of people.filter(candidate => comparisonText(candidate.displayName) === comparisonText(personName))) rowMatches.push({ field: 'personDisplayName', kind: 'EXACT', targetType: 'PERSON', id: existing.id, label: existing.displayName, score: 1 });
        for (const candidate of pendingCandidates.flatMap(item => [item.personA, item.personB]).filter((actor): actor is NonNullable<typeof actor> => !!actor)) {
          const evaluation = similarity('person', { ...candidate }, { id: 'import-row', version: 1, duplicateOfId: null, displayName: personName });
          if (evaluation.matches && !rowMatches.some(match => match.id === candidate.id)) rowMatches.push({ field: 'personDisplayName', kind: 'POSSIBLE', targetType: 'PERSON', id: candidate.id, label: candidate.displayName, score: evaluation.score });
        }
      }
      const email = typeof values.normalizedValue === 'string' ? values.normalizedValue : typeof values.email === 'string' ? values.email : null;
      if (email) for (const existing of contacts.filter(candidate => candidate.normalizedValue === email)) rowMatches.push({ field: 'contactValue', kind: 'EMAIL_EXISTS', targetType: 'CONTACT_METHOD', id: existing.id, label: existing.value, score: 1 });
      matches.set(row.rowNumber, rowMatches.sort((a, b) => a.field.localeCompare(b.field) || b.score! - a.score! || a.id.localeCompare(b.id)));
    }
    return matches;
  }

  async createOrganization(values: JsonRecord, batchId: string, tx: Prisma.TransactionClient) {
    const row = await tx.organization.create({ data: { name: String(values.name), country: values.country as string | null, alias: values.alias as string | null,
      description: values.description as string | null, officialWebsite: values.officialWebsite as string | null, dataImportBatchId: batchId } });
    return row.id;
  }

  async createPerson(values: JsonRecord, batchId: string, tx: Prisma.TransactionClient) {
    const row = await tx.person.create({ data: { displayName: String(values.displayName), givenNames: values.givenNames as string | null,
      familyNames: values.familyNames as string | null, dataImportBatchId: batchId } });
    return row.id;
  }

  async createHistory(values: JsonRecord, batchId: string, rowNumber: number, organizationId: string | null, personId: string | null, tx: Prisma.TransactionClient) {
    return tx.importedHistoricalRecord.create({ data: { batchId, rowNumber, kind: values.kind as ImportedHistoryKind,
      occurredOn: values.occurredOn ? new Date(String(values.occurredOn) + 'T00:00:00.000Z') : null, email: values.email as string | null,
      subject: values.subject as string | null, body: values.body as string | null, originalObservation: values.originalObservation as string | null,
      organizationId, personId } });
  }

  async recordBatchApplied(batchId: string, actorId: string, tx: Prisma.TransactionClient) {
    return this.audit.recordDataImport(batchId, actorId, tx);
  }
  async recordBatchFailed(batchId: string, actorId: string, tx: Prisma.TransactionClient) {
    return this.audit.recordDataImportFailure(batchId, actorId, tx);
  }

  async createImportedContact(values: JsonRecord, batchId: string, rowNumber: number, actorId: string, association: { organizationId?: string; personId?: string }, tx: Prisma.TransactionClient) {
    await this.assertAdministrator(actorId, tx);
    const email = String(values.normalizedValue);
    let method = await tx.contactMethod.findFirst({ where: { type: values.type as ContactType, ...(values.type === ContactType.EMAIL ? { normalizedValue: email } : { value: String(values.value) }) } });
    if (!method) method = await tx.contactMethod.create({ data: { type: values.type as ContactType, value: String(values.value), normalizedValue: values.normalizedValue as string | null,
      label: values.label as string | null, dataImportBatchId: batchId } });
    if (association.personId) {
      const existing = await tx.personContact.findUnique({ where: { personId_contactMethodId: { personId: association.personId, contactMethodId: method.id } } });
      if (existing) return { contactMethodId: method.id, personContactId: existing.id, organizationContactId: null };
      const created = await tx.personContact.create({ data: { personId: association.personId, contactMethodId: method.id, notes: values.notes as string | null, dataImportBatchId: batchId } });
      const operationId = await this.history.record({ personContactId: created.id }, actorId,
        [{ field: 'associationCreated', previousValue: null, newValue: method.id }], tx);
      await this.audit.recordDirectory(AuditAction.CONTACT_ASSOCIATION_CREATED, { personContactId: created.id }, actorId, operationId, tx);
      return { contactMethodId: method.id, personContactId: created.id, organizationContactId: null };
    }
    const organizationId = association.organizationId!;
    const existing = await tx.organizationContact.findUnique({ where: { organizationId_contactMethodId: { organizationId, contactMethodId: method.id } } });
    if (existing) return { contactMethodId: method.id, personContactId: null, organizationContactId: existing.id };
    const created = await tx.organizationContact.create({ data: { organizationId, contactMethodId: method.id, notes: values.notes as string | null, dataImportBatchId: batchId } });
    const operationId = await this.history.record({ organizationContactId: created.id }, actorId,
      [{ field: 'associationCreated', previousValue: null, newValue: method.id }], tx);
    await this.audit.recordDirectory(AuditAction.CONTACT_ASSOCIATION_CREATED, { organizationContactId: created.id }, actorId, operationId, tx);
    return { contactMethodId: method.id, personContactId: null, organizationContactId: created.id };
  }

  async resolveExactOrganization(name: string, tx: Prisma.TransactionClient) {
    return tx.organization.findFirst({ where: { name: { equals: name, mode: 'insensitive' }, duplicateOfId: null }, select: { id: true } });
  }
  async resolveExactPerson(name: string, tx: Prisma.TransactionClient) {
    return tx.person.findFirst({ where: { displayName: { equals: name, mode: 'insensitive' }, duplicateOfId: null }, select: { id: true } });
  }
  isExactRowMatch(matches: Match[], field: string) { return matches.filter(match => match.field === field && match.kind === 'EXACT'); }
  async lockImport(tx: Prisma.TransactionClient, id: string) { await tx.$queryRaw`SELECT id FROM "DataImportBatch" WHERE id=${id}::uuid FOR UPDATE`; }
}
