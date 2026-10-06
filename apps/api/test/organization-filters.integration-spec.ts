import { type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { randomUUID, randomBytes } from 'node:crypto';
import type { Server } from 'node:http';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/config/application';
import { validateEnvironment } from '../src/config/environment';
import { validateDatabaseUrl } from '../src/config/database-url';
import { PrismaService } from '../src/database/prisma.service';
import { UserRole } from '../src/generated/prisma/client';
import { UsersService } from '../src/modules/users/users.service';
import { PasswordService } from '../src/modules/auth/password.service';
import { DirectoryService } from '../src/modules/directory/directory.service';
import { VerificationClock, VerificationService } from '../src/modules/directory/verification.service';
import { RelationshipProcessesService } from '../src/modules/relationships/relationship-processes.service';
import { InternalNotesService } from '../src/modules/relationships/internal-notes.service';
import { CommunicationsService } from '../src/modules/communications/communications.service';
import { CommunicationAmendmentsService } from '../src/modules/communications/communication-amendments.service';
import * as permissions from '../src/modules/auth/authorization/role-permissions';
import type { SearchResponseDto } from '../src/modules/search/search-response.dto';
import type { OrganizationQueryDto } from '../src/modules/directory/directory.dto';

const url = validateDatabaseUrl(process.env.DATABASE_URL);
if (!new URL(url).pathname.endsWith('_test')) throw new Error('Filtros requieren base aislada _test.');
type Page = Awaited<ReturnType<DirectoryService['listOrganizations']>>;
describe('5.2 RF-69 filtros institucionales PostgreSQL/HTTP', () => {
  let app: INestApplication<Server>, prisma: PrismaService, directory: DirectoryService, users: UsersService;
  let actorId: string, cookie: string, categoryId: string, accountId: string;
  const password = randomBytes(24).toString('base64url'), ids: string[] = [];
  const now = new Date('2026-10-05T12:00:00.000Z');
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ConfigService)
      .useValue(new ConfigService(validateEnvironment({ NODE_ENV: 'test', DATABASE_URL: url }))).compile();
    app = module.createNestApplication<INestApplication<Server>>(); configureApplication(app); await app.init();
    prisma = app.get(PrismaService); directory = app.get(DirectoryService); users = app.get(UsersService);
    const actor = await users.createIdentity({ givenNames: 'QA52', familyNames: 'Filtros', role: UserRole.ADMINISTRATOR, email: randomUUID() + '@example.test' }); actorId = actor.id;
    await prisma.user.update({ where: { id: actorId }, data: { passwordHash: await app.get(PasswordService).hashNew(password) } });
    const login = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: actor.email, password }).expect(200);
    cookie = (login.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
    categoryId = (await directory.createCategory({ name: 'QA52 ' + randomUUID() }, actorId)).id;
    accountId = (await users.createEmailAccount({ address: randomUUID() + '@example.test', displayName: 'QA52' })).id;
    await users.assignEmailAccount(actorId, accountId);
  });
  beforeEach(async () => {
    jest.spyOn(app.get(VerificationClock), 'now').mockReturnValue(now);
    await prisma.verificationSettings.update({ where: { id: 1 }, data: { institutionalVerificationMonths: 12 } });
    for (const [name, country, active, category] of [
      ['A vigente', 'Bolivia', true, true], ['B vencida', 'bolivia', true, true], ['C modificada', 'Bolivia', true, true],
      ['D nunca', 'Perú', true, true], ['E inactiva', 'Bolivia', false, true], ['F sin categoría', 'Bolivia', true, false], ['G sin país', null, true, true],
    ] as const) {
      const row = await directory.createOrganization({ name: 'QA52 ' + name, country, categoryIds: category ? [categoryId] : [] }, actorId); ids.push(row.id);
      if (!active) await directory.organizationStatus(row.id, { expectedVersion: 1, isActive: false }, actorId);
    }
    for (const [index, at, version] of [[0, '2026-06-01', 1], [1, '2025-09-01', 1], [2, '2026-06-01', 1], [4, '2026-06-01', 2]] as const) {
      await prisma.verification.create({ data: { organizationId: ids[index], actorUserId: actorId, verifiedAt: new Date(at), objectVersion: version } });
    }
    await directory.editOrganization(ids[2], { name: 'QA52 C modificada', country: 'Bolivia', description: 'Cambio reciente', categoryIds: [categoryId], expectedVersion: 1 }, actorId);
    for (const index of [0, 1, 3]) {
      const process = await app.get(RelationshipProcessesService).create({ organizationId: ids[index], purpose: 'QA52 cooperación' }, actorId);
      if (index === 3) { await app.get(InternalNotesService).create(process.id, 'Solo nota interna', actorId); continue; }
      const comm = index === 0 ? await app.get(CommunicationsService).registerSent(process.id, { emailAccountId: accountId, to: ['historico.qa52@example.test'], cc: [], bcc: [], subject: 'Salida', body: 'Original', sentAt: '2025-01-01T12:00:00Z' }, actorId, randomUUID())
        : await app.get(CommunicationsService).registerReceived(process.id, { sender: 'historico.qa52@example.test', to: ['cecasem@example.test'], cc: [], bcc: [], subject: 'Respuesta', body: 'Original', receivedAt: '2025-01-02T12:00:00Z' }, actorId, randomUUID());
      if (index === 1) await app.get(CommunicationAmendmentsService).create(comm.id, 'INVALIDATION', 'Registro equivocado', actorId, randomUUID());
    }
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await prisma.$transaction([
      prisma.auditEvent.deleteMany({ where: { actorUserId: actorId } }), prisma.directoryChange.deleteMany({ where: { actorUserId: actorId } }),
      prisma.verification.deleteMany({ where: { organizationId: { in: ids } } }),
      prisma.communicationAmendment.deleteMany({ where: { authorUserId: actorId } }),
      prisma.communicationRecipient.deleteMany({ where: { communication: { registeredByUserId: actorId } } }),
      prisma.communication.deleteMany({ where: { registeredByUserId: actorId } }), prisma.internalNote.deleteMany({ where: { authorUserId: actorId } }),
      prisma.relationshipProcessEvent.deleteMany({ where: { actorUserId: actorId } }), prisma.processParticipant.deleteMany({ where: { userId: actorId } }),
      prisma.relationshipProcess.deleteMany({ where: { createdByUserId: actorId } }),
      prisma.organizationCategory.deleteMany({ where: { organizationId: { in: ids } } }), prisma.organization.deleteMany({ where: { id: { in: ids } } }),
      prisma.verificationSettings.update({ where: { id: 1 }, data: { institutionalVerificationMonths: 12 } }),
    ]); ids.length = 0;
  });
  afterAll(async () => {
    await prisma.$transaction([prisma.category.deleteMany({ where: { id: categoryId } }), prisma.userSession.deleteMany({ where: { userId: actorId } }),
      prisma.userEmailAccount.deleteMany({ where: { userId: actorId } }), prisma.emailAccount.deleteMany({ where: { id: accountId } }), prisma.user.deleteMany({ where: { id: actorId } })]);
    await app.close();
  });
  const http = (params: object) => request(app.getHttpServer()).get('/api/v1/organizations').set('Cookie', cookie).query({ name: 'QA52', ...params });
  async function match(params: object, indices: number[]) {
    const response = await http(params).expect(200); const body = response.body as Page;
    expect(body.items.map(row => row.id)).toEqual(indices.map(index => ids[index])); expect(body.total).toBe(indices.length);
  }
  it('país completo normalizado, nulo excluido y país inexistente vacío', async () => { await match({ country: '  BOLIVIA  ' }, [0, 1, 2, 5]); await match({ country: 'Atlantis' }, []); });
  it('categoría conserva RF-12 y combina país/estado sin duplicados', async () => {
    await match({ categoryId }, [0, 1, 2, 3, 6]); await match({ categoryId, country: 'Bolivia' }, [0, 1, 2]);
    await match({ categoryId, status: 'inactive' }, [4]); await match({ categoryId, country: 'Bolivia', status: 'inactive' }, [4]);
  });
  it('país + estado y país + categoría + estado intersecan', async () => { await match({ country: 'Bolivia', status: 'all' }, [0, 1, 2, 4, 5]); await match({ country: 'Bolivia', categoryId, status: 'active' }, [0, 1, 2]); });
  it('vigente, vencida y modificada usan última verificación y versión', async () => {
    await match({ verificationStatus: 'CURRENT' }, [0]); await match({ verificationStatus: 'REVIEW_DUE' }, [1, 2]);
    for (const index of [0, 1, 2]) expect((await app.get(VerificationService).status('organization', ids[index])).verificationStatus).toBe(index === 0 ? 'CURRENT' : 'REVIEW_DUE');
  });
  it('nunca verificada no equivale a revisión vencida', async () => { await match({ verificationStatus: 'NEVER_VERIFIED' }, [3, 5, 6]); await match({ categoryId, verificationStatus: 'NEVER_VERIFIED' }, [3, 6]); });
  it('intervalo configurable cambia la condición sin editar fechas', async () => { await prisma.verificationSettings.update({ where: { id: 1 }, data: { institutionalVerificationMonths: 3 } }); await match({ verificationStatus: 'CURRENT' }, []); await match({ verificationStatus: 'REVIEW_DUE' }, [0, 1, 2]); });
  it('mes calendario y límite exacto coinciden con regla institucional', async () => {
    jest.spyOn(app.get(VerificationClock), 'now').mockReturnValue(new Date('2027-02-28T10:00:00Z'));
    await prisma.verificationSettings.update({ where: { id: 1 }, data: { institutionalVerificationMonths: 6 } });
    await prisma.verification.create({ data: { organizationId: ids[0], actorUserId: actorId, verifiedAt: new Date('2026-08-31T10:00:00Z'), objectVersion: 1 } });
    await match({ name: 'QA52 A', verificationStatus: 'REVIEW_DUE' }, [0]);
    expect((await app.get(VerificationService).status('organization', ids[0])).verificationStatus).toBe('REVIEW_DUE');
  });
  it('enviada válida y recibida invalidada cuentan; notas y correo de directorio no', async () => {
    const method = await prisma.contactMethod.create({ data: { type: 'EMAIL', value: 'solo.qa52@example.test', normalizedValue: 'solo.qa52@example.test' } });
    await prisma.organizationContact.create({ data: { organizationId: ids[2], contactMethodId: method.id } });
    try { await match({ withCommunications: true }, [0, 1]); await match({ withCommunications: false }, [2, 3, 5, 6]); }
    finally { await prisma.organizationContact.deleteMany({ where: { contactMethodId: method.id } }); await prisma.contactMethod.delete({ where: { id: method.id } }); }
  });
  it('categoría + comunicaciones y sin comunicaciones + país', async () => { await match({ categoryId, withCommunications: true }, [0, 1]); await match({ country: 'Bolivia', withCommunications: false }, [2, 5]); });
  it('cinco filtros y paginación comparten predicado de conteo', async () => {
    await match({ country: 'Bolivia', categoryId, status: 'active', verificationStatus: 'REVIEW_DUE', withCommunications: true }, [1]);
    const a = (await http({ country: 'Bolivia', categoryId, pageSize: 1, page: 2 }).expect(200)).body as Page;
    expect(a.total).toBe(3); expect(a.items.map(row => row.id)).toEqual([ids[1]]);
    const b = (await http({ country: 'Bolivia', categoryId, pageSize: 1, page: 9 }).expect(200)).body as Page; expect(b.total).toBe(3); expect(b.items).toEqual([]);
  });
  it('categoría inexistente válida vacía; nombre vacío no restringe', async () => { await match({ categoryId: randomUUID(), country: 'Bolivia' }, []); const body = (await http({ name: '', country: 'Perú' }).expect(200)).body as Page; expect(body.items.map(row => row.id)).toEqual([ids[3]]); });
  it.each([{ country: '' }, { country: ' ' }, { country: 'x'.repeat(151) }, { country: ['Bolivia', 'Perú'] }, { categoryId: '' }, { categoryId: 'bad' }, { parentId: '' }, { status: 'closed' }, { verificationStatus: '' }, { verificationStatus: 'verified' }, { withCommunications: '' }, { withCommunications: 'yes' }, { withCommunications: '1' }])('rechaza parámetro inválido %j', async params => { await http(params).expect(400); });
  it('filtros globales reducen solo organizaciones y preservan RF-68 sin ContactMethod', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/search').set('Cookie', cookie).query({ q: 'qa52', organizationCountry: 'Bolivia', organizationCategoryId: categoryId, organizationVerificationStatus: 'REVIEW_DUE', organizationWithCommunications: true }).expect(200);
    const body = response.body as SearchResponseDto; expect(body.organizations.items.map(row => row.id)).toEqual([ids[1]]); expect(body.processes?.total).toBe(3);
    const email = (await request(app.getHttpServer()).get('/api/v1/search').set('Cookie', cookie).query({ q: 'historico.qa52@example.test', organizationCountry: 'Atlantis' }).expect(200)).body as SearchResponseDto;
    expect(email.email).toBeNull(); expect(email.emailHistory?.total).toBe(2); expect(email.emailHistory?.items[0].validity).toBe('INVALIDATED'); expect(email.emailHistory?.lastValidContact?.direction).toBe('SENT');
  });
  it.each([{ organizationCountry: '' }, { organizationCategoryId: '' }, { organizationStatus: 'CLOSED' }, { organizationVerificationStatus: 'bad' }, { organizationWithCommunications: 'yes' }])('búsqueda valida ámbito %j', async params => { await request(app.getHttpServer()).get('/api/v1/search').set('Cookie', cookie).query({ q: 'qa52', ...params }).expect(400); });
  it('filtro no es canal lateral sin lectura de procesos/comunicaciones', async () => {
    const original = permissions.hasPermission;
    jest.spyOn(permissions, 'hasPermission').mockImplementation((role, permission) => permission === 'communications.read' ? false : original(role, permission));
    await http({ withCommunications: true }).expect(403); await http({ withCommunications: false }).expect(403);
    await request(app.getHttpServer()).get('/api/v1/search').set('Cookie', cookie).query({ q: 'qa52', organizationWithCommunications: true }).expect(403);
    await match({ country: 'Perú' }, [3]);
  });
  it('sesión y usuario activos son obligatorios', async () => {
    await request(app.getHttpServer()).get('/api/v1/organizations?country=Bolivia').expect(401);
    await prisma.user.update({ where: { id: actorId }, data: { isActive: false, deactivatedAt: now } });
    try { await http({ withCommunications: true }).expect(401); } finally { await prisma.user.update({ where: { id: actorId }, data: { isActive: true, deactivatedAt: null } }); }
  });
  it('consultas constantes con 1 y varias filas, sin N+1', async () => {
    const spy = jest.spyOn(Client.prototype, 'query');
    const run = async (pageSize: number) => { spy.mockClear(); await http({ status: 'all', verificationStatus: 'NEVER_VERIFIED', withCommunications: false, pageSize }).expect(200); return spy.mock.calls.length; };
    expect(await run(4)).toBe(await run(1));
    const query: OrganizationQueryDto = { page: 1, pageSize: 25, status: 'active', country: 'Bolivia', withCommunications: true };
    await expect(directory.listOrganizations(query)).rejects.toThrow();
  });
});
