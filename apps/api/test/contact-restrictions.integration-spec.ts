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
import { AuditAction, UserRole } from '../src/generated/prisma/client';
import { UsersService } from '../src/modules/users/users.service';
import { SessionsService } from '../src/modules/auth/sessions.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { DirectoryService } from '../src/modules/directory/directory.service';
import { PeopleService } from '../src/modules/directory/people.service';

import { ContactIntentsService } from '../src/modules/relationships/contact-intents.service';
import { RelationshipProcessesService } from '../src/modules/relationships/relationship-processes.service';
import { ContactRestrictionsService } from '../src/modules/relationships/contact-restrictions.service';
import type { ContactRestrictionDto, ContactRestrictionPageDto } from '../src/modules/relationships/contact-restriction.dto';

const databaseUrl = validateDatabaseUrl(process.env.DATABASE_URL);
if (!new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('Procesos requieren una base aislada _test.');

describe('Restricciones explícitas PostgreSQL/HTTP', () => {
  let app: INestApplication<Server>, prisma: PrismaService, users: UsersService, processes: RelationshipProcessesService;
  const userIds: string[] = [], orgIds: string[] = [], personIds: string[] = [];
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ConfigService)
      .useValue(new ConfigService(validateEnvironment({ NODE_ENV: 'test', DATABASE_URL: databaseUrl }))).compile();
    app = module.createNestApplication<INestApplication<Server>>(); configureApplication(app); await app.init();
    prisma = app.get(PrismaService); users = app.get(UsersService); processes = app.get(RelationshipProcessesService);
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await prisma.$transaction([
      prisma.auditEvent.deleteMany({ where: { actorUserId: { in: userIds } } }),
      prisma.relationshipProcessEvent.deleteMany({ where: { process: { createdByUserId: { in: userIds } } } }),
      prisma.processParticipant.deleteMany({ where: { process: { createdByUserId: { in: userIds } } } }),
      prisma.contactRestriction.deleteMany({ where: { registeredByUserId: { in: userIds } } }),
      prisma.relationshipProcess.deleteMany({ where: { createdByUserId: { in: userIds } } }),
      prisma.contactIntent.deleteMany({ where: { authorUserId: { in: userIds } } }),
      prisma.directoryChange.deleteMany({ where: { actorUserId: { in: userIds } } }),
      prisma.personOrganizationRelation.deleteMany({ where: { personId: { in: personIds } } }),
      prisma.person.updateMany({ where: { id: { in: personIds } }, data: { duplicateOfId: null } }),
      prisma.person.deleteMany({ where: { id: { in: personIds } } }),
      prisma.organization.updateMany({ where: { id: { in: orgIds } }, data: { duplicateOfId: null } }),
      prisma.organization.deleteMany({ where: { id: { in: orgIds } } }),
      prisma.userSession.deleteMany({ where: { userId: { in: userIds } } }),
      prisma.user.deleteMany({ where: { id: { in: userIds } } }),
    ]); userIds.length = orgIds.length = personIds.length = 0;
  });
  afterAll(async () => { await app.close(); });
  async function actor(role: UserRole = UserRole.ADMINISTRATOR) {
    const row = await users.createIdentity({ givenNames: 'QA', familyNames: 'Procesos', role, email: randomUUID() + '@example.test' }); userIds.push(row.id);
    const token = await prisma.$transaction(tx => app.get(SessionsService).create(row.id, tx));
    return { ...row, cookie: 'cecasem_session=' + token };
  }
  async function target(authorId: string, kind: 'organization' | 'person' = 'organization') {
    if (kind === 'organization') { const row = await app.get(DirectoryService).createOrganization({ name: 'Actor QA' }, authorId); orgIds.push(row.id); return { organizationId: row.id }; }
    const row = await app.get(PeopleService).create({ displayName: 'Persona independiente QA' }, authorId); personIds.push(row.id); return { personId: row.id };
  }
  function get(cookie: string, suffix = '') { return request(app.getHttpServer()).get('/api/v1/relationship-processes' + suffix).set('Cookie', cookie); }
  async function create(owner: Awaited<ReturnType<typeof actor>>, kind: 'organization' | 'person' = 'organization') {
    return processes.create({ ...await target(owner.id, kind), purpose: 'Propuesta de cooperación' }, owner.id);
  }

  const restrictions = () => app.get(ContactRestrictionsService);
  function restrictionPost(cookie: string, body: object, suffix = '') { return request(app.getHttpServer()).post('/api/v1/contact-restrictions' + suffix).set('Cookie', cookie).send(body); }
  async function register(owner: Awaited<ReturnType<typeof actor>>, kind: 'organization' | 'person' = 'organization') {
    return restrictions().create({ ...await target(owner.id, kind), reason: 'Solicitud expresa\nNo volver a contactar' }, owner.id);
  }
  it.each(Object.values(UserRole))('%s registra y consulta con auditoría', async role => {
    const owner = await actor(role), goal = await target(owner.id);
    const row = (await restrictionPost(owner.cookie, { ...goal, reason: ' No contactar ' }).expect(201)).body as ContactRestrictionDto;
    expect(row).toMatchObject({ reason: 'No contactar', state: 'ACTIVE', version: 1, liftedAt: null, liftedBy: null, liftReason: null, registeredBy: { id: owner.id } });
    expect(row.canLift).toBe(role === 'ADMINISTRATOR' || role === 'BOARD');
    await request(app.getHttpServer()).get('/api/v1/contact-restrictions/' + row.id).set('Cookie', owner.cookie).expect(200);
    const audit = await prisma.auditEvent.findFirstOrThrow({ where: { contactRestrictionId: row.id }, include: { contactRestriction: true } });
    expect(audit).toMatchObject({ action: 'CONTACT_RESTRICTION_CREATED', actorUserId: owner.id, contactRestriction: { reason: row.reason, organizationId: goal.organizationId } });
  });
  it.each(Object.values(UserRole))('%s levantamiento según matriz', async role => {
    const owner = await actor(UserRole.RESEARCH), other = await actor(role), row = await register(owner), allowed = role === 'ADMINISTRATOR' || role === 'BOARD';
    const response = await restrictionPost(other.cookie, { expectedVersion: 1, reason: 'Decisión autorizada' }, '/' + row.id + '/lift').expect(allowed ? 201 : 403);
    if (allowed) {
      expect(response.body).toMatchObject({ state: 'LIFTED', version: 2, reason: row.reason, registeredBy: row.registeredBy, liftedBy: { id: other.id }, liftReason: 'Decisión autorizada', canLift: false });
      expect(await prisma.auditEvent.count({ where: { contactRestrictionId: row.id } })).toBe(2);
      await restrictionPost(other.cookie, { expectedVersion: 2, reason: 'Repetición' }, '/' + row.id + '/lift').expect(409);
    } else expect(await restrictions().get(row.id, owner.id)).toEqual(row);
  });
  it.each(['organization', 'person'] as const)('bloquea tres operaciones sobre %s sin modificar historia; levantar permite retomar', async kind => {
    const owner = await actor(), goal = await target(owner.id, kind), intent = await app.get(ContactIntentsService).create({ ...goal, purpose: 'Objetivo previo' }, owner.id);
    const process = await processes.create({ ...goal, purpose: 'Proceso previo' }, owner.id), row = await restrictions().create({ ...goal, reason: 'No contactar' }, owner.id);
    for (const [path, body] of [['contact-intents', { ...goal, purpose: 'Nuevo' }], ['relationship-processes', { ...goal, purpose: 'Nuevo' }], ['contact-intents/' + intent.id + '/convert', { expectedVersion: 1 }]] as const) {
      const response = await request(app.getHttpServer()).post('/api/v1/' + path).set('Cookie', owner.cookie).send(body).expect(409);
      expect(response.body).toMatchObject({ code: 'CONTACT_RESTRICTED' });
    }
    expect(await app.get(ContactIntentsService).get(intent.id, owner.id)).toEqual(intent); expect(await processes.get(process.id, owner.id)).toEqual(process);
    await request(app.getHttpServer()).get('/api/v1/' + (kind === 'organization' ? 'organizations/' : 'people/') + row.target.id).set('Cookie', owner.cookie).expect(200);
    await get(owner.cookie, '/' + process.id + '/events').expect(200);
    await restrictions().lift(row.id, { expectedVersion: 1, reason: 'Contacto autorizado de nuevo' }, owner.id);
    await app.get(ContactIntentsService).create({ ...goal, purpose: 'Nuevo' }, owner.id);
    await processes.create({ ...goal, purpose: 'Nuevo' }, owner.id);
    await app.get(ContactIntentsService).convert(intent.id, 1, owner.id);
    expect((await restrictions().get(row.id, owner.id)).state).toBe('LIFTED');
    const newer = await restrictions().create({ ...goal, reason: 'Nueva solicitud expresa' }, owner.id);
    expect(newer.id).not.toBe(row.id);
  });
  it('no propaga a matriz, sede o antiguos vínculos personales', async () => {
    const owner = await actor(), parent = await target(owner.id), child = await app.get(DirectoryService).createOrganization({ name: 'Sede QA', parentId: parent.organizationId }, owner.id);
    orgIds.push(child.id);
    await restrictions().create({ ...parent, reason: 'Solo matriz' }, owner.id);
    await processes.create({ organizationId: child.id, purpose: 'Sede con objetivo propio' }, owner.id);
    const person = await target(owner.id, 'person');
    await app.get(PeopleService).createRelation(person.personId!, { organizationId: child.id, isCurrent: false }, owner.id);
    await restrictions().create({ ...person, reason: 'Solo persona independiente' }, owner.id);
    await processes.create({ organizationId: child.id, purpose: 'Organización sin restricción personal' }, owner.id);
  });
  it('rechazo y ausencia de respuesta nunca crean restricciones', async () => {
    const owner = await actor();
    for (const result of ['REJECTED', 'NO_RESPONSE'] as const) { const row = await create(owner); await processes.close(row.id, { expectedVersion: 1, result }, owner.id); }
    expect(await prisma.contactRestriction.count({ where: { registeredByUserId: owner.id } })).toBe(0);
  });
  it.each([{}, { reason: '' }, { reason: ' \n ' }, { reason: 'x'.repeat(5001) }, { reason: 'Motivo', organizationId: 'bad' }, { reason: 'Motivo', organizationId: randomUUID(), personId: randomUUID() }, { reason: 'Motivo', personId: null }])('registro inválido %j', async body => {
    const owner = await actor(); await restrictionPost(owner.cookie, body).expect(400);
  });
  it.each(['registeredByUserId', 'liftedByUserId', 'state', 'version', 'createdAt', 'liftedAt'])('rechaza mass assignment %s', async field => {
    const owner = await actor(), goal = await target(owner.id); await restrictionPost(owner.cookie, { ...goal, reason: 'Motivo', [field]: owner.id }).expect(400);
  });
  it.each(['organization', 'person'] as const)('objetivo %s ausente o inactivo se rechaza', async kind => {
    const owner = await actor(); await restrictionPost(owner.cookie, { [kind + 'Id']: randomUUID(), reason: 'Motivo' }).expect(409);
    const goal = await target(owner.id, kind);
    if (kind === 'organization') await prisma.organization.update({ where: { id: goal.organizationId }, data: { isActive: false } });
    else await prisma.person.update({ where: { id: goal.personId }, data: { isActive: false } });
    await restrictionPost(owner.cookie, { ...goal, reason: 'Motivo' }).expect(409);
  });
  it('persona vinculada vigente no admite restricción independiente', async () => {
    const owner = await actor(), person = await target(owner.id, 'person'), org = await target(owner.id);
    await app.get(PeopleService).createRelation(person.personId!, { organizationId: org.organizationId!, isCurrent: true }, owner.id);
    await restrictionPost(owner.cookie, { ...person, reason: 'Motivo' }).expect(409);
  });
  it.each([{}, { expectedVersion: 1, reason: '' }, { expectedVersion: 0, reason: 'Motivo' }, { expectedVersion: 1, reason: ' \n ' }, { expectedVersion: 1, reason: 'Motivo', liftedByUserId: randomUUID() }])('levantamiento inválido %j', async body => {
    const owner = await actor(), row = await register(owner); await restrictionPost(owner.cookie, body, '/' + row.id + '/lift').expect(400);
  });
  it('versión obsoleta 409, desconocida 404, sin sesión 401, sin capability 403', async () => {
    const owner = await actor(), row = await register(owner);
    expect((await restrictionPost(owner.cookie, { reason: 'Motivo', expectedVersion: 2 }, '/' + row.id + '/lift').expect(409)).body).toMatchObject({ code: 'VERSION_CONFLICT' });
    await restrictionPost(owner.cookie, { reason: 'Motivo', expectedVersion: 1 }, '/' + randomUUID() + '/lift').expect(404);
    await request(app.getHttpServer()).get('/api/v1/contact-restrictions').expect(401);
    await request(app.getHttpServer()).post('/api/v1/contact-restrictions').send({}).expect(401);
    jest.spyOn(app.get(SessionsService), 'findIdentity').mockResolvedValue({ ...owner, role: 'UNKNOWN' } as never);
    await restrictionPost(owner.cookie, {}).expect(403);
    await request(app.getHttpServer()).get('/api/v1/contact-restrictions').set('Cookie', owner.cookie).expect(403);
  });
  it.each(['organization', 'person'] as const)('duplica solo historial levantado y protege altas concurrentes de %s', async kind => {
    const owner = await actor(), other = await actor(UserRole.BOARD), goal = await target(owner.id, kind);
    const results = await Promise.all([restrictionPost(owner.cookie, { ...goal, reason: 'Primera' }), restrictionPost(other.cookie, { ...goal, reason: 'Segunda' })]);
    expect(results.map(result => result.status).sort()).toEqual([201, 409]);
    expect(await prisma.contactRestriction.count({ where: { ...goal, state: 'ACTIVE' } })).toBe(1);
    const row = await prisma.contactRestriction.findFirstOrThrow({ where: goal });
    const lifted = await Promise.all([restrictionPost(owner.cookie, { reason: 'Decisión A', expectedVersion: 1 }, '/' + row.id + '/lift'), restrictionPost(other.cookie, { reason: 'Decisión B', expectedVersion: 1 }, '/' + row.id + '/lift')]);
    expect(lifted.map(result => result.status).sort()).toEqual([201, 409]);
    expect(await prisma.auditEvent.count({ where: { contactRestrictionId: row.id, action: 'CONTACT_RESTRICTION_LIFTED' } })).toBe(1);
    await restrictions().create({ ...goal, reason: 'Otra solicitud explícita' }, owner.id);
    expect(await prisma.contactRestriction.count({ where: goal })).toBe(2);
  });
  it.each(['intent', 'process', 'convert'])('alta vs %s: restricción primero bloquea la actuación completa', async operation => {
    const owner = await actor(), other = await actor(UserRole.BOARD), goal = await target(owner.id), intent = operation === 'convert' ? await app.get(ContactIntentsService).create({ ...goal, purpose: 'Previo' }, owner.id) : null;
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; }), ready = new Promise<void>(resolve => { entered = resolve; });
    const original = restrictions().getActiveRestriction.bind(restrictions());
    let first = true;
    jest.spyOn(restrictions(), 'getActiveRestriction').mockImplementation(async (target, tx) => {
      const row = await original(target, tx); if (first) { first = false; entered(); await gate; } return row;
    });
    const restriction = restrictions().create({ ...goal, reason: 'Solicitud expresa' }, owner.id);
    await ready;
    const outreach = operation === 'intent' ? app.get(ContactIntentsService).create({ ...goal, purpose: 'Nuevo' }, other.id) : operation === 'process' ? processes.create({ ...goal, purpose: 'Nuevo' }, other.id) : app.get(ContactIntentsService).convert(intent!.id, 1, other.id);
    const observed = outreach.then(() => 'UNEXPECTED', error => (error as Error).message);
    try {
      let waiting = false;
      for (let attempt = 0; attempt < 100 && !waiting; attempt++) {
        const rows = await prisma.$queryRaw<{ waiting: boolean }[]>`SELECT EXISTS (SELECT 1 FROM pg_locks WHERE classid=1128612693 AND NOT granted) AS waiting`;
        waiting = rows[0].waiting;
      }
      expect(waiting).toBe(true);
    } finally { release(); }
    await restriction; expect(await observed).toBe('CONTACT_RESTRICTED');
    expect(await prisma.relationshipProcess.count({ where: { createdByUserId: other.id } })).toBe(0);
    if (intent) expect((await app.get(ContactIntentsService).get(intent.id, owner.id)).state).toBe('ACTIVE');
  });
  it.each(['intent', 'process', 'convert'])('%s primero se confirma; alta posterior no lo reescribe', async operation => {
    const owner = await actor(), other = await actor(UserRole.BOARD), goal = await target(owner.id), intent = operation === 'convert' ? await app.get(ContactIntentsService).create({ ...goal, purpose: 'Previo' }, owner.id) : null;
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; }), ready = new Promise<void>(resolve => { entered = resolve; });
    const original = restrictions().assertContactAllowed.bind(restrictions());
    jest.spyOn(restrictions(), 'assertContactAllowed').mockImplementation(async (target, tx) => { await original(target, tx); entered(); await gate; });
    const outreach = operation === 'intent' ? app.get(ContactIntentsService).create({ ...goal, purpose: 'Nuevo' }, owner.id) : operation === 'process' ? processes.create({ ...goal, purpose: 'Nuevo' }, owner.id) : app.get(ContactIntentsService).convert(intent!.id, 1, owner.id);
    await ready; const restriction = restrictions().create({ ...goal, reason: 'Solicitud posterior' }, other.id); release();
    const result = await outreach; await restriction;
    expect(result).toBeDefined(); if (intent) expect((await app.get(ContactIntentsService).get(intent.id, owner.id)).state).toBe('CONVERTED');
  });
  it('levantamiento concurrente mantiene lock hasta confirmar y permite acercamiento después', async () => {
    const owner = await actor(), other = await actor(UserRole.BOARD), row = await register(owner), original = app.get(AuditService).recordContactRestriction.bind(app.get(AuditService));
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; }), ready = new Promise<void>(resolve => { entered = resolve; });
    jest.spyOn(app.get(AuditService), 'recordContactRestriction').mockImplementation(async (...args) => { const result = await original(...args); entered(); await gate; return result; });
    const lifting = restrictions().lift(row.id, { reason: 'Autorizado', expectedVersion: 1 }, owner.id); await ready;
    const outreach = processes.create({ organizationId: row.target.id, purpose: 'Después de levantar' }, other.id); release();
    await lifting; expect((await outreach).state).toBe('PREPARATION');
  });
  it.each(['create', 'lift'])('auditoría fallida revierte %s', async operation => {
    const owner = await actor(), goal = await target(owner.id), row = operation === 'lift' ? await restrictions().create({ ...goal, reason: 'No contactar' }, owner.id) : null;
    jest.spyOn(app.get(AuditService), 'recordContactRestriction').mockRejectedValue(new Error('QA auditoría'));
    await expect(row ? restrictions().lift(row.id, { reason: 'Decisión', expectedVersion: 1 }, owner.id) : restrictions().create({ ...goal, reason: 'No contactar' }, owner.id)).rejects.toThrow('QA auditoría');
    if (row) expect(await restrictions().get(row.id, owner.id)).toEqual(row); else expect(await prisma.contactRestriction.count({ where: goal })).toBe(0);
  });
  it('desactivación y cambio de rol revalidan autorización sin perder historia', async () => {
    const owner = await actor(UserRole.RESEARCH), board = await actor(UserRole.BOARD), admin = await actor(), row = await register(owner), stale = await users.findIdentityById(board.id);
    await prisma.user.update({ where: { id: board.id }, data: { role: 'PLANNING' } }); jest.spyOn(app.get(SessionsService), 'findIdentity').mockResolvedValue(stale);
    await restrictionPost(board.cookie, { reason: 'Decisión', expectedVersion: 1 }, '/' + row.id + '/lift').expect(403); jest.restoreAllMocks();
    await prisma.user.update({ where: { id: owner.id }, data: { isActive: false, deactivatedAt: new Date() } });
    await expect(restrictions().create({ organizationId: row.target.id, reason: 'Otra' }, owner.id)).rejects.toThrow('FORBIDDEN');
    await prisma.organization.update({ where: { id: row.target.id }, data: { isActive: false } });
    const next = await restrictions().lift(row.id, { reason: 'Decisión institucional', expectedVersion: 1 }, admin.id);
    expect(next).toMatchObject({ registeredBy: { id: owner.id, isActive: false }, target: { isActive: false }, reason: row.reason });
  });
  it('listado paginado y filtrado conserva historia', async () => {
    const owner = await actor(), first = await register(owner); await restrictions().lift(first.id, { reason: 'Decisión', expectedVersion: 1 }, owner.id);
    await restrictions().create({ organizationId: first.target.id, reason: 'Nueva solicitud' }, owner.id);
    const response = await request(app.getHttpServer()).get('/api/v1/contact-restrictions').set('Cookie', owner.cookie).query({ organizationId: first.target.id, pageSize: 1, page: 2 }).expect(200);
    expect(response.body as ContactRestrictionPageDto).toMatchObject({ total: 2, page: 2, pageSize: 1, items: [{ id: first.id, state: 'LIFTED' }] });
    expect((await restrictions().list({ page: 1, pageSize: 25, state: 'ACTIVE', organizationId: first.target.id }, owner.id)).total).toBe(1);
    await request(app.getHttpServer()).get('/api/v1/contact-restrictions').set('Cookie', owner.cookie).query({ pageSize: 101 }).expect(400);
  });
  it('constraints, FK y falta de edición/eliminación histórica', async () => {
    const owner = await actor(), row = await register(owner), person = await target(owner.id, 'person');
    const base = { organizationId: row.target.id, reason: 'Motivo', registeredByUserId: owner.id };
    for (const patch of [{ organizationId: undefined }, { personId: person.personId }, { reason: ' \n ' }, { version: 0 }, { organizationId: randomUUID() }, { state: 'LIFTED' as const }]) await expect(prisma.contactRestriction.create({ data: { ...base, ...patch } })).rejects.toThrow();
    await expect(prisma.contactRestriction.create({ data: base })).rejects.toThrow();
    await expect(prisma.auditEvent.create({ data: { action: AuditAction.CONTACT_RESTRICTION_CREATED, actorUserId: owner.id, contactRestrictionId: row.id, operationId: randomUUID() } })).rejects.toThrow();
    await expect(prisma.organization.delete({ where: { id: row.target.id } })).rejects.toThrow(); await expect(prisma.user.delete({ where: { id: owner.id } })).rejects.toThrow();
    for (const method of ['delete', 'patch', 'put'] as const) await request(app.getHttpServer())[method]('/api/v1/contact-restrictions/' + row.id).set('Cookie', owner.cookie).send({}).expect(404);
  });
});
