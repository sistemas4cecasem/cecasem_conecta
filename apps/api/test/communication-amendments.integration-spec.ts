import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/config/application';
import { validateEnvironment } from '../src/config/environment';
import { validateDatabaseUrl } from '../src/config/database-url';
import { PrismaService } from '../src/database/prisma.service';
import { UserRole } from '../src/generated/prisma/client';
import { UsersService } from '../src/modules/users/users.service';
import { SessionsService } from '../src/modules/auth/sessions.service';
import { DirectoryService } from '../src/modules/directory/directory.service';
import { RelationshipProcessesService } from '../src/modules/relationships/relationship-processes.service';
import { CommunicationAmendmentsService } from '../src/modules/communications/communication-amendments.service';
import { RelationshipContextService } from '../src/modules/relationships/relationship-context.service';
import type { AmendmentDto, AmendmentsPageDto } from '../src/modules/communications/communication-amendment.dto';
import { CommunicationsService } from '../src/modules/communications/communications.service';
import type { TimelineItem, TimelinePageDto } from '../src/modules/relationships/timeline.dto';
const databaseUrl = validateDatabaseUrl(process.env.DATABASE_URL);
if (!new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('Timeline requiere una base aislada _test.');
describe('Correcciones e invalidación PostgreSQL/HTTP', () => {
  let app: INestApplication<Server>, prisma: PrismaService, users: UsersService, processes: RelationshipProcessesService;
  const userIds: string[] = [], orgIds: string[] = [], accountIds: string[] = [];
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
      prisma.internalNote.deleteMany({ where: { process: { createdByUserId: { in: userIds } } } }),
      prisma.communicationAmendment.deleteMany({ where: { communication: { registeredByUserId: { in: userIds } } } }),
      prisma.communicationRecipient.deleteMany({ where: { communication: { registeredByUserId: { in: userIds } } } }),
      prisma.communication.deleteMany({ where: { registeredByUserId: { in: userIds } } }),
      prisma.relationshipProcessEvent.deleteMany({ where: { process: { createdByUserId: { in: userIds } } } }),
      prisma.processParticipant.deleteMany({ where: { process: { createdByUserId: { in: userIds } } } }),
      prisma.relationshipProcess.deleteMany({ where: { createdByUserId: { in: userIds } } }),
      prisma.directoryChange.deleteMany({ where: { actorUserId: { in: userIds } } }),
      prisma.organization.deleteMany({ where: { id: { in: orgIds } } }),
      prisma.userSession.deleteMany({ where: { userId: { in: userIds } } }),
      prisma.userEmailAccount.deleteMany({ where: { userId: { in: userIds } } }),
      prisma.emailAccount.deleteMany({ where: { id: { in: accountIds } } }),
      prisma.user.deleteMany({ where: { id: { in: userIds } } }),
    ]); userIds.length = orgIds.length = accountIds.length = 0;
  });
  afterAll(async () => { await app.close(); });
  async function actor(role: UserRole = UserRole.ADMINISTRATOR) {
    const row = await users.createIdentity({ givenNames: 'QA', familyNames: 'Timeline', role, email: randomUUID() + '@example.test' }); userIds.push(row.id);
    const token = await prisma.$transaction(tx => app.get(SessionsService).create(row.id, tx));
    return { ...row, cookie: 'cecasem_session=' + token };
  }
  async function fixture() {
    const owner = await actor(), org = await app.get(DirectoryService).createOrganization({ name: 'Timeline QA' }, owner.id); orgIds.push(org.id);
    const process = await processes.create({ organizationId: org.id, purpose: 'Objetivo institucional' }, owner.id);
    return { owner, process };
  }
  const amendments = () => app.get(CommunicationAmendmentsService), communications = () => app.get(CommunicationsService);
  async function incoming(processId: string, actorId: string, day: number) {
    return communications().registerReceived(processId, { sender: 'Old@Example.test', to: ['CECASEM@Example.test'], cc: ['Copia@Example.test'], bcc: ['Privada@Example.test'],
      subject: 'Respuesta ' + day, body: 'Cuerpo original privado '.repeat(1000), receivedAt: '2000-10-0' + day + 'T12:00:00.000Z' }, actorId, randomUUID());
  }
  async function read(cookie: string, processId: string, query: object = {}): Promise<TimelinePageDto> {
    const result = await request(app.getHttpServer()).get('/api/v1/relationship-processes/' + processId + '/timeline').set('Cookie', cookie).query(query).expect(200);
    expect(result.headers['cache-control']).toBe('no-store'); return result.body as TimelinePageDto;
  }
  async function snapshot(processId: string) {
    return { process: await prisma.relationshipProcess.findUniqueOrThrow({ where: { id: processId } }),
      participants: await prisma.processParticipant.findMany({ where: { processId }, orderBy: { userId: 'asc' } }),
      events: await prisma.relationshipProcessEvent.findMany({ where: { processId }, orderBy: { id: 'asc' } }),
      audit: await prisma.auditEvent.count({ where: { actorUserId: { in: userIds } } }) };
  }
  const amend = (id: string, actorId: string, type: 'CORRECTION' | 'ANNOTATION' | 'INVALIDATION', content = 'Texto histórico', key = randomUUID()) => amendments().create(id, type, content, actorId, key);
  it.each(Object.values(UserRole))('%s agrega corrección y observación sin participación ni efectos sobre el proceso', async role => {
    const f = await fixture(), row = await incoming(f.process.id, f.owner.id, 1), writer = await actor(role);
    const before = await snapshot(f.process.id), original = await communications().get(row.id, f.owner.id);
    for (const type of ['CORRECTION', 'ANNOTATION'] as const) {
      const result = await request(app.getHttpServer()).post('/api/v1/communications/' + row.id + '/amendments').set('Cookie', writer.cookie).set('Idempotency-Key', randomUUID()).send({ type, content: '  <script>literal</script>  ' }).expect(201);
      expect(result.body).toMatchObject({ type, author: { id: writer.id }, content: '  <script>literal</script>  ' });
    }
    expect(await communications().get(row.id, writer.id)).toEqual(original); expect(await snapshot(f.process.id)).toEqual(before);
    const result = await request(app.getHttpServer()).get('/api/v1/communications/' + row.id + '/amendments').set('Cookie', writer.cookie).expect(200);
    expect((result.body as AmendmentsPageDto).items.map(item => item.type)).toEqual(['CORRECTION', 'ANNOTATION']);
  });
  it.each(Object.values(UserRole))('%s invalida propia, conserva original/participación/proceso y registra una auditoría', async role => {
    const f = await fixture(), writer = await actor(role), row = await incoming(f.process.id, writer.id, 1);
    const original = await communications().get(row.id, writer.id), before = await snapshot(f.process.id), key = randomUUID();
    const result = await request(app.getHttpServer()).post('/api/v1/communications/' + row.id + '/invalidate').set('Cookie', writer.cookie).set('Idempotency-Key', key).send({ reason: 'Registrada dos veces' }).expect(201);
    const replay = await request(app.getHttpServer()).post('/api/v1/communications/' + row.id + '/invalidate').set('Cookie', writer.cookie).set('Idempotency-Key', key).send({ reason: 'Registrada dos veces' }).expect(201);
    expect(replay.body).toEqual(result.body);
    const invalidation = result.body as AmendmentDto;
    const after = await communications().get(row.id, f.owner.id); expect(after).toEqual({ ...original, validity: 'INVALIDATED', version: 2, invalidation });
    const state = await snapshot(f.process.id); expect({ ...state, audit: before.audit }).toEqual(before); expect(state.audit).toBe(before.audit + 1);
    expect(await prisma.auditEvent.findFirst({ where: { action: 'COMMUNICATION_INVALIDATED', communicationId: row.id } })).toMatchObject({ actorUserId: writer.id, processId: f.process.id, operationId: invalidation.id });
    await request(app.getHttpServer()).post('/api/v1/communications/' + row.id + '/invalidate').set('Cookie', writer.cookie).set('Idempotency-Key', randomUUID()).send({ reason: 'Otra' }).expect(409);
    await expect(amend(row.id, writer.id, 'CORRECTION')).rejects.toThrow('ALREADY_INVALIDATED');
    await amend(row.id, writer.id, 'ANNOTATION', 'Contexto después de invalidar');
  });
  it.each(Object.values(UserRole))('%s: invalidar ajena aplica autoría real, sin excepción por participación', async role => {
    const f = await fixture(), row = await incoming(f.process.id, f.owner.id, 1), writer = await actor(role);
    const operation = request(app.getHttpServer()).post('/api/v1/communications/' + row.id + '/invalidate').set('Cookie', writer.cookie).set('Idempotency-Key', randomUUID()).send({ reason: 'Error histórico' });
    await operation.expect(['ADMINISTRATOR', 'BOARD'].includes(role) ? 201 : 403);
  });
  it.each(['', ' \n\t', null, 'x'.repeat(5001), 'NUL\0'])('contenido o motivo no significativo %j no persiste', async content => {
    const f = await fixture(), row = await incoming(f.process.id, f.owner.id, 1);
    for (const invalidation of [false, true]) await request(app.getHttpServer()).post('/api/v1/communications/' + row.id + (invalidation ? '/invalidate' : '/amendments')).set('Cookie', f.owner.cookie).set('Idempotency-Key', randomUUID()).send(invalidation ? { reason: content } : { type: 'CORRECTION', content }).expect(400);
    expect(await prisma.communicationAmendment.count({ where: { communicationId: row.id } })).toBe(0);
  });
  it('original no dispone de PATCH/PUT/DELETE ni edición de amendments o notas', async () => {
    const f = await fixture(), row = await incoming(f.process.id, f.owner.id, 1), original = await communications().get(row.id, f.owner.id);
    for (const method of ['patch', 'put', 'delete'] as const) await request(app.getHttpServer())[method]('/api/v1/communications/' + row.id).set('Cookie', f.owner.cookie).send({ subject: 'Editado', body: 'Editado', sender: 'fake@example.test', recipients: [], occurredAt: new Date().toISOString() }).expect(404);
    const correction = await amend(row.id, f.owner.id, 'CORRECTION');
    for (const method of ['patch', 'delete'] as const) await request(app.getHttpServer())[method]('/api/v1/communications/' + row.id + '/amendments/' + correction.id).set('Cookie', f.owner.cookie).send({ content: 'Editar' }).expect(404);
    expect(await communications().get(row.id, f.owner.id)).toEqual(original);
  });
  it('el cuerpo original rechaza DML ordinario y las correcciones/invalidaciones siguen siendo aditivas', async () => {
    const f = await fixture(), row = await incoming(f.process.id, f.owner.id, 1);
    await expect(prisma.communication.update({ where: { id: row.id }, data: { bodyOriginal: 'Cuerpo sobrescrito' } })).rejects.toThrow();
    await expect(prisma.$executeRaw`UPDATE "Communication" SET "bodyOriginal" = ${'Cuerpo sobrescrito por SQL'} WHERE id = ${row.id}::uuid`).rejects.toThrow();
    await amend(row.id, f.owner.id, 'CORRECTION', 'Corrección explicativa');
    await amend(row.id, f.owner.id, 'INVALIDATION', 'Invalidación explicativa');
    expect(await communications().get(row.id, f.owner.id)).toMatchObject({ bodyOriginal: row.bodyOriginal, validity: 'INVALIDATED' });
  });
  it('timeline conserva original invalidado y acciones posteriores; contexto usa solo válida y ninguna cuando todas se invalidan', async () => {
    const f = await fixture(), first = await incoming(f.process.id, f.owner.id, 1), second = await incoming(f.process.id, f.owner.id, 2);
    await amend(first.id, f.owner.id, 'CORRECTION'); await amend(first.id, f.owner.id, 'ANNOTATION'); await amend(first.id, f.owner.id, 'INVALIDATION');
    const timeline = await read(f.owner.cookie, f.process.id);
    expect(timeline.items.filter(item => item.kind.startsWith('COMMUNICATION_')).map(item => item.kind)).toEqual(['COMMUNICATION_CORRECTED', 'COMMUNICATION_ANNOTATED', 'COMMUNICATION_INVALIDATED']);
    expect(timeline.items.find(item => item.id === first.id)).toMatchObject({ kind: 'RECEIVED_COMMUNICATION', payload: { validity: 'INVALIDATED', subject: first.subject, invalidation: { content: 'Texto histórico' } } });
    let context = await app.get(RelationshipContextService).get({ organizationId: orgIds[0] }, f.owner.id);
    expect(context.communicationSummary).toMatchObject({ total: 1, lastOccurredAt: second.occurredAt }); expect(context.recentCommunications.map(item => item.id)).toEqual([second.id]);
    await amend(second.id, f.owner.id, 'INVALIDATION'); context = await app.get(RelationshipContextService).get({ organizationId: orgIds[0] }, f.owner.id);
    expect(context.hasRegisteredCommunicationHistory).toBe(false); expect(context.communicationSummary).toMatchObject({ total: 0, lastOccurredAt: null });
    expect((await read(f.owner.cookie, f.process.id)).items.filter(item => item.kind === 'RECEIVED_COMMUNICATION')).toHaveLength(2);
    const items: TimelineItem[] = []; let cursor: string | null = null;
    do { const page = await read(f.owner.cookie, f.process.id, { pageSize: 1, ...(cursor ? { after: cursor } : {}) }); items.push(...page.items); cursor = page.nextCursor; } while (cursor);
    expect(new Set(items.map(item => item.id)).size).toBe(items.length); expect(items).toHaveLength(7);
  });
  it('SENT admite acciones y preserva los snapshots de cuenta/TO/CC/CCO', async () => {
    const f = await fixture(); const account = await prisma.emailAccount.create({ data: { address: randomUUID() + '@example.test', displayName: 'Buzón QA' } }); accountIds.push(account.id);
    await prisma.userEmailAccount.create({ data: { userId: f.owner.id, emailAccountId: account.id } });
    const row = await communications().registerSent(f.process.id, { emailAccountId: account.id, to: ['to@example.test'], cc: ['cc@example.test'], bcc: ['bcc@example.test'], subject: 'Original', body: 'Body original', sentAt: '2000-01-01T00:00:00Z' }, f.owner.id, randomUUID());
    await amend(row.id, f.owner.id, 'CORRECTION'); await amend(row.id, f.owner.id, 'ANNOTATION'); await amend(row.id, f.owner.id, 'INVALIDATION');
    const after = await communications().get(row.id, f.owner.id); expect({ ...after, validity: row.validity, version: row.version, invalidation: null }).toEqual(row);
  });
  it('requests concurrentes de la misma clave producen un solo amendment; claves incompatibles devuelven conflicto', async () => {
    const f = await fixture(), row = await incoming(f.process.id, f.owner.id, 1), key = randomUUID();
    const [a, b] = await Promise.all([amend(row.id, f.owner.id, 'CORRECTION', 'Texto', key), amend(row.id, f.owner.id, 'CORRECTION', 'Texto', key)]); expect(a).toEqual(b);
    await expect(amend(row.id, f.owner.id, 'ANNOTATION', 'Texto', key)).rejects.toThrow('REQUEST_CONFLICT');
    expect(await prisma.communicationAmendment.count({ where: { communicationId: row.id } })).toBe(1);
  });
  it('dos invalidaciones concurrentes producen un solo hecho y una auditoría', async () => {
    const f = await fixture(), row = await incoming(f.process.id, f.owner.id, 1), other = await actor(UserRole.BOARD);
    const result = await Promise.allSettled([amend(row.id, f.owner.id, 'INVALIDATION'), amend(row.id, other.id, 'INVALIDATION')]);
    expect(result.filter(item => item.status === 'fulfilled')).toHaveLength(1); expect(result.filter(item => item.status === 'rejected')).toHaveLength(1);
    expect(await prisma.communicationAmendment.count({ where: { communicationId: row.id, type: 'INVALIDATION' } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { communicationId: row.id, action: 'COMMUNICATION_INVALIDATED' } })).toBe(1);
  });
  it('corrección vs invalidación se serializa; invalidación previa rechaza corrección', async () => {
    const f = await fixture(), row = await incoming(f.process.id, f.owner.id, 1), other = await actor(UserRole.BOARD);
    const result = await Promise.allSettled([amend(row.id, f.owner.id, 'CORRECTION'), amend(row.id, other.id, 'INVALIDATION')]);
    expect(result[1].status).toBe('fulfilled'); expect((await communications().get(row.id, f.owner.id)).validity).toBe('INVALIDATED');
    await expect(amend(row.id, f.owner.id, 'CORRECTION')).rejects.toThrow('ALREADY_INVALIDATED');
  });
  it.each(['role', 'inactive'])('credenciales %s se revalidan tras esperar un lock', async change => {
    const f = await fixture(), row = await incoming(f.process.id, f.owner.id, 1), other = await actor(UserRole.BOARD);
    let release!: () => void, ready!: () => void;
    const released = new Promise<void>(resolve => { release = resolve; }), locked = new Promise<void>(resolve => { ready = resolve; });
    const holder = prisma.$transaction(async tx => { await tx.$queryRaw`SELECT id FROM "User" WHERE id=${other.id}::uuid FOR UPDATE`; ready(); await released;
      await tx.user.update({ where: { id: other.id }, data: change === 'role' ? { role: UserRole.RESEARCH } : { isActive: false, deactivatedAt: new Date() } }); });
    await locked; const pending = amend(row.id, other.id, 'INVALIDATION'); const assertion = expect(pending).rejects.toThrow('FORBIDDEN');
    try { release(); await holder; await assertion; } finally { release(); await holder; }
    expect(await prisma.communicationAmendment.count({ where: { communicationId: row.id } })).toBe(0);
  });
  it('HTTP usuario inactivo, sin sesión, inexistente y asignación masiva se rechazan', async () => {
    const f = await fixture(), row = await incoming(f.process.id, f.owner.id, 1), other = await actor(UserRole.PLANNING);
    await prisma.user.update({ where: { id: other.id }, data: { isActive: false, deactivatedAt: new Date() } });
    await request(app.getHttpServer()).post('/api/v1/communications/' + row.id + '/amendments').set('Cookie', other.cookie).set('Idempotency-Key', randomUUID()).send({ type: 'CORRECTION', content: 'Contexto' }).expect(401);
    await expect(amend(row.id, other.id, 'ANNOTATION')).rejects.toThrow('FORBIDDEN');
    await request(app.getHttpServer()).post('/api/v1/communications/' + row.id + '/invalidate').send({ reason: 'Error' }).expect(401);
    await expect(amend(randomUUID(), f.owner.id, 'CORRECTION')).rejects.toThrow('COMMUNICATION_NOT_FOUND');
    await request(app.getHttpServer()).post('/api/v1/communications/' + row.id + '/amendments').set('Cookie', f.owner.cookie).set('Idempotency-Key', randomUUID()).send({ type: 'INVALIDATION', content: 'Error', authorUserId: other.id }).expect(400);
    expect((await communications().get(row.id, f.owner.id)).registeredBy.id).toBe(f.owner.id);
  });
  it('constraints SQL impiden invalidación sin hecho, hecho sin proyección y contenido vacío', async () => {
    const f = await fixture(), row = await incoming(f.process.id, f.owner.id, 1);
    await expect(prisma.communication.update({ where: { id: row.id }, data: { validity: 'INVALIDATED', version: 2 } })).rejects.toThrow();
    const data = { communicationId: row.id, authorUserId: f.owner.id, requestKey: randomUUID(), requestFingerprint: '0'.repeat(64), content: 'Contexto' };
    await expect(prisma.communicationAmendment.create({ data: { ...data, type: 'INVALIDATION' } })).rejects.toThrow();
    await expect(prisma.communicationAmendment.create({ data: { ...data, type: 'CORRECTION', content: ' \n\t' } })).rejects.toThrow();
    await expect(prisma.communicationAmendment.create({ data: { ...data, type: 'ANNOTATION', communicationId: randomUUID() } })).rejects.toThrow();
    expect((await communications().get(row.id, f.owner.id)).validity).toBe('VALID');
  });
  it('cerrado e inactivo el autor histórico: se conserva original y se permite contexto posterior', async () => {
    const f = await fixture(), writer = await actor(UserRole.PLANNING), row = await incoming(f.process.id, writer.id, 1);
    const process = await prisma.relationshipProcess.findUniqueOrThrow({ where: { id: f.process.id } });
    await processes.close(f.process.id, { expectedVersion: process.version, result: 'REJECTED' }, f.owner.id);
    await prisma.user.update({ where: { id: writer.id }, data: { isActive: false, deactivatedAt: new Date() } }); const before = await snapshot(f.process.id);
    await amend(row.id, f.owner.id, 'CORRECTION'); await amend(row.id, f.owner.id, 'INVALIDATION'); await amend(row.id, f.owner.id, 'ANNOTATION');
    const after = await snapshot(f.process.id); expect({ ...after, audit: before.audit }).toEqual(before);
    expect((await communications().get(row.id, f.owner.id)).registeredBy).toMatchObject({ id: writer.id, isActive: false });
  });
  it('1000 amendments: lectura pura, paginación acotada y SELECT constantes sin N+1', async () => {
    const f = await fixture(), row = await incoming(f.process.id, f.owner.id, 1); await amend(row.id, f.owner.id, 'ANNOTATION');
    const spy = jest.spyOn(Client.prototype, 'query');
    const queryText = (value: unknown) => typeof value === 'string' ? value : value && typeof value === 'object' && 'text' in value ? String(value.text) : '';
    const selectCount = () => spy.mock.calls.filter(([value]) => /^SELECT/i.test(queryText(value))).length;
    await read(f.owner.cookie, f.process.id, { pageSize: 5 }); const baseline = selectCount();
    await prisma.communicationAmendment.createMany({ data: Array.from({ length: 999 }, () => ({ communicationId: row.id, authorUserId: f.owner.id, type: 'ANNOTATION' as const, content: 'Contenido contextual', requestKey: randomUUID(), requestFingerprint: '0'.repeat(64) })) });
    const before = await snapshot(f.process.id); spy.mockClear(); const result = await read(f.owner.cookie, f.process.id, { pageSize: 5 });
    // 4.4: séptima fuente de reuniones; un SELECT adicional cuando está vacía, sin N+1.
    expect(result.items).toHaveLength(5); expect(result.nextCursor).not.toBeNull(); expect(selectCount()).toBe(baseline); expect(baseline).toBeLessThanOrEqual(20);
    expect(await snapshot(f.process.id)).toEqual(before); const detail = await amendments().list(row.id, 1, f.owner.id); expect(detail.items).toHaveLength(25); expect(detail.total).toBe(1000);
  });
});
