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
import { AuditAction, Prisma, ProcessResult, ProcessState, UserRole } from '../src/generated/prisma/client';
import { UsersService } from '../src/modules/users/users.service';
import { SessionsService } from '../src/modules/auth/sessions.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { DirectoryService } from '../src/modules/directory/directory.service';
import { PeopleService } from '../src/modules/directory/people.service';
import { UserAccessService } from '../src/modules/auth/user-access.service';
import { ContactIntentsService } from '../src/modules/relationships/contact-intents.service';
import { RelationshipProcessesService } from '../src/modules/relationships/relationship-processes.service';
import type { ProcessDetailDto, ProcessEventPageDto, ProcessPageDto } from '../src/modules/relationships/relationship-process.dto';
const databaseUrl = validateDatabaseUrl(process.env.DATABASE_URL);
if (!new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('Procesos requieren una base aislada _test.');

describe('Procesos de relación PostgreSQL/HTTP', () => {
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
  it.each(Object.values(UserRole))('%s crea en preparación, participante creador, evento y auditoría atómicos', async role => {
    const owner = await actor(role), goal = await target(owner.id);
    const response = await post(owner.cookie, { ...goal, purpose: ' Cooperación ' }).expect(201), row = response.body as ProcessDetailDto;
    expect(row).toMatchObject({ purpose: 'Cooperación', state: 'PREPARATION', version: 1, sourceIntentId: null, currentResult: null, closedAt: null, closedBy: null, createdBy: { id: owner.id }, canClose: true });
    expect(row.createdAt).toBe(row.lastActivityAt); expect(row.updatedAt).toBe(row.createdAt);
    expect(row.participants).toEqual([{ user: row.createdBy, joinedAt: row.createdAt, origin: 'PROCESS_CREATOR' }]);
    expect(row.events).toHaveLength(1); expect(row.events[0]).toMatchObject({ type: 'CREATED', newState: 'PREPARATION', previousState: null, actor: { id: owner.id }, version: 1 });
    expect(await prisma.auditEvent.findUnique({ where: { processEventId: row.events[0].id } })).toMatchObject({ action: 'PROCESS_CREATED', actorUserId: owner.id });
    expect((await get(owner.cookie, '/' + row.id).expect(200)).headers['cache-control']).toBe('no-store');
    expect((await get(owner.cookie, '/' + row.id + '/participants').expect(200)).body).toEqual(row.participants);
    expect(JSON.stringify(row)).not.toMatch(/password|token|email/i);
  });
  it('admite persona independiente y procesos paralelos sin unicidad por actor', async () => {
    const owner = await actor(), person = await create(owner, 'person'), first = await create(owner);
    const second = await processes.create({ organizationId: first.target.id, purpose: 'Otra convocatoria' }, owner.id);
    expect(person.target.kind).toBe('PERSON'); expect(second.target.id).toBe(first.target.id); expect(second.id).not.toBe(first.id);
  });
  it.each(['', '/' + randomUUID(), '/' + randomUUID() + '/participants', '/' + randomUUID() + '/events'])('lectura sin sesión %s exige 401', async suffix => { await request(app.getHttpServer()).get('/api/v1/relationship-processes' + suffix).expect(401); });
  it.each(['', '/' + randomUUID() + '/state', '/' + randomUUID() + '/close', '/' + randomUUID() + '/reopen'])('escritura sin sesión %s exige 401', async suffix => { await request(app.getHttpServer()).post('/api/v1/relationship-processes' + suffix).send({}).expect(401); });
  it('sin capability bloquea HTTP y servicios', async () => {
    const owner = await actor(); jest.spyOn(app.get(SessionsService), 'findIdentity').mockResolvedValue({ ...owner, role: 'UNKNOWN' } as never);
    await get(owner.cookie).expect(403); await post(owner.cookie, {}).expect(403);
    for (const action of ['state', 'close', 'reopen']) await post(owner.cookie, {}, '/' + randomUUID() + '/' + action).expect(403);
    await prisma.user.update({ where: { id: owner.id }, data: { isActive: false, deactivatedAt: new Date() } });
    await expect(processes.list({ page: 1, pageSize: 25, state: 'all' }, owner.id)).rejects.toThrow('FORBIDDEN');
    await expect(processes.create({ organizationId: randomUUID(), purpose: 'Meta' }, owner.id)).rejects.toThrow('FORBIDDEN');
  });
  it.each([{}, { purpose: '' }, { purpose: ' \n ' }, { purpose: 'x'.repeat(5001) }, { purpose: 'Meta', organizationId: 'bad' }, { purpose: 'Meta', organizationId: randomUUID(), personId: randomUUID() }, { purpose: 'Meta', personId: null }])('rechaza entrada inválida %j', async body => {
    const owner = await actor(); await post(owner.cookie, body).expect(400);
  });
  it.each(['createdByUserId', 'participants', 'state', 'version', 'createdAt', 'sourceIntentId', 'closedAt', 'auditor'])('rechaza mass assignment de %s', async field => {
    const owner = await actor(); await post(owner.cookie, { ...await target(owner.id), purpose: 'Meta', [field]: owner.id }).expect(400);
  });
  it.each(['organization', 'person'] as const)('rechaza actor %s inexistente', async kind => { const owner = await actor(); await post(owner.cookie, { purpose: 'Meta', [kind + 'Id']: randomUUID() }).expect(409); });
  it('rechaza actores inactivos, consolidados y persona con vínculo vigente', async () => {
    const owner = await actor(), goal = await target(owner.id), person = await target(owner.id, 'person'), principal = await target(owner.id);
    await prisma.organization.update({ where: { id: goal.organizationId }, data: { isActive: false } }); await post(owner.cookie, { ...goal, purpose: 'Meta' }).expect(409);
    await prisma.organization.update({ where: { id: goal.organizationId }, data: { isActive: true, duplicateOfId: principal.organizationId } }); await post(owner.cookie, { ...goal, purpose: 'Meta' }).expect(409);
    await prisma.person.update({ where: { id: person.personId }, data: { isActive: false } }); await post(owner.cookie, { ...person, purpose: 'Meta' }).expect(409);
    await prisma.person.update({ where: { id: person.personId }, data: { isActive: true } });
    await app.get(PeopleService).createRelation(person.personId!, { organizationId: principal.organizationId!, isCurrent: true }, owner.id);
    await post(owner.cookie, { ...person, purpose: 'Meta' }).expect(409);
  });
  it('pagina y filtra con orden determinista y devuelve 404 para proceso ausente', async () => {
    const owner = await actor(), a = await create(owner), b = await create(owner), date = new Date();
    await prisma.relationshipProcess.updateMany({ where: { id: { in: [a.id, b.id] } }, data: { createdAt: date, updatedAt: date, lastActivityAt: date } });
    const ids: string[] = [];
    for (let page = 1; page <= 2; page++) {
      const response = await get(owner.cookie).query({ page, pageSize: 1, createdByUserId: owner.id }).expect(200), body = response.body as ProcessPageDto;
      expect(body.total).toBe(2); ids.push(body.items[0].id);
    }
    expect(ids).toEqual([a.id, b.id].sort().reverse());
    expect(((await get(owner.cookie).query({ organizationId: a.target.id, state: 'PREPARATION' }).expect(200)).body as ProcessPageDto).total).toBe(1);
    expect(((await get(owner.cookie).query({ organizationId: a.target.id, state: 'CLOSED' }).expect(200)).body as ProcessPageDto).total).toBe(0);
    for (const suffix of ['', '/participants', '/events']) await get(owner.cookie, '/' + randomUUID() + suffix).expect(404);
    for (const action of ['state', 'close', 'reopen']) {
      const body = action === 'close' ? { expectedVersion: 1, result: 'ACHIEVED' } : { expectedVersion: 1, state: 'IN_PROGRESS', reason: 'Respuesta' };
      await post(owner.cookie, body, '/' + randomUUID() + '/' + action).expect(404);
    }
    await get(owner.cookie).query({ pageSize: 101 }).expect(400); await get(owner.cookie).query({ organizationId: 'bad' }).expect(400);
  });
  it('rollback si falla participante inicial después de insertar proceso', async () => {
    const owner = await actor(), goal = await target(owner.id), original = users.withLockedCredentials.bind(users);
    jest.spyOn(users, 'withLockedCredentials').mockImplementation((id, operation, locks) => original(id, (user, tx) => {
      const participant = new Proxy(tx.processParticipant, { get(delegate, property): unknown { return property === 'createMany' ? () => Promise.reject(new Error('QA participante')) : Reflect.get(delegate, property) as unknown; } });
      const proxy: Prisma.TransactionClient = new Proxy(tx, { get(delegate, property): unknown { return property === 'processParticipant' ? participant : Reflect.get(delegate, property) as unknown; } });
      return operation(user, proxy);
    }, locks));
    await expect(processes.create({ ...goal, purpose: 'Meta' }, owner.id)).rejects.toThrow('QA participante');
    expect(await prisma.relationshipProcess.count({ where: { createdByUserId: owner.id } })).toBe(0);
    expect(await prisma.processParticipant.count({ where: { userId: owner.id } })).toBe(0);
    expect(await prisma.relationshipProcessEvent.count({ where: { actorUserId: owner.id } })).toBe(0);
  });
  it.each(Object.values(UserRole))('%s participante cambia, cierra y reabre conservando cierre previo', async role => {
    const owner = await actor(role), row = await create(owner);
    const change = await post(owner.cookie, { expectedVersion: 1, state: 'WAITING_RESPONSE', reason: 'Acercamiento planificado' }, '/' + row.id + '/state').expect(201);
    expect(change.body).toMatchObject({ state: 'WAITING_RESPONSE', version: 2 });
    const close = await post(owner.cookie, { expectedVersion: 2, result: 'OTHER', observation: 'Razón histórica' }, '/' + row.id + '/close').expect(201);
    expect(close.body).toMatchObject({ state: 'CLOSED', version: 3, currentResult: 'OTHER', closureObservation: 'Razón histórica', closedBy: { id: owner.id } });
    const closedEvent = (close.body as ProcessDetailDto).events.find(event => event.type === 'CLOSED')!;
    const reopen = await post(owner.cookie, { expectedVersion: 3, state: 'NEGOTIATION', reason: 'Respuesta tardía del mismo acercamiento' }, '/' + row.id + '/reopen').expect(201);
    const next = reopen.body as ProcessDetailDto;
    expect(next).toMatchObject({ state: 'NEGOTIATION', version: 4, currentResult: null, closureObservation: null, closedAt: null, closedBy: null });
    expect(next.events.find(event => event.type === 'CLOSED')).toEqual(closedEvent); expect(next.eventsTotal).toBe(4); expect(next.participants).toEqual(row.participants);
    const audit = await prisma.auditEvent.findMany({ where: { processEvent: { processId: row.id } }, include: { processEvent: true } });
    expect(audit.map(event => event.action).sort()).toEqual(['PROCESS_CREATED', 'PROCESS_STATE_CHANGED', 'PROCESS_CLOSED', 'PROCESS_REOPENED'].sort());
    expect(audit.find(event => event.action === 'PROCESS_CLOSED')?.processEvent?.authority).toBe(role === 'ADMINISTRATOR' ? 'ADMINISTRATOR' : role === 'BOARD' ? 'BOARD' : 'PARTICIPANT');
    const events = (await get(owner.cookie, '/' + row.id + '/events').query({ page: 2, pageSize: 2 }).expect(200)).body as ProcessEventPageDto;
    expect(events.total).toBe(4); expect(events.items.map(event => event.version)).toEqual([2, 1]);
  });
  it.each([UserRole.ADMINISTRATOR, UserRole.BOARD])('%s no participante cambia, cierra y reabre sin adquirir participación', async role => {
    const owner = await actor(UserRole.RESEARCH), other = await actor(role), row = await create(owner);
    await post(other.cookie, { expectedVersion: 1, state: 'IN_PROGRESS' }, '/' + row.id + '/state').expect(201);
    await post(other.cookie, { expectedVersion: 2, result: 'ACHIEVED' }, '/' + row.id + '/close').expect(201);
    await post(other.cookie, { expectedVersion: 3, state: 'IN_PROGRESS', reason: 'Continuación' }, '/' + row.id + '/reopen').expect(201);
    expect(await prisma.processParticipant.count({ where: { processId: row.id } })).toBe(1);
    expect((await processes.get(row.id, other.id)).events[0].authority).toBe(role === 'ADMINISTRATOR' ? 'ADMINISTRATOR' : 'BOARD');
  });
  it.each([UserRole.RESEARCH, UserRole.PLANNING])('%s no participante consulta pero no actúa ni obtiene participación por lectura', async role => {
    const owner = await actor(), other = await actor(role), row = await create(owner);
    expect((await get(other.cookie, '/' + row.id).expect(200)).body).toMatchObject({ allowedStates: [], canClose: false, canReopen: false });
    await post(other.cookie, { expectedVersion: 1, state: 'IN_PROGRESS' }, '/' + row.id + '/state').expect(403);
    await post(other.cookie, { expectedVersion: 1, result: 'ACHIEVED' }, '/' + row.id + '/close').expect(403);
    await processes.close(row.id, { expectedVersion: 1, result: 'ACHIEVED' }, owner.id);
    await post(other.cookie, { expectedVersion: 2, state: 'IN_PROGRESS', reason: 'Respuesta' }, '/' + row.id + '/reopen').expect(403);
    expect(await prisma.processParticipant.count({ where: { processId: row.id, userId: other.id } })).toBe(0);
  });
  it('autoría no sustituye participación contextual', async () => {
    const owner = await actor(UserRole.RESEARCH), row = await create(owner);
    await prisma.processParticipant.deleteMany({ where: { processId: row.id } });
    await expect(processes.close(row.id, { expectedVersion: 1, result: 'ACHIEVED' }, owner.id)).rejects.toThrow('FORBIDDEN');
  });
  it('rechaza secuencias inválidas, CLOSED genérico y reapertura sin cierre', async () => {
    const owner = await actor(), row = await create(owner);
    await post(owner.cookie, { expectedVersion: 1, state: 'NEGOTIATION' }, '/' + row.id + '/state').expect(409);
    await post(owner.cookie, { expectedVersion: 1, state: 'PREPARATION' }, '/' + row.id + '/state').expect(409);
    await post(owner.cookie, { expectedVersion: 1, state: 'CLOSED' }, '/' + row.id + '/state').expect(400);
    await post(owner.cookie, { expectedVersion: 1, state: 'IN_PROGRESS', reason: 'Respuesta' }, '/' + row.id + '/reopen').expect(409);
    await processes.close(row.id, { expectedVersion: 1, result: 'ACHIEVED' }, owner.id);
    await post(owner.cookie, { expectedVersion: 2, state: 'IN_PROGRESS' }, '/' + row.id + '/state').expect(409);
    await post(owner.cookie, { expectedVersion: 2, result: 'REJECTED' }, '/' + row.id + '/close').expect(409);
    await post(owner.cookie, { expectedVersion: 2, state: 'IN_PROGRESS', reason: ' \n ' }, '/' + row.id + '/reopen').expect(400);
    await post(owner.cookie, { expectedVersion: 2, state: 'CLOSED', reason: 'Respuesta' }, '/' + row.id + '/reopen').expect(400);
  });
  it.each([{ expectedVersion: 1 }, { expectedVersion: 1, result: 'OTHER' }, { expectedVersion: 1, result: 'OTHER', observation: ' \n ' }, { expectedVersion: 0, result: 'ACHIEVED' }, { result: 'ACHIEVED' }, { expectedVersion: 1, result: 'bad' }, { expectedVersion: 1, result: 'ACHIEVED', closedByUserId: randomUUID() }])('rechaza cierre inválido %j', async body => {
    const owner = await actor(), row = await create(owner); await post(owner.cookie, body, '/' + row.id + '/close').expect(400);
    expect((await processes.get(row.id, owner.id)).eventsTotal).toBe(1);
  });
  it('HTTP devuelve 409 para versión obsoleta', async () => {
    const owner = await actor(), row = await create(owner); await processes.changeState(row.id, { expectedVersion: 1, state: 'IN_PROGRESS' }, owner.id);
    expect(((await post(owner.cookie, { expectedVersion: 1, result: 'ACHIEVED' }, '/' + row.id + '/close').expect(409)).body as { code: string }).code).toBe('VERSION_CONFLICT');
  });
  it.each(['state-state', 'close-close', 'close-state', 'reopen-reopen', 'reopen-close'])('concurrencia %s conserva un ganador y un conflicto', async kind => {
    const owner = await actor(), other = await actor(UserRole.BOARD), row = await create(owner);
    let version = 1;
    if (kind.startsWith('reopen')) { await processes.close(row.id, { expectedVersion: 1, result: 'NO_RESPONSE' }, owner.id); version = 2; }
    const operation = (action: string, userId: string) => action === 'state' ? processes.changeState(row.id, { expectedVersion: version, state: 'IN_PROGRESS' }, userId) :
      action === 'close' ? processes.close(row.id, { expectedVersion: version, result: 'ACHIEVED' }, userId) : processes.reopen(row.id, { expectedVersion: version, state: 'IN_PROGRESS', reason: 'Respuesta tardía' }, userId);
    const [first, second] = kind.split('-'), results = await Promise.allSettled([operation(first, owner.id), operation(second, other.id)]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1); expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    const next = await processes.get(row.id, owner.id); expect(next.version).toBe(version + 1); expect(next.eventsTotal).toBe(version + 1);
    expect(next.currentResult !== null).toBe(next.state === 'CLOSED');
    expect(await prisma.auditEvent.count({ where: { processEvent: { processId: row.id } } })).toBe(version + 1);
  });
  it.each(['create', 'state', 'close', 'reopen'])('fallo de auditoría revierte %s y su evento', async kind => {
    const owner = await actor(), goal = await target(owner.id), row = kind === 'create' ? null : await processes.create({ ...goal, purpose: 'Meta' }, owner.id);
    if (row && kind === 'reopen') await processes.close(row.id, { expectedVersion: 1, result: 'ACHIEVED' }, owner.id);
    const before = row ? await processes.get(row.id, owner.id) : null;
    jest.spyOn(app.get(AuditService), 'recordProcess').mockRejectedValue(new Error('QA auditoría'));
    const action = kind === 'create' ? processes.create({ ...goal, purpose: 'Meta' }, owner.id) : kind === 'state' ? processes.changeState(row!.id, { expectedVersion: 1, state: 'IN_PROGRESS' }, owner.id) :
      kind === 'close' ? processes.close(row!.id, { expectedVersion: 1, result: 'ACHIEVED' }, owner.id) : processes.reopen(row!.id, { expectedVersion: 2, state: 'IN_PROGRESS', reason: 'Respuesta' }, owner.id);
    await expect(action).rejects.toThrow('QA auditoría');
    if (row) expect(await processes.get(row.id, owner.id)).toEqual(before); else expect(await prisma.relationshipProcess.count({ where: { createdByUserId: owner.id } })).toBe(0);
  });
  it('desactivación y rol vigente se revalidan incluso con guard obsoleto; historia permanece', async () => {
    const admin = await actor(), owner = await actor(UserRole.RESEARCH), other = await actor(UserRole.BOARD), row = await create(owner), stale = await users.findIdentityById(other.id);
    await prisma.user.update({ where: { id: other.id }, data: { role: UserRole.PLANNING } });
    jest.spyOn(app.get(SessionsService), 'findIdentity').mockResolvedValue(stale);
    await post(other.cookie, { expectedVersion: 1, result: 'ACHIEVED' }, '/' + row.id + '/close').expect(403); jest.restoreAllMocks();
    await app.get(UserAccessService).deactivate(owner.id, admin.id); await get(owner.cookie, '/' + row.id).expect(401);
    await expect(processes.close(row.id, { expectedVersion: 1, result: 'ACHIEVED' }, owner.id)).rejects.toThrow('FORBIDDEN');
    await prisma.organization.update({ where: { id: row.target.id }, data: { isActive: false } });
    expect(await processes.get(row.id, admin.id)).toMatchObject({ createdBy: { isActive: false }, target: { id: row.target.id, isActive: false } });
  });
  it('constraints, FKs y no eliminación histórica', async () => {
    const owner = await actor(), row = await create(owner), person = await target(owner.id, 'person');
    const base = { purpose: 'Meta', createdByUserId: owner.id, organizationId: row.target.id };
    for (const patch of [{ organizationId: undefined }, { personId: person.personId }, { purpose: ' \n ' }, { version: 0 }, { state: ProcessState.CLOSED }, { currentResult: ProcessResult.ACHIEVED }, { createdByUserId: randomUUID() }, { organizationId: randomUUID() }]) {
      await expect(prisma.relationshipProcess.create({ data: { ...base, ...patch } })).rejects.toThrow();
    }
    await expect(prisma.relationshipProcess.update({ where: { id: row.id }, data: { state: 'CLOSED', currentResult: 'OTHER', closedAt: new Date(row.lastActivityAt), closedByUserId: owner.id, closureObservation: ' \n ' } })).rejects.toThrow();
    await expect(prisma.processParticipant.create({ data: { processId: row.id, userId: owner.id, origin: 'PROCESS_CREATOR' } })).rejects.toThrow();
    await expect(prisma.relationshipProcessEvent.create({ data: { processId: row.id, actorUserId: owner.id, authority: 'PARTICIPANT', type: 'CLOSED', previousState: 'PREPARATION', newState: 'CLOSED', version: 2 } })).rejects.toThrow();
    await expect(prisma.auditEvent.create({ data: { action: AuditAction.PROCESS_CLOSED, actorUserId: owner.id, operationId: randomUUID() } })).rejects.toThrow();
    await expect(prisma.auditEvent.create({ data: { action: AuditAction.PROCESS_CLOSED, actorUserId: owner.id, processEventId: row.events[0].id, targetUserId: owner.id, operationId: randomUUID() } })).rejects.toThrow();
    await expect(prisma.organization.delete({ where: { id: row.target.id } })).rejects.toThrow(); await expect(prisma.user.delete({ where: { id: owner.id } })).rejects.toThrow();
    await expect(prisma.relationshipProcess.delete({ where: { id: row.id } })).rejects.toThrow();
    for (const method of ['delete', 'patch', 'put'] as const) await request(app.getHttpServer())[method]('/api/v1/relationship-processes/' + row.id).set('Cookie', owner.cookie).send({}).expect(404);
    await post(owner.cookie, {}, '/' + row.id + '/participants').expect(404);
  });
  it('FK única de intención impide reconvertir una referencia existente', async () => {
    const owner = await actor(), goal = await target(owner.id), intent = await app.get(ContactIntentsService).create({ ...goal, purpose: 'Meta' }, owner.id);
    const base = { ...goal, purpose: 'Meta', createdByUserId: owner.id, sourceIntentId: intent.id };
    await prisma.relationshipProcess.create({ data: base }); await expect(prisma.relationshipProcess.create({ data: base })).rejects.toThrow();
    await expect(prisma.relationshipProcess.create({ data: { ...base, sourceIntentId: randomUUID() } })).rejects.toThrow();
    await request(app.getHttpServer()).post('/api/v1/contact-intents/' + intent.id + '/convert').set('Cookie', owner.cookie).send({ expectedVersion: 1 }).expect(409);
    expect((await prisma.contactIntent.findUnique({ where: { id: intent.id } }))?.state).toBe('ACTIVE');
  });
});
