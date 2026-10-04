import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/config/application';
import { validateEnvironment } from '../src/config/environment';
import { validateDatabaseUrl } from '../src/config/database-url';
import { PrismaService } from '../src/database/prisma.service';
import { AuditAction, ContactIntentState, UserRole } from '../src/generated/prisma/client';
import { UsersService } from '../src/modules/users/users.service';
import { SessionsService } from '../src/modules/auth/sessions.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { DirectoryService } from '../src/modules/directory/directory.service';
import { PeopleService } from '../src/modules/directory/people.service';
import { ContactIntentsService } from '../src/modules/relationships/contact-intents.service';
import type { ContactIntentDto, ContactIntentPageDto } from '../src/modules/relationships/contact-intent.dto';
import { UserAccessService } from '../src/modules/auth/user-access.service';
const databaseUrl = validateDatabaseUrl(process.env.DATABASE_URL);
if (!new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('Intenciones requieren una base aislada _test.');

describe('Intenciones PostgreSQL/HTTP', () => {
  let app: INestApplication<Server>, prisma: PrismaService, users: UsersService, intents: ContactIntentsService;
  const userIds: string[] = [], orgIds: string[] = [], personIds: string[] = [];
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ConfigService)
      .useValue(new ConfigService(validateEnvironment({ NODE_ENV: 'test', DATABASE_URL: databaseUrl }))).compile();
    app = module.createNestApplication<INestApplication<Server>>(); configureApplication(app); await app.init();
    prisma = app.get(PrismaService); users = app.get(UsersService); intents = app.get(ContactIntentsService);
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await prisma.$transaction([
      prisma.auditEvent.deleteMany({ where: { actorUserId: { in: userIds } } }),
      prisma.contactIntent.deleteMany({ where: { authorUserId: { in: userIds } } }),
      prisma.directoryChange.deleteMany({ where: { actorUserId: { in: userIds } } }),
      prisma.personOrganizationRelation.deleteMany({ where: { personId: { in: personIds } } }),
      prisma.person.deleteMany({ where: { id: { in: personIds } } }),
      prisma.organization.updateMany({ where: { id: { in: orgIds } }, data: { duplicateOfId: null } }),
      prisma.organization.deleteMany({ where: { id: { in: orgIds } } }),
      prisma.userSession.deleteMany({ where: { userId: { in: userIds } } }),
      prisma.user.deleteMany({ where: { id: { in: userIds } } }),
    ]); userIds.length = orgIds.length = personIds.length = 0;
  });
  afterAll(async () => { await app.close(); });
  async function actor(role: UserRole = UserRole.ADMINISTRATOR) {
    const row = await users.createIdentity({ givenNames: 'QA', familyNames: 'Intenciones', role, email: randomUUID() + '@example.test' }); userIds.push(row.id);
    const token = await prisma.$transaction(tx => app.get(SessionsService).create(row.id, tx));
    return { ...row, cookie: 'cecasem_session=' + token };
  }
  async function target(authorId: string, kind: 'organization' | 'person' = 'organization') {
    if (kind === 'organization') { const row = await app.get(DirectoryService).createOrganization({ name: 'Objetivo QA' }, authorId); orgIds.push(row.id); return { organizationId: row.id }; }
    const row = await app.get(PeopleService).create({ displayName: 'Persona independiente QA' }, authorId); personIds.push(row.id); return { personId: row.id };
  }
  function post(cookie: string, body: object, suffix = '') { return request(app.getHttpServer()).post('/api/v1/contact-intents' + suffix).set('Cookie', cookie).send(body); }
  async function create(owner: Awaited<ReturnType<typeof actor>>, kind: 'organization' | 'person' = 'organization') {
    return intents.create({ ...await target(owner.id, kind), purpose: 'Preparar cooperación' }, owner.id);
  }
  it.each(Object.values(UserRole))('%s crea y consulta con autor de sesión', async role => {
    const owner = await actor(role), goal = await target(owner.id);
    const response = await post(owner.cookie, { ...goal, purpose: ' Preparar cooperación ' }).expect(201);
    const row = response.body as ContactIntentDto;
    expect(row).toMatchObject({ purpose: 'Preparar cooperación', state: 'ACTIVE', version: 1, author: { id: owner.id }, canCancel: true });
    expect(row.createdAt).toBe(row.lastActivityAt); expect(row.cancelledAt).toBeNull();
    expect(JSON.stringify(row)).not.toMatch(/password|token|email|sourceDescription/i);
    const read = await request(app.getHttpServer()).get('/api/v1/contact-intents/' + row.id).set('Cookie', owner.cookie).expect(200);
    expect(read.headers['cache-control']).toBe('no-store');
    expect(await prisma.auditEvent.count({ where: { contactIntentId: row.id, action: AuditAction.CONTACT_INTENT_CREATED } })).toBe(1);
  });
  it('admite persona independiente y conserva FK', async () => {
    const owner = await actor(), row = await create(owner, 'person'); expect(row.target.kind).toBe('PERSON');
    expect(await prisma.contactIntent.findUnique({ where: { id: row.id } })).toMatchObject({ personId: row.target.id, organizationId: null });
  });
  it.each(['', '/new', '/' + randomUUID(), '/' + randomUUID() + '/cancel'])('sin sesión en %s exige 401', async suffix => {
    if (suffix === '' || suffix.endsWith('/cancel')) await request(app.getHttpServer()).post('/api/v1/contact-intents' + suffix).send({}).expect(401);
    else await request(app.getHttpServer()).get('/api/v1/contact-intents' + suffix).expect(401);
  });
  it('sin capability rechaza lectura y escritura', async () => {
    const owner = await actor(); jest.spyOn(app.get(SessionsService), 'findIdentity').mockResolvedValue({ ...owner, role: 'UNKNOWN' } as never);
    await post(owner.cookie, {}).expect(403); await request(app.getHttpServer()).get('/api/v1/contact-intents').set('Cookie', owner.cookie).expect(403);
    await post(owner.cookie, { expectedVersion: 1 }, '/' + randomUUID() + '/cancel').expect(403);
  });
  it.each([{}, { purpose: '' }, { purpose: ' \n ' }, { purpose: 'x'.repeat(5001) }, { purpose: 'Meta', organizationId: 'bad' },
    { purpose: 'Meta', organizationId: randomUUID(), personId: randomUUID() }, { purpose: 'Meta', organizationId: null }])('rechaza DTO/objetivo inválido %j', async body => {
    const owner = await actor(); await post(owner.cookie, body).expect(400);
  });
  it.each(['authorUserId', 'createdAt', 'state', 'auditor'])('rechaza mass assignment de %s', async field => {
    const owner = await actor(); await post(owner.cookie, { ...await target(owner.id), purpose: 'Meta', [field]: owner.id }).expect(400);
  });
  it.each(['organization', 'person'] as const)('rechaza %s inexistente', async kind => {
    const owner = await actor(); await post(owner.cookie, { purpose: 'Meta', [kind + 'Id']: randomUUID() }).expect(409);
  });
  it('rechaza fichas inactivas/consolidadas y personas con vínculo vigente', async () => {
    const owner = await actor(), organization = await target(owner.id), person = await target(owner.id, 'person');
    await prisma.organization.update({ where: { id: organization.organizationId }, data: { isActive: false } });
    await post(owner.cookie, { ...organization, purpose: 'Meta' }).expect(409);
    await prisma.organization.update({ where: { id: organization.organizationId }, data: { isActive: true } });
    await app.get(PeopleService).createRelation(person.personId!, { organizationId: organization.organizationId!, isCurrent: true }, owner.id);
    await post(owner.cookie, { ...person, purpose: 'Meta' }).expect(409);
    const principal = await target(owner.id);
    await prisma.organization.update({ where: { id: organization.organizationId }, data: { duplicateOfId: principal.organizationId } });
    await post(owner.cookie, { ...organization, purpose: 'Meta' }).expect(409);
  });
  it('lista páginas deterministas, filtros y detalle inexistente', async () => {
    const owner = await actor(); const a = await create(owner), b = await create(owner), c = await create(owner);
    const date = new Date(); await prisma.contactIntent.updateMany({ where: { id: { in: [a.id, b.id, c.id] } }, data: { createdAt: date, updatedAt: date, lastActivityAt: date } });
    const ids: string[] = [];
    for (let page = 1; page <= 3; page++) {
      const response = await request(app.getHttpServer()).get('/api/v1/contact-intents').set('Cookie', owner.cookie).query({ page, pageSize: 1, authorUserId: owner.id }).expect(200);
      const body = response.body as ContactIntentPageDto; expect(body.total).toBe(3); ids.push(body.items[0].id);
    }
    expect(ids).toEqual([a.id, b.id, c.id].sort().reverse());
    await request(app.getHttpServer()).get('/api/v1/contact-intents/' + randomUUID()).set('Cookie', owner.cookie).expect(404);
    await request(app.getHttpServer()).get('/api/v1/contact-intents/bad').set('Cookie', owner.cookie).expect(400);
  });
  it.each([{ page: 0 }, { pageSize: 101 }, { state: 'bad' }, { authorUserId: 'bad' }, { unexpected: true }])('rechaza filtros %j', async query => {
    const owner = await actor(); await request(app.getHttpServer()).get('/api/v1/contact-intents').set('Cookie', owner.cookie).query(query).expect(400);
  });
  it.each(Object.values(UserRole))('%s cancela propia con historial', async role => {
    const owner = await actor(role), row = await create(owner);
    const response = await post(owner.cookie, { expectedVersion: 1 }, '/' + row.id + '/cancel').expect(201);
    expect(response.body as ContactIntentDto).toMatchObject({ state: 'CANCELLED', version: 2, cancelledBy: { id: owner.id }, purpose: row.purpose, target: row.target, canCancel: false });
    const cancelled = response.body as ContactIntentDto;
    expect(cancelled.cancelledAt).toBe(cancelled.lastActivityAt); expect(cancelled.updatedAt).toBe(cancelled.lastActivityAt);
    expect(+new Date(cancelled.lastActivityAt)).toBeGreaterThanOrEqual(+new Date(row.createdAt));
    expect(await prisma.auditEvent.count({ where: { contactIntentId: row.id } })).toBe(2);
  });
  it.each(Object.values(UserRole))('%s cancelación ajena respeta política', async role => {
    const owner = await actor(), other = await actor(role), row = await create(owner);
    const allowed = role === UserRole.ADMINISTRATOR || role === UserRole.BOARD;
    const detail = await intents.get(row.id, other.id); expect(detail.canCancel).toBe(allowed);
    await post(other.cookie, { expectedVersion: 1 }, '/' + row.id + '/cancel').expect(allowed ? 201 : 403);
  });
  it('rechaza segunda cancelación y versión obsoleta sin duplicar auditoría', async () => {
    const owner = await actor(), row = await create(owner);
    await intents.cancel(row.id, 1, owner.id);
    await post(owner.cookie, { expectedVersion: 1 }, '/' + row.id + '/cancel').expect(409);
    await post(owner.cookie, { expectedVersion: 2 }, '/' + row.id + '/cancel').expect(409);
    expect(await prisma.auditEvent.count({ where: { contactIntentId: row.id, action: AuditAction.CONTACT_INTENT_CANCELLED } })).toBe(1);
  });
  it.each([{}, { expectedVersion: 0 }, { expectedVersion: 1.5 }, { expectedVersion: 1, authorUserId: randomUUID() }])('cancelación rechaza entrada %j', async body => {
    const owner = await actor(), row = await create(owner);
    await post(owner.cookie, body, '/' + row.id + '/cancel').expect(400);
    expect((await intents.get(row.id, owner.id)).state).toBe('ACTIVE');
  });
  it('cancelación de intención inexistente devuelve 404', async () => {
    const owner = await actor(); await post(owner.cookie, { expectedVersion: 1 }, '/' + randomUUID() + '/cancel').expect(404);
  });
  it.each([ContactIntentState.CONVERTED, ContactIntentState.CLOSED])('no cancela estado reservado %s', async state => {
    const owner = await actor(), row = await create(owner); await prisma.contactIntent.update({ where: { id: row.id }, data: { state } });
    await post(owner.cookie, { expectedVersion: 1 }, '/' + row.id + '/cancel').expect(409);
  });
  it('dos cancelaciones concurrentes dejan una sola actuación', async () => {
    const owner = await actor(), other = await actor(UserRole.BOARD), row = await create(owner);
    const results = await Promise.allSettled([intents.cancel(row.id, 1, owner.id), intents.cancel(row.id, 1, other.id)]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    expect(await prisma.auditEvent.count({ where: { contactIntentId: row.id } })).toBe(2);
    expect(await prisma.contactIntent.findUnique({ where: { id: row.id } })).toMatchObject({ state: 'CANCELLED', version: 2 });
  });
  it('desactivación invalida sesión y preserva autor histórico', async () => {
    const admin = await actor(), owner = await actor(UserRole.RESEARCH), row = await create(owner);
    await app.get(UserAccessService).deactivate(owner.id, admin.id);
    await request(app.getHttpServer()).get('/api/v1/contact-intents').set('Cookie', owner.cookie).expect(401);
    await expect(intents.cancel(row.id, 1, owner.id)).rejects.toThrow('FORBIDDEN');
    expect((await intents.get(row.id, admin.id)).author).toMatchObject({ id: owner.id, isActive: false });
  });
  it('revalida cambio de rol posterior al guard/identidad HTTP', async () => {
    const owner = await actor(), other = await actor(UserRole.BOARD), row = await create(owner);
    const stale = await users.findIdentityById(other.id);
    await prisma.user.update({ where: { id: other.id }, data: { role: UserRole.RESEARCH } });
    jest.spyOn(app.get(SessionsService), 'findIdentity').mockResolvedValue(stale);
    await post(other.cookie, { expectedVersion: 1 }, '/' + row.id + '/cancel').expect(403);
  });
  it('la antigüedad no elimina la intención y el objetivo inactivo sigue consultable', async () => {
    const owner = await actor(), row = await create(owner), oldDate = new Date('2020-01-01T00:00:00Z');
    await prisma.contactIntent.update({ where: { id: row.id }, data: { createdAt: oldDate, updatedAt: oldDate, lastActivityAt: oldDate } });
    await prisma.organization.update({ where: { id: row.target.id }, data: { isActive: false } });
    expect(await intents.get(row.id, owner.id)).toMatchObject({ state: 'ACTIVE', target: { id: row.target.id, isActive: false }, createdAt: oldDate.toISOString() });
    expect((await intents.list({ page: 1, pageSize: 25, state: 'all', authorUserId: owner.id }, owner.id)).items).toHaveLength(1);
  });
  it('fallo de auditoría revierte creación y cancelación', async () => {
    const owner = await actor(), goal = await target(owner.id);
    const spy = jest.spyOn(app.get(AuditService), 'recordContactIntent').mockRejectedValue(new Error('QA rollback'));
    await expect(intents.create({ ...goal, purpose: 'Meta' }, owner.id)).rejects.toThrow('QA rollback');
    expect(await prisma.contactIntent.count({ where: { authorUserId: owner.id } })).toBe(0); spy.mockRestore();
    const row = await intents.create({ ...goal, purpose: 'Meta' }, owner.id);
    jest.spyOn(app.get(AuditService), 'recordContactIntent').mockRejectedValue(new Error('QA rollback'));
    await expect(intents.cancel(row.id, 1, owner.id)).rejects.toThrow('QA rollback');
    expect(await prisma.contactIntent.findUnique({ where: { id: row.id } })).toMatchObject({ state: 'ACTIVE', version: 1, cancelledAt: null });
  });
  it('constraints y FK protegen persistencia y no hay borrado/edición/conversión HTTP', async () => {
    const owner = await actor(), row = await create(owner), person = await target(owner.id, 'person');
    await expect(prisma.contactIntent.create({ data: { purpose: 'Meta', authorUserId: owner.id } })).rejects.toThrow();
    await expect(prisma.contactIntent.create({ data: { purpose: 'Meta', authorUserId: owner.id, organizationId: row.target.id, ...person } })).rejects.toThrow();
    await expect(prisma.contactIntent.create({ data: { purpose: 'Meta', authorUserId: randomUUID(), organizationId: row.target.id } })).rejects.toThrow();
    await expect(prisma.contactIntent.create({ data: { purpose: 'Meta', authorUserId: owner.id, organizationId: randomUUID() } })).rejects.toThrow();
    await expect(prisma.contactIntent.create({ data: { purpose: 'Meta', authorUserId: owner.id, personId: randomUUID() } })).rejects.toThrow();
    await expect(prisma.contactIntent.create({ data: { purpose: '\n\t ', authorUserId: owner.id, organizationId: row.target.id } })).rejects.toThrow();
    await expect(prisma.contactIntent.update({ where: { id: row.id }, data: { version: 0 } })).rejects.toThrow();
    await expect(prisma.contactIntent.update({ where: { id: row.id }, data: { state: 'CANCELLED' } })).rejects.toThrow();
    await expect(prisma.organization.delete({ where: { id: row.target.id } })).rejects.toThrow();
    await expect(prisma.user.delete({ where: { id: owner.id } })).rejects.toThrow();
    await expect(prisma.auditEvent.create({ data: { action: 'CONTACT_INTENT_CREATED', actorUserId: owner.id, operationId: randomUUID() } })).rejects.toThrow();
    await expect(prisma.auditEvent.create({ data: { action: 'CONTACT_INTENT_CANCELLED', actorUserId: owner.id, contactIntentId: row.id, operationId: randomUUID(), targetUserId: owner.id } })).rejects.toThrow();
    for (const method of ['delete', 'patch', 'put'] as const) await request(app.getHttpServer())[method]('/api/v1/contact-intents/' + row.id).set('Cookie', owner.cookie).send({}).expect(404);
    await post(owner.cookie, {}, '/' + row.id + '/convert').expect(400);
    await post(owner.cookie, {}, '/' + row.id + '/close').expect(404);
  });
});
