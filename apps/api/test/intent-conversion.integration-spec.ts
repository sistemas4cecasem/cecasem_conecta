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
import { AuditAction, ParticipantOrigin, UserRole } from '../src/generated/prisma/client';
import { UsersService } from '../src/modules/users/users.service';
import { SessionsService } from '../src/modules/auth/sessions.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { DirectoryService } from '../src/modules/directory/directory.service';
import { PeopleService } from '../src/modules/directory/people.service';
import { ContactIntentsService } from '../src/modules/relationships/contact-intents.service';
import { RelationshipProcessesService } from '../src/modules/relationships/relationship-processes.service';
import { ProcessParticipationService } from '../src/modules/relationships/process-participation.service';
import type { ConvertedContactIntentDto } from '../src/modules/relationships/contact-intent.dto';
const databaseUrl = validateDatabaseUrl(process.env.DATABASE_URL);
if (!new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('Procesos requieren una base aislada _test.');

describe('Participación y conversión PostgreSQL/HTTP', () => {
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
  function post(cookie: string, body: object, suffix = '') { return request(app.getHttpServer()).post('/api/v1/relationship-processes' + suffix).set('Cookie', cookie).send(body); }
  function get(cookie: string, suffix = '') { return request(app.getHttpServer()).get('/api/v1/relationship-processes' + suffix).set('Cookie', cookie); }
  async function create(owner: Awaited<ReturnType<typeof actor>>, kind: 'organization' | 'person' = 'organization') {
    return processes.create({ ...await target(owner.id, kind), purpose: 'Propuesta de cooperación' }, owner.id);
  }
  const intentService = () => app.get(ContactIntentsService);
  async function intention(owner: Awaited<ReturnType<typeof actor>>, kind: 'organization' | 'person' = 'organization') {
    return intentService().create({ ...await target(owner.id, kind), purpose: 'Cooperación\nObjetivo específico' }, owner.id);
  }
  function convert(cookie: string, id: string, body: object = { expectedVersion: 1 }) {
    return request(app.getHttpServer()).post('/api/v1/contact-intents/' + id + '/convert').set('Cookie', cookie).send(body);
  }
  it.each(Object.values(UserRole))('%s convierte propia preservando actor y propósito', async role => {
    const owner = await actor(role), row = await intention(owner);
    const next = (await convert(owner.cookie, row.id).expect(201)).body as ConvertedContactIntentDto;
    expect(next.intent).toMatchObject({ state: 'CONVERTED', version: 2, author: row.author, target: row.target, purpose: row.purpose, processId: next.process.id, canCancel: false, canConvert: false });
    expect(next.process).toMatchObject({ state: 'PREPARATION', version: 1, purpose: row.purpose, target: row.target, sourceIntentId: row.id, createdBy: { id: owner.id } });
    expect(next.process.participants).toEqual([{ user: next.process.createdBy, origin: 'PROCESS_CREATOR', joinedAt: next.process.createdAt }]);
    expect(next.process.events).toHaveLength(1); expect(next.process.events[0]).toMatchObject({ type: 'CREATED', actor: { id: owner.id }, authority: 'PARTICIPANT' });
    expect(await prisma.auditEvent.count({ where: { contactIntentId: row.id, action: AuditAction.CONTACT_INTENT_CONVERTED, actorUserId: owner.id } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { processEvent: { processId: next.process.id }, action: AuditAction.PROCESS_CREATED } })).toBe(1);
  });
  it.each(Object.values(UserRole))('%s convierte ajena solo con excepción institucional', async role => {
    const owner = await actor(UserRole.RESEARCH), other = await actor(role), row = await intention(owner), allowed = role === UserRole.ADMINISTRATOR || role === UserRole.BOARD;
    expect((await intentService().get(row.id, other.id)).canConvert).toBe(allowed);
    const response = await convert(other.cookie, row.id).expect(allowed ? 201 : 403);
    if (allowed) {
      const next = response.body as ConvertedContactIntentDto;
      expect(next.intent.author.id).toBe(owner.id); expect(next.process.createdBy.id).toBe(other.id);
      expect(next.process.participants.map(item => item.user.id)).toEqual([other.id]);
      expect((await processes.get(next.process.id, owner.id)).canClose).toBe(false);
    } else expect((await intentService().get(row.id, owner.id)).state).toBe('ACTIVE');
  });
  it('convierte persona independiente y permite autor original inactivo', async () => {
    const owner = await actor(UserRole.RESEARCH), admin = await actor(), row = await intention(owner, 'person');
    await prisma.user.update({ where: { id: owner.id }, data: { isActive: false, deactivatedAt: new Date() } });
    const next = await intentService().convert(row.id, 1, admin.id);
    expect(next.intent.author).toMatchObject({ id: owner.id, isActive: false }); expect(next.process.target).toEqual(row.target);
  });
  it.each(['CANCELLED', 'CONVERTED', 'CLOSED'] as const)('rechaza intención %s', async state => {
    const owner = await actor(), row = await intention(owner);
    if (state === 'CANCELLED') await intentService().cancel(row.id, 1, owner.id);
    else if (state === 'CONVERTED') await intentService().convert(row.id, 1, owner.id);
    else await prisma.contactIntent.update({ where: { id: row.id }, data: { state, version: 2 } });
    expect((await convert(owner.cookie, row.id, { expectedVersion: 2 }).expect(409)).body).toMatchObject({ code: 'INTENT_NOT_ACTIVE' });
  });
  it('rechaza versión obsoleta y ficha no disponible sin crear proceso', async () => {
    const owner = await actor(), row = await intention(owner);
    expect((await convert(owner.cookie, row.id, { expectedVersion: 2 }).expect(409)).body).toMatchObject({ code: 'VERSION_CONFLICT' });
    await prisma.organization.update({ where: { id: row.target.id }, data: { isActive: false } });
    expect((await convert(owner.cookie, row.id).expect(409)).body).toMatchObject({ code: 'INTENT_TARGET_UNAVAILABLE' });
    expect(await prisma.relationshipProcess.count({ where: { sourceIntentId: row.id } })).toBe(0);
  });
  it('revalida persona con vínculo vigente desde creación de intención', async () => {
    const owner = await actor(), row = await intention(owner, 'person'), org = await target(owner.id);
    await app.get(PeopleService).createRelation(row.target.id, { organizationId: org.organizationId!, isCurrent: true }, owner.id);
    await convert(owner.cookie, row.id).expect(409); expect((await intentService().get(row.id, owner.id)).state).toBe('ACTIVE');
  });
  it('sin sesión 401, ausente 404, sin capability 403', async () => {
    await request(app.getHttpServer()).post('/api/v1/contact-intents/' + randomUUID() + '/convert').send({ expectedVersion: 1 }).expect(401);
    const owner = await actor(); await convert(owner.cookie, randomUUID()).expect(404);
    jest.spyOn(app.get(SessionsService), 'findIdentity').mockResolvedValue({ ...owner, role: 'UNKNOWN' } as never);
    await convert(owner.cookie, randomUUID()).expect(403);
  });
  it.each([{}, { expectedVersion: 0 }, { expectedVersion: 1.5 }, { expectedVersion: '1' }, { expectedVersion: null }])('DTO inválido %j', async body => {
    const owner = await actor(), row = await intention(owner); await convert(owner.cookie, row.id, body).expect(400);
  });
  it.each(['authorUserId', 'createdByUserId', 'processId', 'state', 'participants', 'createdAt', 'purpose', 'organizationId'])('impide mass assignment %s', async field => {
    const owner = await actor(), row = await intention(owner); await convert(owner.cookie, row.id, { expectedVersion: 1, [field]: owner.id }).expect(400);
  });
  it.each(['convert-convert', 'convert-cancel'])('concurrencia %s solo tiene un ganador', async kind => {
    const owner = await actor(UserRole.RESEARCH), other = await actor(UserRole.BOARD), row = await intention(owner);
    const responses = await Promise.all([convert(owner.cookie, row.id), kind === 'convert-convert' ? convert(other.cookie, row.id) :
      request(app.getHttpServer()).post('/api/v1/contact-intents/' + row.id + '/cancel').set('Cookie', other.cookie).send({ expectedVersion: 1 })]);
    expect(responses.map(response => response.status).sort()).toEqual([201, 409]);
    const processesForIntent = await prisma.relationshipProcess.findMany({ where: { sourceIntentId: row.id }, include: { participants: true, events: true } });
    expect(processesForIntent.length).toBe(kind === 'convert-convert' ? 1 : responses[0].status === 201 ? 1 : 0);
    if (processesForIntent.length) { expect(processesForIntent[0].participants).toHaveLength(1); expect(processesForIntent[0].events).toHaveLength(1); }
    expect((await intentService().get(row.id, other.id)).version).toBe(2);
  });
  it.each(['relationshipProcess.create', 'processParticipant.createMany', 'relationshipProcessEvent.create', 'auditEvent.create', 'contactIntent.updateMany'])('rollback ante fallo %s', async failure => {
    const owner = await actor(), row = await intention(owner), original = users.withLockedCredentials.bind(users), [delegateName, method] = failure.split('.');
    jest.spyOn(users, 'withLockedCredentials').mockImplementation((id, operation, locks) => original(id, (user, tx) => {
      const delegate = Reflect.get(tx, delegateName) as object;
      const failing = new Proxy(delegate, { get(target, property): unknown { return property === method ? () => Promise.reject(new Error('QA rollback')) : Reflect.get(target, property) as unknown; } });
      const proxy = new Proxy(tx, { get(target, property): unknown { return property === delegateName ? failing : Reflect.get(target, property) as unknown; } });
      return operation(user, proxy);
    }, locks));
    await expect(intentService().convert(row.id, 1, owner.id)).rejects.toThrow('QA rollback');
    expect(await intentService().get(row.id, owner.id)).toEqual(row);
    expect(await prisma.relationshipProcess.count({ where: { sourceIntentId: row.id } })).toBe(0);
    expect(await prisma.processParticipant.count({ where: { userId: owner.id } })).toBe(0);
    expect(await prisma.relationshipProcessEvent.count({ where: { actorUserId: owner.id } })).toBe(0);
    expect(await prisma.auditEvent.count({ where: { actorUserId: owner.id, action: { in: ['PROCESS_CREATED', 'CONTACT_INTENT_CONVERTED'] } } })).toBe(0);
  });
  it('fallo de auditoría de conversión revierte también creación auditada', async () => {
    const owner = await actor(), row = await intention(owner);
    jest.spyOn(app.get(AuditService), 'recordContactIntent').mockRejectedValue(new Error('QA auditoría conversión'));
    await expect(intentService().convert(row.id, 1, owner.id)).rejects.toThrow('QA auditoría conversión');
    expect(await intentService().get(row.id, owner.id)).toEqual(row);
    expect(await prisma.relationshipProcess.count({ where: { sourceIntentId: row.id } })).toBe(0);
    expect(await prisma.auditEvent.count({ where: { actorUserId: owner.id, action: 'PROCESS_CREATED' } })).toBe(0);
  });
  it('update condicional fallido revierte proceso y devuelve conflicto', async () => {
    const owner = await actor(), row = await intention(owner), original = users.withLockedCredentials.bind(users);
    jest.spyOn(users, 'withLockedCredentials').mockImplementation((id, operation, locks) => original(id, (user, tx) => {
      const intent = new Proxy(tx.contactIntent, { get(target, property): unknown { return property === 'updateMany' ? () => Promise.resolve({ count: 0 }) : Reflect.get(target, property) as unknown; } });
      return operation(user, new Proxy(tx, { get(target, property): unknown { return property === 'contactIntent' ? intent : Reflect.get(target, property) as unknown; } }));
    }, locks));
    await expect(intentService().convert(row.id, 1, owner.id)).rejects.toThrow('VERSION_CONFLICT');
    expect(await prisma.relationshipProcess.count({ where: { sourceIntentId: row.id } })).toBe(0);
  });
  // Las llamadas internas simulan el productor formal futuro, sin exponer un endpoint manual.
  it.each([ParticipantOrigin.SENT_COMMUNICATION, ParticipantOrigin.RECEIVED_COMMUNICATION])('%s incorpora participante, idempotencia concurrente e historia', async origin => {
    const owner = await actor(), other = await actor(UserRole.RESEARCH), row = await create(owner), participation = app.get(ProcessParticipationService);
    const results = await Promise.all([prisma.$transaction(tx => participation.ensureParticipant(row.id, other.id, origin, tx)),
      prisma.$transaction(tx => participation.ensureParticipant(row.id, other.id, ParticipantOrigin.RECEIVED_COMMUNICATION, tx))]);
    expect(results[0]).toEqual(results[1]);
    const first = results[0];
    expect(await prisma.$transaction(tx => participation.ensureParticipant(row.id, other.id, ParticipantOrigin.SENT_COMMUNICATION, tx))).toEqual(first);
    expect(await prisma.processParticipant.count({ where: { processId: row.id } })).toBe(2);
    await processes.changeState(row.id, { expectedVersion: 1, state: 'IN_PROGRESS' }, other.id);
    await processes.close(row.id, { expectedVersion: 2, result: 'ACHIEVED' }, other.id);
    await prisma.user.update({ where: { id: other.id }, data: { role: 'PLANNING' } });
    await processes.reopen(row.id, { expectedVersion: 3, state: 'IN_PROGRESS', reason: 'Respuesta' }, other.id);
    await prisma.user.update({ where: { id: other.id }, data: { isActive: false, deactivatedAt: new Date() } });
    await expect(processes.close(row.id, { expectedVersion: 4, result: 'ACHIEVED' }, other.id)).rejects.toThrow('FORBIDDEN');
    expect(await prisma.processParticipant.findUnique({ where: { processId_userId: { processId: row.id, userId: other.id } } })).toEqual(first);
  });
  it('rollback del productor revierte participante y notas no son origen permitido', async () => {
    const owner = await actor(), other = await actor(UserRole.PLANNING), row = await create(owner), service = app.get(ProcessParticipationService);
    await expect(prisma.$transaction(async tx => { await service.ensureParticipant(row.id, other.id, ParticipantOrigin.SENT_COMMUNICATION, tx); throw new Error('QA productor'); })).rejects.toThrow('QA productor');
    await expect(prisma.$transaction(tx => service.ensureParticipant(row.id, other.id, 'INTERNAL_NOTE' as ParticipantOrigin, tx))).rejects.toThrow('INVALID_PROCESS');
    await get(other.cookie, '/' + row.id).expect(200); await get(other.cookie, '/' + row.id + '/participants').expect(200); await get(other.cookie, '/' + row.id + '/events').expect(200);
    expect(await prisma.processParticipant.count({ where: { processId: row.id, userId: other.id } })).toBe(0);
    await post(other.cookie, {}, '/' + row.id + '/participants').expect(404);
  });
  it('rol e inactividad vigentes prevalecen sobre sesión obsoleta en conversión', async () => {
    const owner = await actor(UserRole.RESEARCH), other = await actor(UserRole.BOARD), row = await intention(owner), stale = await users.findIdentityById(other.id);
    await prisma.user.update({ where: { id: other.id }, data: { role: 'PLANNING' } });
    jest.spyOn(app.get(SessionsService), 'findIdentity').mockResolvedValue(stale);
    await convert(other.cookie, row.id).expect(403);
    await prisma.user.update({ where: { id: other.id }, data: { role: 'ADMINISTRATOR', isActive: false, deactivatedAt: new Date() } });
    await convert(other.cookie, row.id).expect(403);
    expect(await prisma.relationshipProcess.count({ where: { sourceIntentId: row.id } })).toBe(0);
  });
});
