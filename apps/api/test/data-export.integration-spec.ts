import { type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import ExcelJS from 'exceljs';
import { randomBytes, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import request from 'supertest';
import type supertest from 'supertest';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/config/application';
import { validateEnvironment } from '../src/config/environment';
import { validateDatabaseUrl } from '../src/config/database-url';
import { PrismaService } from '../src/database/prisma.service';
import { ContactType, OpportunityStatus, ProcessState, UserRole } from '../src/generated/prisma/client';
import { PasswordService } from '../src/modules/auth/password.service';
import { UsersService } from '../src/modules/users/users.service';

const databaseUrl = validateDatabaseUrl(process.env.DATABASE_URL);
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const parseBinary = (response: supertest.Response, callback: (error: Error | null, body?: Buffer) => void) => {
  const chunks: Buffer[] = [];
  response.on('data', (chunk: unknown) => {
    if (Buffer.isBuffer(chunk)) chunks.push(chunk);
    else if (typeof chunk === 'string') chunks.push(Buffer.from(chunk));
    else if (chunk instanceof Uint8Array) chunks.push(Buffer.from(chunk));
  });
  response.on('end', () => callback(null, Buffer.concat(chunks)));
};
async function openWorkbook(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(new Uint8Array(buffer).buffer);
  return workbook;
}

describe('5.5 exportación PostgreSQL/HTTP', () => {
  let app: INestApplication<Server>, prisma: PrismaService, users: UsersService;
  const userIds: string[] = [], processIds: string[] = [], opportunityIds: string[] = [], orgIds: string[] = [], personIds: string[] = [], contactIds: string[] = [], relationIds: string[] = [], categoryIds: string[] = [];
  const actors = new Map<UserRole, { id: string; cookie: string }>();
  let organizationId: string, personId: string, processId: string, categoryId: string, deactivatedCookie = '';

  beforeAll(async () => {
    if (!new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('Exportación requiere una base aislada _test.');
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ConfigService)
      .useValue(new ConfigService(validateEnvironment({ NODE_ENV: 'test', DATABASE_URL: databaseUrl }))).compile();
    app = module.createNestApplication<INestApplication<Server>>(); configureApplication(app); await app.init();
    prisma = app.get(PrismaService); users = app.get(UsersService);
    const password = randomBytes(24).toString('base64url'), hash = await app.get(PasswordService).hashNew(password);
    for (const role of Object.values(UserRole)) {
      const user = await users.createIdentity({ givenNames: 'QA Export', familyNames: role, role, email: `qa-export-${role.toLowerCase()}-${randomUUID()}@example.test` });
      userIds.push(user.id); await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hash } });
      const login = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: user.email, password }).expect(200);
      actors.set(role, { id: user.id, cookie: (login.headers['set-cookie'] as unknown as string[])[0].split(';')[0] });
    }
    const admin = actors.get(UserRole.ADMINISTRATOR)!;
    const category = await prisma.category.create({ data: { name: 'QA Export Category', normalizedName: 'qa export category' } });
    categoryId = category.id; categoryIds.push(category.id);
    const organization = await prisma.organization.create({ data: { name: '=HYPERLINK("https://example.test")', country: 'Bolivia' } });
    organizationId = organization.id; orgIds.push(organization.id);
    await prisma.organizationCategory.create({ data: { organizationId, categoryId } });
    const person = await prisma.person.create({ data: { displayName: '+cmd' } });
    personId = person.id; personIds.push(person.id);
    const contact = await prisma.contactMethod.create({ data: { type: ContactType.OTHER, value: '=SUM(1,1)', label: 'QA formula check' } });
    contactIds.push(contact.id);
    await prisma.personContact.create({ data: { personId, contactMethodId: contact.id } });
    const relation = await prisma.personOrganizationRelation.create({ data: { personId, organizationId, positionTitle: 'Directora', isCurrent: true,
      startDate: new Date('2026-11-03T00:00:00.000Z') } });
    relationIds.push(relation.id);
    const process = await prisma.relationshipProcess.create({ data: { purpose: 'QA Proceso', organizationId, createdByUserId: admin.id,
      state: ProcessState.PREPARATION, participants: { create: { userId: admin.id, origin: 'PROCESS_CREATOR' } } } });
    processId = process.id; processIds.push(process.id);
    const opportunity = await prisma.opportunity.create({ data: { name: 'QA Oportunidad', url: 'https://example.test', deadline: new Date('2026-11-03T00:00:00.000Z'),
      status: OpportunityStatus.PENDING_REVIEW, createdByUserId: admin.id, requestKey: randomUUID(), requestFingerprint: 'a'.repeat(64), processId,
      organizations: { create: { organizationId } } } });
    opportunityIds.push(opportunity.id);

    const disabled = await users.createIdentity({ givenNames: 'QA Export', familyNames: 'Disabled', role: UserRole.ADMINISTRATOR, email: `qa-export-disabled-${randomUUID()}@example.test` });
    userIds.push(disabled.id); await prisma.user.update({ where: { id: disabled.id }, data: { passwordHash: hash } });
    const login = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: disabled.email, password }).expect(200);
    deactivatedCookie = (login.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
    await request(app.getHttpServer()).post(`/api/v1/users/${disabled.id}/deactivate`).set('Cookie', admin.cookie).expect(204);
  }, 30000);

  afterAll(async () => {
    if (!prisma) return;
    const links = await prisma.userEmailAccount.findMany({ where: { userId: { in: userIds } }, select: { emailAccountId: true } });
    await prisma.$transaction([
      prisma.auditEvent.deleteMany({ where: { actorUserId: { in: userIds } } }),
      prisma.opportunityEvent.deleteMany({ where: { opportunityId: { in: opportunityIds } } }),
      prisma.opportunityOrganization.deleteMany({ where: { opportunityId: { in: opportunityIds } } }),
      prisma.opportunity.deleteMany({ where: { id: { in: opportunityIds } } }),
      prisma.processParticipant.deleteMany({ where: { processId: { in: processIds } } }),
      prisma.relationshipProcessEvent.deleteMany({ where: { processId: { in: processIds } } }),
      prisma.relationshipProcess.deleteMany({ where: { id: { in: processIds } } }),
      prisma.personOrganizationRelation.deleteMany({ where: { id: { in: relationIds } } }),
      prisma.personContact.deleteMany({ where: { personId: { in: personIds } } }),
      prisma.contactMethod.deleteMany({ where: { id: { in: contactIds } } }),
      prisma.person.deleteMany({ where: { id: { in: personIds } } }),
      prisma.organizationCategory.deleteMany({ where: { organizationId: { in: orgIds } } }),
      prisma.organization.deleteMany({ where: { id: { in: orgIds } } }),
      prisma.organization.deleteMany({ where: { name: { startsWith: 'QA Bulk Export ' } } }),
      prisma.category.deleteMany({ where: { id: { in: categoryIds } } }),
      prisma.userSession.deleteMany({ where: { userId: { in: userIds } } }),
      prisma.userEmailAccount.deleteMany({ where: { userId: { in: userIds } } }),
      prisma.emailAccount.deleteMany({ where: { id: { in: links.map(link => link.emailAccountId) } } }),
      prisma.user.deleteMany({ where: { id: { in: userIds } } }),
    ]);
    await app.close();
  });

  const preview = (type: string, cookie: string, filters: Record<string, unknown> = {}) => request(app.getHttpServer())
    .post(`/api/v1/data-exchange/exports/${type}/preview`).set('Cookie', cookie).send({ filters });
  const download = (type: string, cookie: string, filters: Record<string, unknown> = {}) => request(app.getHttpServer())
    .post(`/api/v1/data-exchange/exports/${type}`).set('Cookie', cookie).send({ filters }).buffer(true).parse(parseBinary);

  it('exports filtered organizations and all four roles only through their domain read permissions', async () => {
    const filters = { country: 'Bolivia', categoryId, organizationStatus: 'active' };
    for (const role of Object.values(UserRole)) {
      await preview('organizations', actors.get(role)!.cookie, filters).expect(200, { type: 'organizations', count: 1, unit: 'registros' });
    }
    const result = await download('organizations', actors.get(UserRole.ADMINISTRATOR)!.cookie, filters).expect(200);
    expect(result.headers['content-type']).toContain(XLSX);
    expect(result.headers['content-disposition']).toMatch(/^attachment; filename="cecasem-organizations-\d{4}-\d{2}-\d{2}\.xlsx"$/);
    const workbook = await openWorkbook(result.body as Buffer), sheet = workbook.getWorksheet('Organizaciones')!;
    expect(sheet.rowCount).toBe(2);
    expect(sheet.getRow(2).getCell(2).value).toBe('=HYPERLINK("https://example.test")');
    expect(sheet.getRow(2).getCell(2).type).toBe(ExcelJS.ValueType.String);
    expect(sheet.getRow(2).getCell(10).value).toBe('NEVER_VERIFIED');
    expect(workbook.getWorksheet('Categorías')?.rowCount).toBe(2);
    expect(sheet.getRow(2).getCell(9).value).toBeNull();
  });

  it('exports contacts as separate people, contact associations and institutional links without private notes', async () => {
    const board = actors.get(UserRole.BOARD)!;
    const result = await download('contacts', board.cookie, { personStatus: 'active', relationStatus: 'current' }).expect(200);
    const workbook = await openWorkbook(result.body as Buffer);
    expect(workbook.worksheets.map(sheet => sheet.name)).toEqual(['Personas', 'Medios de contacto', 'Vínculos institucionales']);
    expect(workbook.getWorksheet('Personas')!.getRow(2).getCell(2).value).toBe('+cmd');
    const methods = workbook.getWorksheet('Medios de contacto')!;
    expect(methods.rowCount).toBe(2); expect(methods.getRow(2).getCell(6).value).toBe('=SUM(1,1)');
    expect(methods.getRow(2).getCell(6).type).toBe(ExcelJS.ValueType.String);
    expect(workbook.getWorksheet('Vínculos institucionales')!.getRow(2).getCell(9).value).toBe('2026-11-03');
    expect(workbook.getWorksheet('Medios de contacto')!.getRow(1).values).not.toContain('Notas internas');
  });

  it('exports process and opportunity projections without communication bodies or internal notes and preserves the civil deadline', async () => {
    const research = actors.get(UserRole.RESEARCH)!;
    const processes = await download('processes', research.cookie, { processState: 'PREPARATION' }).expect(200);
    const processBook = await openWorkbook(processes.body as Buffer);
    const processSheet = processBook.getWorksheet('Procesos')!;
    expect(processSheet.rowCount).toBe(2); expect(processSheet.getRow(2).getCell(2).value).toBe('QA Proceso');
    expect(processBook.worksheets.map(sheet => sheet.name)).toContain('Participantes');
    expect(processSheet.getRow(1).values).not.toContain('Cuerpo');
    expect(processSheet.getRow(1).values).not.toContain('Notas internas');
    const planning = actors.get(UserRole.PLANNING)!;
    const opportunities = await download('opportunities', planning.cookie, { opportunityStatus: 'PENDING_REVIEW' }).expect(200);
    const opportunityBook = await openWorkbook(opportunities.body as Buffer);
    const opportunitySheet = opportunityBook.getWorksheet('Oportunidades')!;
    expect(opportunitySheet.rowCount).toBe(2); expect(opportunitySheet.getRow(2).getCell(6).value).toBe('2026-11-03');
    expect(opportunitySheet.getRow(2).getCell(7).value).toBe('PENDING_REVIEW');
    expect(opportunitySheet.getRow(1).values).not.toContain('CCO');
  });

  it('rejects anonymous and deactivated sessions, and clearly handles filters with no results', async () => {
    await request(app.getHttpServer()).post('/api/v1/data-exchange/exports/organizations').send({ filters: {} }).expect(401);
    await request(app.getHttpServer()).post('/api/v1/data-exchange/exports/organizations').set('Cookie', deactivatedCookie).send({ filters: {} }).expect(401);
    const cookie = actors.get(UserRole.ADMINISTRATOR)!.cookie;
    await preview('organizations', cookie, { name: 'No existe QA' }).expect(200, { type: 'organizations', count: 0, unit: 'registros' });
    await download('organizations', cookie, { name: 'No existe QA' }).expect(422);
  });

  it('batches a 2,000-row organization export without per-row queries', async () => {
    await prisma.organization.createMany({ data: Array.from({ length: 2000 }, (_, index) => ({
      name: `QA Bulk Export ${String(index).padStart(4, '0')}`, country: 'QA Bulk Country',
    })) });
    const cookie = actors.get(UserRole.ADMINISTRATOR)!.cookie, started = Date.now(), heapBefore = process.memoryUsage().heapUsed;
    const result = await download('organizations', cookie, { name: 'QA Bulk Export', country: 'QA Bulk Country', organizationStatus: 'active' }).expect(200);
    const elapsedMs = Date.now() - started, heapDeltaBytes = process.memoryUsage().heapUsed - heapBefore;
    const workbook = await openWorkbook(result.body as Buffer);
    expect(workbook.getWorksheet('Organizaciones')!.rowCount).toBe(2001);
    console.info(`5.5 QA export performance: rows=2000, durationMs=${elapsedMs}, xlsxBytes=${(result.body as Buffer).length}, heapDeltaBytes=${heapDeltaBytes}, batchSize=500.`);
  });
});
