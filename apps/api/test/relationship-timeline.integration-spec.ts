import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { Client } from 'pg';
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
import { InternalNotesService } from '../src/modules/relationships/internal-notes.service';
import { RelationshipTimelineService } from '../src/modules/relationships/relationship-timeline.service';
import { CommunicationsService } from '../src/modules/communications/communications.service';
import type { TimelineItem, TimelinePageDto } from '../src/modules/relationships/timeline.dto';
const databaseUrl = validateDatabaseUrl(process.env.DATABASE_URL);
if (!new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('Timeline requiere una base aislada _test.');
describe('Timeline y notas internas PostgreSQL/HTTP', () => {
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
  const notes = () => app.get(InternalNotesService), communications = () => app.get(CommunicationsService);
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
  it.each(Object.values(UserRole))('%s no participante lee creación y puede agregar nota sin efectos formales', async role => {
    const f = await fixture(), writer = await actor(role), before = await snapshot(f.process.id);
    const original = '  <script>literal</script>\nContexto administrativo  ';
    const created = (await request(app.getHttpServer()).post('/api/v1/relationship-processes/' + f.process.id + '/notes').set('Cookie', writer.cookie).send({ body: original }).expect(201)).body as TimelineItem;
    expect(created).toMatchObject({ kind: 'INTERNAL_NOTE', actor: { id: writer.id }, payload: { body: original } });
    expect(await snapshot(f.process.id)).toEqual(before);
    const timeline = await read(writer.cookie, f.process.id); expect(timeline.items.map(item => item.kind)).toEqual(['PROCESS_CREATED', 'INTERNAL_NOTE']);
    expect(await snapshot(f.process.id)).toEqual(before); expect(timeline.nextCursor).toBeNull();
    await request(app.getHttpServer()).patch('/api/v1/relationship-processes/' + f.process.id + '/notes/' + created.id).set('Cookie', writer.cookie).send({ body: 'Cambio' }).expect(404);
    await request(app.getHttpServer()).delete('/api/v1/relationship-processes/' + f.process.id + '/notes/' + created.id).set('Cookie', writer.cookie).expect(404);
    expect((await prisma.internalNote.findUniqueOrThrow({ where: { id: created.id } })).body).toBe(original);
    if (role === UserRole.RESEARCH || role === UserRole.PLANNING) await request(app.getHttpServer()).post('/api/v1/relationship-processes/' + f.process.id + '/close').set('Cookie', writer.cookie).send({ expectedVersion: before.process.version, result: 'REJECTED' }).expect(403);
  });
  it('base, cambio de estado y nota en cerrado mantienen hechos y participación', async () => {
    const f = await fixture(), observer = await actor(UserRole.PLANNING);
    expect((await read(observer.cookie, f.process.id)).items[0]).toMatchObject({ kind: 'PROCESS_CREATED', actor: { id: f.owner.id }, payload: { previousState: null, newState: 'PREPARATION' } });
    const changed = await processes.changeState(f.process.id, { state: 'IN_PROGRESS', expectedVersion: 1, reason: 'Inicio formal' }, f.owner.id);
    await processes.close(f.process.id, { expectedVersion: changed.version, result: 'OTHER', observation: 'Cierre documentado' }, f.owner.id);
    const before = await snapshot(f.process.id); await notes().create(f.process.id, 'Contexto posterior al cierre', observer.id);
    expect(await snapshot(f.process.id)).toEqual(before);
    const timeline = await read(observer.cookie, f.process.id); expect(timeline.items.map(item => item.kind)).toEqual(['PROCESS_CREATED', 'PROCESS_STATE_CHANGED', 'PROCESS_CLOSED', 'INTERNAL_NOTE']);
    expect(timeline.items[1].payload).toMatchObject({ previousState: 'PREPARATION', newState: 'IN_PROGRESS', observation: 'Inicio formal' });
    expect(timeline.items[2].payload).toMatchObject({ result: 'OTHER', observation: 'Cierre documentado' });
  });
  it.each([{}, { body: '' }, { body: ' \n\t' }, { body: null }, { body: 1 }, { body: 'a'.repeat(5001) }, { body: 'A\0B' }, { body: 'Texto', recipients: ['inventado@example.test'] }])('nota inválida %j no se persiste', async body => {
    const f = await fixture(), before = await snapshot(f.process.id);
    await request(app.getHttpServer()).post('/api/v1/relationship-processes/' + f.process.id + '/notes').set('Cookie', f.owner.cookie).send(body).expect(400);
    expect(await prisma.internalNote.count({ where: { processId: f.process.id } })).toBe(0); expect(await snapshot(f.process.id)).toEqual(before);
  });
  it('autorización y procesos inexistentes: sesión, usuario activo y capabilities actuales', async () => {
    const f = await fixture();
    for (const path of ['timeline', 'notes']) {
      const query = request(app.getHttpServer())[path === 'notes' ? 'post' : 'get']('/api/v1/relationship-processes/' + f.process.id + '/' + path);
      await query.send(path === 'notes' ? { body: 'Contexto' } : undefined).expect(401);
    }
    await request(app.getHttpServer()).post('/api/v1/relationship-processes/' + randomUUID() + '/notes').set('Cookie', f.owner.cookie).send({ body: 'Contexto' }).expect(404);
    await request(app.getHttpServer()).get('/api/v1/relationship-processes/' + randomUUID() + '/timeline').set('Cookie', f.owner.cookie).expect(404);
    await prisma.user.update({ where: { id: f.owner.id }, data: { isActive: false, deactivatedAt: new Date() } });
    await expect(notes().create(f.process.id, 'Contexto', f.owner.id)).rejects.toThrow('FORBIDDEN');
    await expect(app.get(RelationshipTimelineService).get(f.process.id, { pageSize: 25 }, f.owner.id)).rejects.toThrow('FORBIDDEN');
  });
  it.each([{ pageSize: 0 }, { pageSize: 101 }, { pageSize: 'bad' }, { after: 'mal formado' }, { after: '' }, { after: 'e30' }, { unknown: 1 }])('query de timeline inválida %j', async query => {
    const f = await fixture(); await request(app.getHttpServer()).get('/api/v1/relationship-processes/' + f.process.id + '/timeline').set('Cookie', f.owner.cookie).query(query).expect(400);
  });
  it('secuencia 01 creación, 02 SENT, 04 cierre, 05 recibida/nota, 06 reapertura; retrospectiva 03 se intercala', async () => {
    const f = await fixture(), processId = f.process.id;
    await prisma.relationshipProcess.update({ where: { id: processId }, data: { createdAt: new Date('2000-10-01T12:00:00.000Z') } });
    await prisma.relationshipProcessEvent.updateMany({ where: { processId, type: 'CREATED' }, data: { createdAt: new Date('2000-10-01T12:00:00.000Z') } });
    const account = await users.createEmailAccount({ address: randomUUID() + '@example.test', displayName: 'Buzón histórico' }); accountIds.push(account.id); await users.assignEmailAccount(f.owner.id, account.id);
    const sent = await communications().registerSent(processId, { emailAccountId: account.id, to: ['Old@Example.test'], cc: [], bcc: [], subject: 'Propuesta', body: 'Cuerpo enviado privado', sentAt: '2000-10-02T12:00:00.000Z' }, f.owner.id, randomUUID());
    let current = await processes.get(processId, f.owner.id); await processes.close(processId, { expectedVersion: current.version, result: 'REJECTED', observation: 'Sin aceptación' }, f.owner.id);
    await prisma.relationshipProcessEvent.updateMany({ where: { processId, type: 'CLOSED' }, data: { createdAt: new Date('2000-10-04T12:00:00.000Z') } });
    await prisma.relationshipProcess.update({ where: { id: processId }, data: { closedAt: new Date('2000-10-04T12:00:00.000Z') } });
    const received = await incoming(processId, f.owner.id, 5); expect((await processes.get(processId, f.owner.id)).state).toBe('CLOSED');
    const note = await notes().create(processId, 'Nota mientras está cerrado', f.owner.id);
    await prisma.internalNote.update({ where: { id: note.id }, data: { createdAt: new Date('2000-10-05T15:00:00.000Z') } });
    current = await processes.get(processId, f.owner.id); await processes.reopen(processId, { expectedVersion: current.version, state: 'IN_PROGRESS', reason: 'Respuesta del mismo acercamiento' }, f.owner.id);
    await prisma.relationshipProcessEvent.updateMany({ where: { processId, type: 'REOPENED' }, data: { createdAt: new Date('2000-10-06T12:00:00.000Z') } });
    const kinds = ['PROCESS_CREATED', 'SENT_COMMUNICATION', 'PROCESS_CLOSED', 'RECEIVED_COMMUNICATION', 'INTERNAL_NOTE', 'PROCESS_REOPENED'];
    const row = await read(f.owner.cookie, processId); expect(row.items.map(item => item.kind)).toEqual(kinds);
    expect(row.items[1]).toMatchObject({ id: sent.id, payload: { sender: account.address, recipients: [{ addressOriginal: 'Old@Example.test' }] } });
    expect(row.items[3]).toMatchObject({ id: received.id, payload: { sender: 'Old@Example.test', recipientTotal: 3 } });
    expect(row.items[5].payload).toMatchObject({ newState: 'IN_PROGRESS', observation: 'Respuesta del mismo acercamiento' });
    expect(JSON.stringify(row)).not.toContain(sent.bodyOriginal); expect(JSON.stringify(row)).not.toContain(received.bodyOriginal); expect(JSON.stringify(row)).not.toContain('bodyOriginal');
    const retrospective = await incoming(processId, f.owner.id, 3), before = await snapshot(processId);
    const refreshed = await read(f.owner.cookie, processId); expect(refreshed.items.map(item => item.kind)).toEqual([...kinds.slice(0, 2), 'RECEIVED_COMMUNICATION', ...kinds.slice(2)]);
    expect(refreshed.items[2].id).toBe(retrospective.id); expect(await snapshot(processId)).toEqual(before);
  });
  it('empates entre fuentes y IDs: cursor recorre todo sin duplicar ni saltar', async () => {
    const f = await fixture(), date = new Date('2000-10-01T12:00:00.000Z'), first = await incoming(f.process.id, f.owner.id, 1), second = await incoming(f.process.id, f.owner.id, 1), note = await notes().create(f.process.id, 'Empate', f.owner.id);
    await prisma.communication.updateMany({ where: { processId: f.process.id }, data: { createdAt: date } });
    await prisma.relationshipProcessEvent.updateMany({ where: { processId: f.process.id }, data: { createdAt: date } });
    await prisma.internalNote.update({ where: { id: note.id }, data: { createdAt: date } });
    const items: TimelineItem[] = []; let after: string | undefined;
    do { const page = await read(f.owner.cookie, f.process.id, { pageSize: 1, ...(after ? { after } : {}) }); items.push(...page.items); after = page.nextCursor ?? undefined; } while (after);
    expect(items.map(item => item.id)).toEqual([...[first.id, second.id].sort(), f.process.events[0].id, note.id]);
    expect(items.map(item => item.kind)).toEqual(['RECEIVED_COMMUNICATION', 'RECEIVED_COMMUNICATION', 'PROCESS_CREATED', 'INTERNAL_NOTE']);
  });
  it('cursor estable ante inserciones antes y después: refrescar recupera el retrospectivo anterior', async () => {
    const f = await fixture(); await prisma.relationshipProcessEvent.updateMany({ where: { processId: f.process.id }, data: { createdAt: new Date('2000-10-01T00:00:00.000Z') } });
    const second = await incoming(f.process.id, f.owner.id, 2), fourth = await incoming(f.process.id, f.owner.id, 4);
    const firstPage = await read(f.owner.cookie, f.process.id, { pageSize: 2 }); expect(firstPage.items[1].id).toBe(second.id);
    const before = await incoming(f.process.id, f.owner.id, 1), between = await incoming(f.process.id, f.owner.id, 3);
    const next = await read(f.owner.cookie, f.process.id, { pageSize: 2, after: firstPage.nextCursor });
    expect(next.items.map(item => item.id)).toEqual([between.id, fourth.id]); expect(next.nextCursor).toBeNull();
    expect((await read(f.owner.cookie, f.process.id)).items.map(item => item.id)).toContain(before.id);
    const other = await processes.create({ organizationId: orgIds[0], purpose: 'Otro proceso' }, f.owner.id);
    await request(app.getHttpServer()).get('/api/v1/relationship-processes/' + other.id + '/timeline').set('Cookie', f.owner.cookie).query({ after: firstPage.nextCursor }).expect(400);
  });
  it('1000 notas y 1000 comunicaciones: respuesta y consultas acotadas, sin N+1', async () => {
    const f = await fixture(); await incoming(f.process.id, f.owner.id, 1); await notes().create(f.process.id, 'Semilla', f.owner.id);
    const querySpy = jest.spyOn(Client.prototype, 'query'), queryText = (value: unknown) => typeof value === 'string' ? value : value && typeof value === 'object' && 'text' in value ? String(value.text) : '';
    const selectCount = () => querySpy.mock.calls.filter(([value]) => /^SELECT/i.test(queryText(value).trim())).length;
    await read(f.owner.cookie, f.process.id, { pageSize: 5 }); const baseline = selectCount(); querySpy.mockClear();
    await prisma.internalNote.createMany({ data: Array.from({ length: 999 }, () => ({ processId: f.process.id, authorUserId: f.owner.id, body: 'Carga interna' })) });
    await prisma.communication.createMany({ data: Array.from({ length: 999 }, () => ({ processId: f.process.id, direction: 'RECEIVED' as const,
      senderSnapshot: 'Old@Example.test', senderNormalizedAddress: 'old@example.test', subject: 'Carga histórica', bodyOriginal: 'Cuerpo privado no proyectado '.repeat(100),
      receivedAt: new Date('2000-09-01T12:00:00.000Z'), occurredAt: new Date('2000-09-01T12:00:00.000Z'), registeredByUserId: f.owner.id, requestKey: randomUUID(), requestFingerprint: '0'.repeat(64) })) });
    const before = await snapshot(f.process.id); querySpy.mockClear(); const row = await read(f.owner.cookie, f.process.id, { pageSize: 5 });
    // 3.8 agrega la cuarta fuente y la marca histórica de invalidación por lotes.
    expect(row.items).toHaveLength(5); expect(row.nextCursor).not.toBeNull(); expect(selectCount()).toBe(baseline); expect(baseline).toBeLessThanOrEqual(16);
    expect(JSON.stringify(row).length).toBeLessThan(15000); expect(await snapshot(f.process.id)).toEqual(before);
  });
  it('constraint SQL rechaza nota vacía y conserva referencias restrictivas', async () => {
    const f = await fixture(); await expect(prisma.internalNote.create({ data: { processId: f.process.id, authorUserId: f.owner.id, body: ' \n\t' } })).rejects.toThrow();
    await notes().create(f.process.id, 'Nota persistida', f.owner.id);
    await expect(prisma.internalNote.create({ data: { processId: randomUUID(), authorUserId: f.owner.id, body: 'Actor inexistente' } })).rejects.toThrow();
  });
  it('nota que espera credenciales usa fecha efectiva de registro, posterior al cierre concurrente', async () => {
    const f = await fixture(), writer = await actor(UserRole.PLANNING);
    let release!: () => void, ready!: () => void;
    const released = new Promise<void>(resolve => { release = resolve; }), locked = new Promise<void>(resolve => { ready = resolve; });
    const holder = prisma.$transaction(async tx => { await tx.$queryRaw`SELECT id FROM "User" WHERE id=${writer.id}::uuid FOR UPDATE`; ready(); await released; });
    await locked;
    const pending = notes().create(f.process.id, 'Contexto después de esperar', writer.id);
    try {
      let waiting = false;
      for (let index = 0; index < 100 && !waiting; index++) {
        const [row] = await prisma.$queryRaw<{ waiting: boolean }[]>`SELECT EXISTS (SELECT 1 FROM pg_locks WHERE NOT granted) AS waiting`; waiting = row.waiting;
      }
      expect(waiting).toBe(true);
      const closed = await processes.close(f.process.id, { expectedVersion: 1, result: 'REJECTED' }, f.owner.id);
      release(); await holder; const created = await pending;
      expect(+new Date(created.registeredAt)).toBeGreaterThanOrEqual(+new Date(closed.closedAt!));
      expect((await read(writer.cookie, f.process.id)).items.map(item => item.kind)).toEqual(['PROCESS_CREATED', 'PROCESS_CLOSED', 'INTERNAL_NOTE']);
    } finally { release(); await holder; await pending; }
  });
});
