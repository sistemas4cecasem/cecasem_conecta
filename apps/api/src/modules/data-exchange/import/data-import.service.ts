import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DataImportBatchStatus, DataImportRecordKind, DataImportRowStatus, Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { UsersService } from '../../users/users.service';
import { PERMISSIONS } from '../../auth/authorization/permission';
import { hasPermission } from '../../auth/authorization/role-permissions';
import { DirectoryImportService } from '../../directory/directory-import.service';
import { DataImportError } from './import.errors';
import { normalizeImportRow, validateColumnMapping, type ImportColumnMapping, type NormalizedImportRow } from './import-mapping';
import { ImportDecisionDto, ImportPreviewRequestDto, ImportRowsQueryDto } from './import.dto';
import { inspectXlsx, readXlsxSheet } from './xlsx-inspector';

type Upload = { originalname: string; mimetype: string; buffer: Buffer };
type Match = { field: string; kind: 'EXACT' | 'POSSIBLE' | 'EMAIL_EXISTS'; targetType: 'ORGANIZATION' | 'PERSON' | 'CONTACT_METHOD'; id: string; label: string; score: number | null };
type JsonRecord = Record<string, string | number | null>;

@Injectable()
export class DataImportService {
  constructor(private readonly prisma: PrismaService, private readonly users: UsersService, private readonly directory: DirectoryImportService) {}

  private async authorize(actorId: string, tx?: Prisma.TransactionClient) {
    const actor = await this.users.findIdentityById(actorId, tx);
    if (!actor?.isActive || !hasPermission(actor.role, PERMISSIONS.DATA_IMPORT_EXECUTE)) throw new ForbiddenException();
  }

  async inspect(file: Upload | undefined, actorId: string) {
    await this.authorize(actorId);
    if (!file) throw new DataImportError('INVALID_UPLOAD', 'Adjunta un archivo XLSX para inspeccionar.');
    return inspectXlsx(file.originalname, file.mimetype, file.buffer);
  }

  async preview(file: Upload | undefined, input: ImportPreviewRequestDto, actorId: string) {
    if (!file) throw new DataImportError('INVALID_UPLOAD', 'Adjunta un archivo XLSX para analizar.');
    let mapping: ImportColumnMapping;
    try { mapping = JSON.parse(input.columnMapping) as ImportColumnMapping; }
    catch { throw new DataImportError('INVALID_UPLOAD', 'La asignación de columnas no tiene un formato JSON válido.'); }
    return this.prisma.$transaction(async tx => {
      await this.directory.assertAdministrator(actorId, tx);
      const table = await readXlsxSheet(file.originalname, file.mimetype, file.buffer, input.worksheetName, input.headerRow);
      const validated = validateColumnMapping(input.recordKind, table.headers, mapping);
      const rows = table.rows.map(row => normalizeImportRow(input.recordKind, row, table.headers, validated.mapped));
      this.markRepeatedRows(rows, input.recordKind);
      for (const row of rows) if (validated.unknownHeaders.length && row.status !== 'INVALID') {
        row.warnings.push({ field: null, message: `Columnas sin asignar: ${validated.unknownHeaders.slice(0, 10).join(', ')}${validated.unknownHeaders.length > 10 ? '…' : ''}.`, value: null });
        row.status = 'NEEDS_REVIEW';
      }
      const matchingRows = rows.filter(row => row.normalizedValues);
      const matches = await this.directory.matches(matchingRows, tx);
      for (const row of rows) {
        row.matches = matches.get(row.rowNumber) ?? [];
        const ambiguousExact = new Set(row.matches.filter(match => match.kind === 'EXACT').map(match => match.field)).size < row.matches.filter(match => match.kind === 'EXACT').length;
        if ((row.matches.some(match => match.kind === 'POSSIBLE') || ambiguousExact) && row.status !== 'INVALID') {
          row.status = 'NEEDS_REVIEW';
          if (ambiguousExact) row.warnings.push({ field: null, message: 'Hay más de una coincidencia exacta para un campo; selecciona cuál vincular o crea una ficha separada.', value: null });
        }
      }
      const counts = { analyzedRows: rows.length, readyRows: rows.filter(row => row.status === 'READY').length,
        reviewRows: rows.filter(row => row.status === 'NEEDS_REVIEW').length, invalidRows: rows.filter(row => row.status === 'INVALID').length };
      const batch = await tx.dataImportBatch.create({ data: { originalFilename: file.originalname, sha256: createHash('sha256').update(file.buffer).digest('hex'),
        worksheetName: input.worksheetName, headerRow: input.headerRow, recordKind: input.recordKind,
        columnMapping: { fields: validated.mapped, unmappedHeaders: validated.unknownHeaders }, status: DataImportBatchStatus.ANALYZED,
        ...counts, importedRows: 0, initiatedByUserId: actorId,
        rows: { create: rows.map(row => ({ rowNumber: row.rowNumber, status: row.status,
          sourceValues: row.sourceValues,
          normalizedValues: row.normalizedValues === null ? Prisma.DbNull : row.normalizedValues as Prisma.InputJsonValue,
          errors: row.errors as unknown as Prisma.InputJsonValue, warnings: row.warnings as unknown as Prisma.InputJsonValue, matches: row.matches })) } },
        select: { id: true, originalFilename: true, worksheetName: true, recordKind: true, status: true, createdAt: true,
          analyzedRows: true, readyRows: true, reviewRows: true, invalidRows: true, importedRows: true } });
      return { ...batch, rows: rows.map(row => ({ ...row, sourceValues: row.sourceValues })) };
    }, { timeout: 30000 });
  }

  private markRepeatedRows(rows: NormalizedImportRow[], kind: DataImportRecordKind) {
    if (kind === DataImportRecordKind.CONTACT || kind === DataImportRecordKind.HISTORICAL_RECORD) return;
    const field = kind === DataImportRecordKind.ORGANIZATION ? 'name' : kind === DataImportRecordKind.PERSON ? 'displayName'
      : kind === DataImportRecordKind.CONTACT ? 'normalizedValue' : 'email';
    const firstRow = new Map<string, number>();
    for (const row of rows) {
      const value = row.normalizedValues?.[field];
      if (typeof value !== 'string' || !value.trim()) continue;
      const key = value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/gu, ' ').trim();
      const previous = firstRow.get(key);
      if (previous !== undefined) {
        row.status = 'INVALID'; row.normalizedValues = null;
        row.errors.push({ field, message: `La fila repite el mismo valor de la fila ${previous}; corrige o elimina la repetición en el Excel.`, value });
      } else firstRow.set(key, row.rowNumber);
    }
  }

  async getBatch(id: string, actorId: string, query: ImportRowsQueryDto) {
    await this.authorize(actorId);
    const batch = await this.prisma.dataImportBatch.findUnique({ where: { id }, select: { id: true, originalFilename: true, sha256: true, worksheetName: true,
      recordKind: true, status: true, createdAt: true, confirmedAt: true, analyzedRows: true, readyRows: true, reviewRows: true, invalidRows: true,
      importedRows: true, failureCode: true, initiatedByUserId: true,
      rows: { orderBy: { rowNumber: 'asc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize,
        select: { rowNumber: true, status: true, sourceValues: true, normalizedValues: true, errors: true, warnings: true, matches: true,
          organizationId: true, personId: true, contactMethodId: true, personContactId: true, organizationContactId: true, historicalRecordId: true } } } });
    if (!batch) throw new DataImportError('BATCH_NOT_FOUND');
    return { ...batch, rows: batch.rows, page: query.page, pageSize: query.pageSize };
  }

  async confirm(id: string, decisions: ImportDecisionDto[], actorId: string) {
    try {
      return await this.prisma.$transaction(async tx => {
        await this.directory.assertAdministrator(actorId, tx);
        await this.directory.lockImport(tx, id);
        const batch = await tx.dataImportBatch.findUnique({ where: { id }, include: { rows: { orderBy: { rowNumber: 'asc' } } } });
        if (!batch) throw new DataImportError('BATCH_NOT_FOUND');
        if (batch.status === DataImportBatchStatus.IMPORTED) throw new DataImportError('BATCH_ALREADY_IMPORTED');
        if (batch.status !== DataImportBatchStatus.ANALYZED) throw new DataImportError('BATCH_NOT_APPLICABLE');
        const applicable = batch.rows.filter(row => row.status !== DataImportRowStatus.INVALID);
        if (!applicable.length) throw new DataImportError('BATCH_NOT_APPLICABLE');
        const resolvedCreatedActors = new Map<string, string>();
        const normalizedRows: NormalizedImportRow[] = applicable.map(row => ({ rowNumber: row.rowNumber, status: row.status === DataImportRowStatus.READY ? 'READY' : 'NEEDS_REVIEW',
          sourceValues: row.sourceValues as Record<string, string | number | boolean | null>, normalizedValues: row.normalizedValues as unknown as NormalizedImportRow['normalizedValues'],
          errors: row.errors as never, warnings: row.warnings as never, matches: row.matches as Match[] }));
        const refreshed = await this.directory.matches(normalizedRows, tx);
        const existingDecisions = new Map(decisions.map(decision => [`${decision.rowNumber}:${decision.field}`, decision]));
        if (existingDecisions.size !== decisions.length) throw new DataImportError('ROW_ERRORS', 'Hay decisiones repetidas para una misma fila y campo.');
        let importedCount = 0;
        for (const row of applicable) {
          const values = row.normalizedValues as JsonRecord | null;
          if (!values) continue;
          const rowMatches = refreshed.get(row.rowNumber) ?? [];
          const storedMatches = row.matches as Match[];
          const rowDecisions = decisions.filter(decision => decision.rowNumber === row.rowNumber);
          const decisionFields = new Set([...rowMatches.filter(candidate => candidate.kind === 'POSSIBLE').map(match => match.field),
            ...[...new Set(rowMatches.filter(candidate => candidate.kind === 'EXACT').map(match => match.field))].filter(field => rowMatches.filter(match => match.field === field && match.kind === 'EXACT').length > 1)]);
          for (const field of decisionFields) {
            const decision = existingDecisions.get(`${row.rowNumber}:${field}`);
            if (!decision) throw new DataImportError('ROW_ERRORS');
            if (decision.decision === 'LINK_EXISTING' && (!decision.targetId || !rowMatches.some(candidate => candidate.field === field && candidate.id === decision.targetId))) {
              throw new DataImportError('ROW_ERRORS', `La fila ${row.rowNumber} intenta vincular un candidato que ya no coincide; vuelve a analizar el libro.`);
            }
            if (decision.decision === 'CREATE_NEW' && decision.targetId) throw new DataImportError('ROW_ERRORS');
          }
          for (const decision of rowDecisions) {
            if (!decisionFields.has(decision.field)) throw new DataImportError('ROW_ERRORS', `La coincidencia de la fila ${row.rowNumber} cambió; vuelve a analizar el libro.`);
          }
          void storedMatches;
          const resolution = await this.applyRow(batch.recordKind, values, batch.id, row.rowNumber, rowMatches, rowDecisions, actorId, tx, resolvedCreatedActors);
          await tx.dataImportRow.update({ where: { id: row.id }, data: { status: DataImportRowStatus.IMPORTED, ...resolution } });
          importedCount++;
        }
        const confirmedAt = new Date();
        await tx.dataImportBatch.update({ where: { id }, data: { status: DataImportBatchStatus.IMPORTED, confirmedAt, importedRows: importedCount } });
        await this.directory.recordBatchApplied(batch.id, actorId, tx);
        return { id: batch.id, status: DataImportBatchStatus.IMPORTED, confirmedAt, analyzedRows: batch.analyzedRows,
          importedRows: importedCount, invalidRows: batch.invalidRows, reviewRows: batch.reviewRows };
      }, { timeout: 30000, maxWait: 10000 });
    } catch (error) {
      if (!(error instanceof DataImportError) && !(error instanceof ForbiddenException) && !(error instanceof BadRequestException)) {
        await this.prisma.$transaction(async tx => {
          const failed = await tx.dataImportBatch.updateMany({ where: { id, status: DataImportBatchStatus.ANALYZED }, data: { status: DataImportBatchStatus.FAILED, failureCode: 'APPLY_FAILED' } });
          if (failed.count) await this.directory.recordBatchFailed(id, actorId, tx);
        });
      }
      throw error;
    }
  }

  private async applyRow(kind: DataImportRecordKind, values: JsonRecord, batchId: string, rowNumber: number, matches: Match[], decisions: ImportDecisionDto[], actorId: string, tx: Prisma.TransactionClient, resolvedCreatedActors: Map<string, string>) {
    const references: { organizationId?: string; personId?: string; contactMethodId?: string; personContactId?: string; organizationContactId?: string; historicalRecordId?: string } = {};
    const resolve = async (field: 'organizationName' | 'personDisplayName', value: string | null, targetType: 'ORGANIZATION' | 'PERSON'): Promise<string | null> => {
      if (!value) return null;
      const exact = matches.filter(match => match.field === field && match.kind === 'EXACT' && match.targetType === targetType);
      const decision = decisions.find(row => row.field === field);
      const cacheKey = `${targetType}:${value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase()}`;
      const actorValues = targetType === 'ORGANIZATION'
        ? kind === DataImportRecordKind.ORGANIZATION ? values : { name: value }
        : kind === DataImportRecordKind.PERSON ? values : { displayName: value };
      if (decision?.decision === 'LINK_EXISTING') {
        if (!decision.targetId || !matches.some(match => match.field === field && match.targetType === targetType && match.id === decision.targetId)) throw new DataImportError('ROW_ERRORS');
        return decision.targetId;
      }
      if (decision?.decision === 'CREATE_NEW') {
        const id = targetType === 'ORGANIZATION' ? await this.directory.createOrganization(actorValues, batchId, tx) : await this.directory.createPerson(actorValues, batchId, tx);
        resolvedCreatedActors.set(cacheKey, id);
        return id;
      }
      if (exact.length > 1) throw new DataImportError('ROW_ERRORS', `La fila ${rowNumber} tiene varias coincidencias exactas; selecciona una antes de confirmar.`);
      if (exact.length === 1) return exact[0].id;
      const cached = resolvedCreatedActors.get(cacheKey);
      if (cached) return cached;
      const id = targetType === 'ORGANIZATION' ? await this.directory.createOrganization(actorValues, batchId, tx) : await this.directory.createPerson(actorValues, batchId, tx);
      resolvedCreatedActors.set(cacheKey, id);
      return id;
    };
    if (kind === DataImportRecordKind.ORGANIZATION) references.organizationId = await resolve('organizationName', String(values.name), 'ORGANIZATION') ?? undefined;
    else if (kind === DataImportRecordKind.PERSON) references.personId = await resolve('personDisplayName', String(values.displayName), 'PERSON') ?? undefined;
    else if (kind === DataImportRecordKind.CONTACT) {
      const organizationId = await resolve('organizationName', values.organizationName as string | null, 'ORGANIZATION');
      const personId = await resolve('personDisplayName', values.personDisplayName as string | null, 'PERSON');
      if (organizationId) Object.assign(references, await this.directory.createImportedContact(values, batchId, rowNumber, actorId, { organizationId }, tx));
      if (personId) Object.assign(references, await this.directory.createImportedContact(values, batchId, rowNumber, actorId, { personId }, tx));
      return references;
    } else {
      const organizationId = await resolve('organizationName', values.organizationName as string | null, 'ORGANIZATION');
      const personId = await resolve('personDisplayName', values.personDisplayName as string | null, 'PERSON');
      const record = await this.directory.createHistory(values, batchId, rowNumber, organizationId, personId, tx);
      references.historicalRecordId = record.id;
      references.organizationId = organizationId ?? undefined;
      references.personId = personId ?? undefined;
    }
    return references;
  }

  async adminList(actorId: string, page = 1, pageSize = 25) {
    await this.authorize(actorId);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.dataImportBatch.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize,
        select: { id: true, originalFilename: true, worksheetName: true, recordKind: true, status: true, createdAt: true, confirmedAt: true,
          analyzedRows: true, readyRows: true, reviewRows: true, invalidRows: true, importedRows: true } }),
      this.prisma.dataImportBatch.count(),
    ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    return { items, total, page, pageSize };
  }
}
