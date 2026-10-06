import { type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import ExcelJS from 'exceljs';
import { randomBytes, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/config/application';
import { validateEnvironment } from '../src/config/environment';
import { validateDatabaseUrl } from '../src/config/database-url';
import { PrismaService } from '../src/database/prisma.service';
import { DataImportRecordKind, UserRole } from '../src/generated/prisma/client';
import { PasswordService } from '../src/modules/auth/password.service';
import { UsersService } from '../src/modules/users/users.service';

const databaseUrl = validateDatabaseUrl(process.env.DATABASE_URL);
if (!new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('Importación requiere una base aislada _test.');
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

async function xlsx(headers: string[], dataRows: (string | number | Date | null)[][], worksheet = 'Historial') {
  const workbook = new ExcelJS.Workbook(), sheet = workbook.addWorksheet(worksheet);
  sheet.addRow(headers); for (const row of dataRows) sheet.addRow(row);
  for (let col = 1; col <= headers.length; col++) sheet.getCell(2, col).numFmt = 'yyyy-mm-dd';
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe('5.4 importación histórica PostgreSQL/HTTP', () => {
  let app: INestApplication<Server>, prisma: PrismaService, users: UsersService, password: string;
  let disabledCookie = '';
  const userIds: string[] = [], batchIds: string[] = [], organizationIds: string[] = [], contactMethodIds: string[] = [], historicalIds: string[] = [];
  const actors = new Map<UserRole, { id: string; cookie: string }>();

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ConfigService)
      .useValue(new ConfigService(validateEnvironment({ NODE_ENV: 'test', DATABASE_URL: databaseUrl }))).compile();
    app = module.createNestApplication<INestApplication<Server>>(); configureApplication(app); await app.init();
    prisma = app.get(PrismaService); users = app.get(UsersService); password = randomBytes(24).toString('base64url');
    const hash = await app.get(PasswordService).hashNew(password);
    for (const role of Object.values(UserRole)) {
      const user = await users.createIdentity({ givenNames: 'QA Import', familyNames: role, role, email: `qa-import-${role.toLowerCase()}-${randomUUID()}@example.test` });
      userIds.push(user.id); await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hash } });
      const login = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: user.email, password }).expect(200);
      actors.set(role, { id: user.id, cookie: (login.headers['set-cookie'] as unknown as string[])[0].split(';')[0] });
    }
    const disabled = await users.createIdentity({ givenNames: 'QA', familyNames: 'Desactivada', role: UserRole.ADMINISTRATOR, email: `qa-import-disabled-${randomUUID()}@example.test` });
    userIds.push(disabled.id); await prisma.user.update({ where: { id: disabled.id }, data: { passwordHash: hash } });
    const login = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: disabled.email, password }).expect(200);
    disabledCookie = (login.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
    await request(app.getHttpServer()).post(`/api/v1/users/${disabled.id}/deactivate`).set('Cookie', actors.get(UserRole.ADMINISTRATOR)!.cookie).expect(204);
  });

  afterAll(async () => {
    if (!prisma) return;
    const imports = await prisma.dataImportBatch.findMany({ where: { id: { in: batchIds } }, select: { id: true } });
    const ids = imports.map(row => row.id);
    const links = await prisma.userEmailAccount.findMany({ where: { userId: { in: userIds } }, select: { emailAccountId: true } });
    await prisma.$transaction([
      prisma.auditEvent.deleteMany({ where: { OR: [{ dataImportBatchId: { in: ids } }, { actorUserId: { in: userIds } }] } }),
      prisma.verification.deleteMany({ where: { OR: [{ importedHistoryId: { in: historicalIds } }, { actorUserId: { in: userIds } }] } }),
      prisma.directoryChange.deleteMany({ where: { actorUserId: { in: userIds } } }),
      prisma.dataImportRow.deleteMany({ where: { batchId: { in: ids } } }),
      prisma.importedHistoricalRecord.deleteMany({ where: { id: { in: historicalIds } } }),
      prisma.organizationContact.deleteMany({ where: { dataImportBatchId: { in: ids } } }),
      prisma.personContact.deleteMany({ where: { dataImportBatchId: { in: ids } } }),
      prisma.contactMethod.deleteMany({ where: { id: { in: contactMethodIds } } }),
      prisma.organization.deleteMany({ where: { id: { in: organizationIds } } }),
      prisma.dataImportBatch.deleteMany({ where: { id: { in: ids } } }),
      prisma.userSession.deleteMany({ where: { userId: { in: userIds } } }),
      prisma.userEmailAccount.deleteMany({ where: { userId: { in: userIds } } }),
      prisma.emailAccount.deleteMany({ where: { id: { in: links.map(row => row.emailAccountId) } } }),
      prisma.user.deleteMany({ where: { id: { in: userIds } } }),
    ]);
    await app.close();
  });

  function preview(cookie: string, buffer: Buffer, worksheetName: string, recordKind: string, columnMapping: Record<string, number>) {
    return request(app.getHttpServer()).post('/api/v1/data-exchange/imports/preview').set('Cookie', cookie)
      .field('worksheetName', worksheetName).field('headerRow', '1').field('recordKind', recordKind).field('columnMapping', JSON.stringify(columnMapping))
      .attach('file', buffer, { filename: 'historial.xlsx', contentType: XLSX });
  }

  it('autoriza únicamente al Administrador, hace preview sin fichas y registra procedencia y verificación pendiente', async () => {
    const admin = actors.get(UserRole.ADMINISTRATOR)!;
    const workbook = await xlsx(['Organización', 'País'], [['QA Importación Organización', null]]);
    await request(app.getHttpServer()).post('/api/v1/data-exchange/imports/inspect').set('Cookie', disabledCookie)
      .attach('file', workbook, { filename: 'historial.xlsx', contentType: XLSX }).expect(401);
    for (const role of [UserRole.BOARD, UserRole.RESEARCH, UserRole.PLANNING]) {
      await request(app.getHttpServer()).post('/api/v1/data-exchange/imports/inspect').set('Cookie', actors.get(role)!.cookie).expect(403);
      await request(app.getHttpServer()).get('/api/v1/data-exchange/imports').set('Cookie', actors.get(role)!.cookie).expect(403);
    }
    const started = Date.now();
    const upload = await request(app.getHttpServer()).post('/api/v1/data-exchange/imports/inspect').set('Cookie', admin.cookie)
      .attach('file', workbook, { filename: 'historial.xlsx', contentType: XLSX }).expect(201);
    const inspected = upload.body as unknown as { sheets: { name: string; rowCount: number }[] };
    expect(inspected.sheets[0]).toMatchObject({ name: 'Historial', rowCount: 2 });
    const analysis = await preview(admin.cookie, workbook, 'Historial', DataImportRecordKind.ORGANIZATION, { name: 1, country: 2 }).expect(201);
    const analysisBody = analysis.body as unknown as { id: string; status: string; analyzedRows: number; readyRows: number; invalidRows: number };
    const batchId = analysisBody.id; batchIds.push(batchId);
    expect(analysis.body).toMatchObject({ status: 'ANALYZED', analyzedRows: 1, readyRows: 1, invalidRows: 0 });
    expect(await prisma.organization.count({ where: { name: 'QA Importación Organización' } })).toBe(0);
    const concurrent = await Promise.all([0, 1].map(() => request(app.getHttpServer()).post(`/api/v1/data-exchange/imports/${batchId}/confirm`).set('Cookie', admin.cookie).send({ decisions: [] })));
    expect(concurrent.map(response => response.status).sort()).toEqual([201, 409]);
    const confirmed = concurrent.find(response => response.status === 201)!;
    const organizationId = (await prisma.organization.findFirstOrThrow({ where: { name: 'QA Importación Organización' } })).id; organizationIds.push(organizationId);
    expect(confirmed.body).toMatchObject({ id: batchId, status: 'IMPORTED', analyzedRows: 1, importedRows: 1 });
    expect(await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { dataImportBatchId: true, lastVerifiedAt: true, country: true } }))
      .toEqual({ dataImportBatchId: batchId, lastVerifiedAt: null, country: null });
    await request(app.getHttpServer()).post(`/api/v1/data-exchange/imports/${batchId}/confirm`).set('Cookie', admin.cookie).send({ decisions: [] }).expect(409);
    const audit = await prisma.auditEvent.findUniqueOrThrow({ where: { dataImportBatchId: batchId } });
    expect(audit).toMatchObject({ action: 'DATA_IMPORT_BATCH_APPLIED', actorUserId: admin.id });
    const visible = await request(app.getHttpServer()).get('/api/v1/search').set('Cookie', actors.get(UserRole.BOARD)!.cookie).query({ q: 'QA Importación Organización', page: 1, pageSize: 25, includeInactive: false }).expect(200);
    const visibleBody = visible.body as unknown as { organizations: { items: { id: string }[] } };
    expect(visibleBody.organizations.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: organizationId })]));
    console.info(`5.4 QA performance: 1 organization row preview+confirm in ${Date.now() - started} ms.`);
  });

  it('registra contacto reutilizable y antecedente histórico incompleto sin crear Communication; queda verificable para otros roles y aparece en RF-68', async () => {
    const admin = actors.get(UserRole.ADMINISTRATOR)!; const board = actors.get(UserRole.BOARD)!; const organization = await prisma.organization.findFirstOrThrow({ where: { name: 'QA Importación Organización' } });
    const email = `qa-historical-${randomUUID()}@example.test`;
    const contactFile = await xlsx(['Tipo', 'Valor', 'Organización'], [['EMAIL', email, organization.name]]);
    const contactPreview = await preview(admin.cookie, contactFile, 'Historial', DataImportRecordKind.CONTACT, { contactType: 1, contactValue: 2, organizationName: 3 }).expect(201);
    const contactBatchId = (contactPreview.body as unknown as { id: string }).id; batchIds.push(contactBatchId);
    expect(await prisma.contactMethod.count({ where: { normalizedValue: email } })).toBe(0);
    await request(app.getHttpServer()).post(`/api/v1/data-exchange/imports/${contactBatchId}/confirm`).set('Cookie', admin.cookie).send({ decisions: [] }).expect(201);
    const method = await prisma.contactMethod.findFirstOrThrow({ where: { normalizedValue: email } }); contactMethodIds.push(method.id);
    const association = await prisma.organizationContact.findFirstOrThrow({ where: { contactMethodId: method.id } });
    expect(association).toMatchObject({ organizationId: organization.id, dataImportBatchId: contactBatchId, lastVerifiedAt: null });

    const historyFile = await xlsx(['Tipo', 'Fecha', 'Correo', 'Asunto', 'Cuerpo', 'Observación', 'Organización'],
      [['ENVIADO', new Date('2024-05-20T00:00:00.000Z'), email, null, null, 'Se indicó que hubo un envío', organization.name]]);
    const historyPreview = await preview(admin.cookie, historyFile, 'Historial', DataImportRecordKind.HISTORICAL_RECORD,
      { kind: 1, occurredOn: 2, email: 3, subject: 4, body: 5, originalObservation: 6, organizationName: 7 }).expect(201);
    const historyBody = historyPreview.body as unknown as { id: string; reviewRows: number; rows: { status: string }[] };
    const historyBatchId = historyBody.id; batchIds.push(historyBatchId);
    expect(historyPreview.body).toMatchObject({ reviewRows: 1, rows: [expect.objectContaining({ status: 'NEEDS_REVIEW' })] });
    await request(app.getHttpServer()).post(`/api/v1/data-exchange/imports/${historyBatchId}/confirm`).set('Cookie', admin.cookie).send({ decisions: [] }).expect(201);
    const record = await prisma.importedHistoricalRecord.findFirstOrThrow({ where: { batchId: historyBatchId } }); historicalIds.push(record.id);
    expect(record).toMatchObject({ kind: 'SENT', email, occurredOn: new Date('2024-05-20T00:00:00.000Z'), subject: null, body: null, personId: null, organizationId: organization.id, lastVerifiedAt: null });
    expect(await prisma.communication.count({ where: { registeredByUserId: actors.get(UserRole.ADMINISTRATOR)!.id } })).toBe(0);
    for (const role of Object.values(UserRole)) {
      const read = await request(app.getHttpServer()).get(`/api/v1/imported-history/${record.id}/verification`).set('Cookie', actors.get(role)!.cookie).expect(200);
      expect(read.body).toMatchObject({ verificationStatus: 'NEVER_VERIFIED', version: 1 });
    }
    const verify = await request(app.getHttpServer()).post(`/api/v1/imported-history/${record.id}/verify`).set('Cookie', board.cookie)
      .send({ expectedVersion: 1, sourceDescription: 'Contraste QA', sourceUrl: null }).expect(201);
    expect((verify.body as unknown as { condition: { verificationStatus: string } }).condition.verificationStatus).toBe('CURRENT');
    const search = await request(app.getHttpServer()).get('/api/v1/search').set('Cookie', actors.get(UserRole.RESEARCH)!.cookie)
      .query({ q: email, page: 1, pageSize: 25, includeInactive: false }).expect(200);
    const searchBody = search.body as unknown as { emailHistory: { items: unknown[]; importedRecords: { items: unknown[] } } };
    expect(searchBody.emailHistory.items).toHaveLength(0);
    expect(searchBody.emailHistory.importedRecords.items).toHaveLength(1);
    const importedResult = searchBody.emailHistory.importedRecords.items[0] as { type: string; id: string; kind: string; body: string | null; subject: string | null;
      lastVerifiedAt: string | null; batch: { id: string; originalFilename: string } };
    expect(importedResult).toMatchObject({ type: 'IMPORTED_HISTORICAL_RECORD', id: record.id, kind: 'SENT', body: null, subject: null,
      batch: { id: historyBatchId, originalFilename: 'historial.xlsx' } });
    expect(typeof importedResult.lastVerifiedAt).toBe('string');
  });

  it('detecta y reutiliza una coincidencia exacta de organización en vez de duplicarla', async () => {
    const admin = actors.get(UserRole.ADMINISTRATOR)!;
    const existing = await prisma.organization.create({ data: { name: 'QA Importación Coincidencia Exacta' } });
    organizationIds.push(existing.id);
    const buffer = await xlsx(['Nombre'], [[existing.name]]);
    const analysis = await preview(admin.cookie, buffer, 'Historial', DataImportRecordKind.ORGANIZATION, { name: 1 }).expect(201);
    const batch = analysis.body as unknown as { id: string; rows: { matches: { kind: string; id: string }[] }[] };
    batchIds.push(batch.id);
    expect(batch.rows[0].matches).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'EXACT', id: existing.id })]));
    await request(app.getHttpServer()).post(`/api/v1/data-exchange/imports/${batch.id}/confirm`).set('Cookie', admin.cookie).send({ decisions: [] }).expect(201);
    expect(await prisma.organization.count({ where: { name: existing.name } })).toBe(1);
    expect(await prisma.dataImportRow.findFirstOrThrow({ where: { batchId: batch.id }, select: { organizationId: true } })).toEqual({ organizationId: existing.id });
  });

  it('analiza y aplica un volumen representativo de 100 fichas con coincidencias consultadas en lote', async () => {
    const admin = actors.get(UserRole.ADMINISTRATOR)!;
    const rows = Array.from({ length: 100 }, (_, index) => [`QA Importación Volumen ${String(index + 1).padStart(3, '0')}`]);
    const buffer = await xlsx(['Organización'], rows); const started = Date.now();
    const analysis = await preview(admin.cookie, buffer, 'Historial', DataImportRecordKind.ORGANIZATION, { name: 1 }).expect(201);
    const analysisBody = analysis.body as unknown as { id: string; analyzedRows: number; readyRows: number; invalidRows: number };
    const id = analysisBody.id; batchIds.push(id);
    expect(analysisBody).toMatchObject({ analyzedRows: 100, readyRows: 100, invalidRows: 0 });
    expect(await prisma.organization.count({ where: { name: { startsWith: 'QA Importación Volumen ' } } })).toBe(0);
    const result = await request(app.getHttpServer()).post(`/api/v1/data-exchange/imports/${id}/confirm`).set('Cookie', admin.cookie).send({ decisions: [] }).expect(201);
    expect(result.body).toMatchObject({ status: 'IMPORTED', importedRows: 100 });
    const created = await prisma.organization.findMany({ where: { dataImportBatchId: id }, select: { id: true } }); organizationIds.push(...created.map(row => row.id));
    expect(created).toHaveLength(100);
    console.info(`5.4 QA performance: 100 organization rows preview+confirm in ${Date.now() - started} ms.`);
  });

  it('revierte toda la aplicación y audita el lote si una fila falla inesperadamente', async () => {
    const admin = actors.get(UserRole.ADMINISTRATOR)!;
    const buffer = await xlsx(['Organización'], [['QA Importación debe revertir']]);
    const analysis = await preview(admin.cookie, buffer, 'Historial', DataImportRecordKind.ORGANIZATION, { name: 1 }).expect(201);
    const id = (analysis.body as unknown as { id: string }).id; batchIds.push(id);
    const row = await prisma.dataImportRow.findFirstOrThrow({ where: { batchId: id } });
    await prisma.dataImportRow.update({ where: { id: row.id }, data: { normalizedValues: { name: 'X'.repeat(251), country: null } } });
    await request(app.getHttpServer()).post(`/api/v1/data-exchange/imports/${id}/confirm`).set('Cookie', admin.cookie).send({ decisions: [] }).expect(500);
    expect(await prisma.organization.count({ where: { name: 'QA Importación debe revertir' } })).toBe(0);
    expect(await prisma.dataImportBatch.findUniqueOrThrow({ where: { id }, select: { status: true, importedRows: true, failureCode: true } }))
      .toEqual({ status: 'FAILED', importedRows: 0, failureCode: 'APPLY_FAILED' });
    expect(await prisma.auditEvent.findUniqueOrThrow({ where: { dataImportBatchId: id }, select: { action: true, actorUserId: true } }))
      .toEqual({ action: 'DATA_IMPORT_BATCH_FAILED', actorUserId: admin.id });
  });
});
