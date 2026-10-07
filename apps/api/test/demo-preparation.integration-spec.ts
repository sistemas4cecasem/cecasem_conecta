import { type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { validateDatabaseUrl } from '../src/config/database-url';
import { validateEnvironment } from '../src/config/environment';
import { configureApplication } from '../src/config/application';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { UserRole } from '../src/generated/prisma/client';
import { PasswordService } from '../src/modules/auth/password.service';
import { UsersService } from '../src/modules/users/users.service';

const databaseUrl = validateDatabaseUrl(process.env.DATABASE_URL);
const database = new URL(databaseUrl);
if (database.pathname !== '/cecasem_demo_test' || !['127.0.0.1', 'localhost'].includes(database.hostname)) {
  throw new Error('La preparación de demo solo se prueba en PostgreSQL local cecasem_demo_test.');
}

describe('preparación del dataset de demostración 6.2 PostgreSQL/HTTP', () => {
  let app: INestApplication<Server> | undefined;
  let prisma: PrismaService | undefined;
  let credentialsPath = '';
  let workbookPath = '';
  let temporaryDirectory = '';

  afterAll(async () => {
    if (prisma) {
      await prisma.$executeRawUnsafe('TRUNCATE TABLE "User" CASCADE');
      await prisma.$executeRawUnsafe('TRUNCATE TABLE "Category" CASCADE');
      await prisma.$executeRawUnsafe('TRUNCATE TABLE "EmailAccount" CASCADE');
    }
    if (app) await app.close();
    if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
  });

  it('prepara la base limpia, conserva procedencia, rechaza la repetición y aplica permisos normales', async () => {
    const moduleUrl = pathToFileURL(resolve(process.cwd(), '../../scripts/demo/prepare-demo.mjs')).href;
    const { prepareDemoDataset } = await import(moduleUrl) as typeof import('../../../scripts/demo/prepare-demo.mjs');
    const testingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ConfigService)
      .useValue(new ConfigService(validateEnvironment({ NODE_ENV: 'test', DATABASE_URL: databaseUrl })))
      .compile();
    app = testingModule.createNestApplication<INestApplication<Server>>();
    configureApplication(app);
    await app.listen(0, '127.0.0.1');
    const db = app.get(PrismaService);
    prisma = db;
    const users = app.get(UsersService);
    const passwordService = app.get(PasswordService);
    const adminEmail = 'admin@demo.example.test';
    const adminPassword = `Admin-${randomUUID()}-demo`;
    const admin = await users.createIdentity({ givenNames: 'Administradora', familyNames: 'Demo', email: adminEmail, role: UserRole.ADMINISTRATOR });
    await db.user.update({ where: { id: admin.id }, data: { passwordHash: await passwordService.hashNew(adminPassword) } });

    temporaryDirectory = await mkdtemp(resolve(tmpdir(), 'cecasem-demo-6-2-'));
    credentialsPath = resolve(temporaryDirectory, 'accounts.local.json');
    workbookPath = resolve(temporaryDirectory, 'sample.xlsx');
    const address = app.getHttpServer().address();
    if (!address || typeof address === 'string') throw new Error('No se obtuvo el puerto HTTP efímero de la prueba.');
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const previewSnapshots: Array<{ sheet: string; stage: string; database: { organizations: number; people: number; methods: number; orgContacts: number; personContacts: number; history: number }; api: { organizations: number; people: number; contactMethods: number } }> = [];
    const readBusinessCounts = async () => ({
      organizations: await db.organization.count(), people: await db.person.count(), methods: await db.contactMethod.count(),
      orgContacts: await db.organizationContact.count(), personContacts: await db.personContact.count(), history: await db.importedHistoricalRecord.count(),
    });
    const prepared = await prepareDemoDataset({ baseUrl, allowTestPort: true, adminEmail, adminPassword, credentialsPath, workbookPath, assumeYes: true,
      onPreview: async ({ stage, definition, directoryCounts }: { stage: string; definition: { name: string }; directoryCounts: { organizations: number; people: number; contactMethods: number } }) => {
        previewSnapshots.push({ sheet: definition.name, stage, database: await readBusinessCounts(), api: directoryCounts });
      } });
    expect(previewSnapshots).toHaveLength(8);
    for (const sheet of ['Organizaciones', 'Personas', 'Contactos', 'Antecedentes']) {
      const snapshots = previewSnapshots.filter((snapshot) => snapshot.sheet === sheet);
      expect(snapshots).toHaveLength(2);
      expect(snapshots[0].stage).toBe('before');
      expect(snapshots[1].stage).toBe('after');
      expect(snapshots[1].database).toEqual(snapshots[0].database);
      expect(snapshots[0].api).toEqual(snapshots[1].api);
      expect(snapshots[1].database.organizations).toBe(snapshots[1].api.organizations);
      expect(snapshots[1].database.people).toBe(snapshots[1].api.people);
      expect(snapshots[1].database.methods).toBe(snapshots[1].api.contactMethods);
    }
    expect(prepared.batches).toHaveLength(4);
    expect(prepared.previews).toHaveLength(4);
    expect((prepared.previews as Array<{ possibleMatches: number }>)[0].possibleMatches).toBeGreaterThan(0);

    const batchIds = (prepared.batches as Array<{ id: string }>).map((batch) => batch.id);
    const batchRecords = await db.dataImportBatch.findMany({ where: { id: { in: batchIds } }, orderBy: { createdAt: 'asc' } });
    expect(batchRecords).toHaveLength(4);
    expect(batchRecords.every((batch) => batch.status === 'IMPORTED')).toBe(true);
    expect(batchRecords.every((batch) => batch.originalFilename === 'muestra-cecasem-demo-6.2.xlsx')).toBe(true);

    const importedOrganizations = await db.organization.findMany({ where: { dataImportBatchId: { in: batchIds } } });
    expect(importedOrganizations.length).toBe(2);
    expect(importedOrganizations.every((organization) => organization.lastVerifiedAt === null)).toBe(true);
    const importedPeople = await db.person.findMany({ where: { dataImportBatchId: { in: batchIds } } });
    expect(importedPeople.length).toBe(2);
    expect(importedPeople.every((person) => person.lastVerifiedAt === null)).toBe(true);
    const importedContactAssociations = await db.organizationContact.findMany({ where: { dataImportBatchId: { in: batchIds } } });
    const importedPersonAssociations = await db.personContact.findMany({ where: { dataImportBatchId: { in: batchIds } } });
    expect(importedContactAssociations.length + importedPersonAssociations.length).toBe(2);
    expect(await db.verification.count({ where: { organizationContactId: { in: importedContactAssociations.map((row) => row.id) } } })).toBe(0);
    expect(await db.verification.count({ where: { personContactId: { in: importedPersonAssociations.map((row) => row.id) } } })).toBe(0);
    expect(await db.importedHistoricalRecord.count({ where: { batchId: { in: batchIds } } })).toBe(1);

    const demoOrganization = await db.organization.findFirstOrThrow({ where: { name: 'Fundación Horizonte Comunitario Demo' } });
    const intent = await db.contactIntent.findFirstOrThrow({ where: { organizationId: demoOrganization.id }, include: { author: true } });
    const relationshipProcess = await db.relationshipProcess.findFirstOrThrow({ where: { sourceIntentId: intent.id }, include: { participants: { include: { user: true } } } });
    expect(relationshipProcess.participants.map((participant) => participant.user.email)).toEqual(expect.arrayContaining(['investigacion@demo.example.test', 'seguimiento@demo.example.test', 'planificacion@demo.example.test']));
    expect(await db.communication.count({ where: { processId: relationshipProcess.id } })).toBe(2);
    expect(await db.opportunity.count({ where: { processId: relationshipProcess.id, status: 'PREPARING' } })).toBe(1);
    expect(await db.meeting.count({ where: { processId: relationshipProcess.id, status: 'SCHEDULED' } })).toBe(1);
    expect(await db.contactRestriction.count({ where: { state: 'ACTIVE' } })).toBe(1);

    const savedCredentials = JSON.parse(await readFile(credentialsPath, 'utf8')) as { accounts: Array<{ role: string; email: string; password: string }> };
    const research = savedCredentials.accounts.find((account) => account.email === 'investigacion@demo.example.test');
    if (!research) throw new Error('Faltó la cuenta sintética de Búsqueda.');
    await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: research.email, password: research.password }).expect(200)
      .then(async (login) => {
        const cookie = (login.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
        await request(app!.getHttpServer()).post('/api/v1/users').set('Cookie', cookie)
          .send({ givenNames: 'Intento', familyNames: 'No autorizado', email: 'no-autorizado@demo.example.test', role: 'BOARD' }).expect(403);
      });

    const beforeRepeat = {
      users: await db.user.count(), organizations: await db.organization.count(), people: await db.person.count(),
      batches: await db.dataImportBatch.count(), processes: await db.relationshipProcess.count(),
    };
    await expect(prepareDemoDataset({ baseUrl, allowTestPort: true, adminEmail, adminPassword, credentialsPath, workbookPath, assumeYes: true }))
      .rejects.toThrow(/Ya existe parte del dataset/u);
    expect({
      users: await db.user.count(), organizations: await db.organization.count(), people: await db.person.count(),
      batches: await db.dataImportBatch.count(), processes: await db.relationshipProcess.count(),
    }).toEqual(beforeRepeat);
  });
});
