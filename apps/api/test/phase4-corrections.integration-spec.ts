import { Logger, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/config/application';
import { validateDatabaseUrl } from '../src/config/database-url';
import { validateEnvironment } from '../src/config/environment';
import { PrismaService } from '../src/database/prisma.service';
import { AuditAction, ProcessResult, UserRole } from '../src/generated/prisma/client';
import { AuditService } from '../src/modules/audit/audit.service';
import { SessionsService } from '../src/modules/auth/sessions.service';
import { CommunicationsService } from '../src/modules/communications/communications.service';
import { DirectoryHistoryService } from '../src/modules/directory/directory-history.service';
import { DirectoryService } from '../src/modules/directory/directory.service';
import { DirectoryTargetService } from '../src/modules/directory/directory-target.service';
import { MeetingsService } from '../src/modules/meetings/meetings.service';
import { NotificationConsumer, PROCESS_NOTIFICATION_CHECKPOINT } from '../src/modules/notifications/notification-consumer';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import type { NotificationPageDto } from '../src/modules/notifications/notification.dto';
import { OpportunitiesService } from '../src/modules/opportunities/opportunities.service';
import { RelationshipProcessesService } from '../src/modules/relationships/relationship-processes.service';
import { UsersService } from '../src/modules/users/users.service';

const databaseUrl = validateDatabaseUrl(process.env.DATABASE_URL);
if (!new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('Correcciones requieren base aislada _test.');
function barrier() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

describe('Correcciones finales Fase 4 PostgreSQL/HTTP', () => {
  let app: INestApplication<Server>, db: PrismaService, processes: RelationshipProcessesService,
    consumer: NotificationConsumer, users: UsersService;
  const ids: string[] = [], orgIds: string[] = [];
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ConfigService)
      .useValue(new ConfigService(validateEnvironment({ NODE_ENV: 'test', DATABASE_URL: databaseUrl }))).compile();
    app = module.createNestApplication<INestApplication<Server>>(); configureApplication(app); await app.init();
    db = app.get(PrismaService); processes = app.get(RelationshipProcessesService);
    consumer = app.get(NotificationConsumer); users = app.get(UsersService);
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await db.$transaction([
      db.notification.deleteMany({ where: { OR: [{ recipientUserId: { in: ids } }, { process: { createdByUserId: { in: ids } } }] } }),
      db.notificationDelivery.deleteMany({ where: { OR: [{ processSourceEvent: { actorUserId: { in: ids } } }, { meetingSourceEvent: { actorUserId: { in: ids } } }, { sourceEvent: { actorUserId: { in: ids } } }] } }),
      db.notificationCheckpoint.deleteMany(),
      db.auditEvent.deleteMany({ where: { actorUserId: { in: ids } } }),
      db.communicationRecipient.deleteMany({ where: { communication: { registeredByUserId: { in: ids } } } }),
      db.communication.deleteMany({ where: { registeredByUserId: { in: ids } } }),
      db.meetingEvent.deleteMany({ where: { actorUserId: { in: ids } } }),
      db.meetingParticipant.deleteMany({ where: { meeting: { createdByUserId: { in: ids } } } }),
      db.meeting.deleteMany({ where: { createdByUserId: { in: ids } } }),
      db.relationshipProcessEvent.deleteMany({ where: { process: { createdByUserId: { in: ids } } } }),
      db.processParticipant.deleteMany({ where: { process: { createdByUserId: { in: ids } } } }),
      db.relationshipProcess.deleteMany({ where: { createdByUserId: { in: ids } } }),
      db.opportunityEvent.deleteMany({ where: { actorUserId: { in: ids } } }),
      db.opportunityOrganization.deleteMany({ where: { opportunity: { createdByUserId: { in: ids } } } }),
      db.opportunity.deleteMany({ where: { createdByUserId: { in: ids } } }),
      db.directoryChange.deleteMany({ where: { actorUserId: { in: ids } } }),
      db.organization.deleteMany({ where: { id: { in: orgIds } } }),
      db.userSession.deleteMany({ where: { userId: { in: ids } } }), db.user.deleteMany({ where: { id: { in: ids } } }),
    ]);
    ids.length = orgIds.length = 0;
  });
  afterAll(async () => { await app.close(); });
  async function actor(role: UserRole = UserRole.RESEARCH) {
    const row = await users.createIdentity({ givenNames: 'QA', familyNames: 'Correcciones', email: randomUUID() + '@example.test', role });
    ids.push(row.id);
    const token = await db.$transaction(tx => app.get(SessionsService).create(row.id, tx));
    return { ...row, cookie: 'cecasem_session=' + token };
  }
  async function fixture() {
    const owner = await actor(), formal = await actor(), planning = await actor(UserRole.PLANNING),
      board = await actor(UserRole.BOARD), admin = await actor(UserRole.ADMINISTRATOR),
      outside = await actor(), unrelated = await actor(UserRole.PLANNING), inactive = await actor(UserRole.BOARD);
    const org = await app.get(DirectoryService).createOrganization({ name: 'Institución correcciones' }, owner.id); orgIds.push(org.id);
    let process = await processes.create({ organizationId: org.id, purpose: 'Cooperación confirmada' }, owner.id);
    for (const participant of [formal, planning, board]) {
      await app.get(CommunicationsService).registerReceived(process.id, {
        sender: 'institution@example.test', to: ['cecasem@example.test'], cc: [], bcc: [],
        subject: 'Actuación formal', body: 'Cuerpo privado que no debe copiarse', receivedAt: '2000-01-01T12:00:00Z',
      }, participant.id, randomUUID());
    }
    process = await processes.get(process.id, owner.id);
    await db.user.update({ where: { id: inactive.id }, data: { isActive: false, deactivatedAt: new Date() } });
    return { owner, formal, planning, board, admin, outside, unrelated, inactive, org, process };
  }
  async function audience(processId: string) {
    return (await db.notification.findMany({ where: { processId }, select: { recipientUserId: true } })).map(row => row.recipientUserId).sort();
  }
  async function close(f: Awaited<ReturnType<typeof fixture>>, result: ProcessResult = ProcessResult.ACHIEVED, actorId = f.owner.id) {
    return processes.close(f.process.id, { result, expectedVersion: f.process.version, observation: 'Resultado documentado' }, actorId);
  }
  function restarted() {
    return new NotificationConsumer(db, app.get(OpportunitiesService), users, app.get(ConfigService), app.get(MeetingsService), processes);
  }

  it('ACHIEVED une globales y participantes formales; excluye actor, ajenos e inactivos sin exigir sesión', async () => {
    const f = await fixture(); await close(f);
    await db.userSession.deleteMany({ where: { userId: { in: [f.admin.id, f.board.id] } } });
    await consumer.consumeBatch();
    expect(await audience(f.process.id)).toEqual([f.formal.id, f.planning.id, f.board.id, f.admin.id].sort());
    expect(await db.notificationDelivery.count({ where: { processId: f.process.id } })).toBe(1);
  });
  it.each([UserRole.ADMINISTRATOR, UserRole.BOARD])('actor global %s no recibe su propia actuación', async role => {
    const f = await fixture(); await close(f, ProcessResult.ACHIEVED, role === UserRole.BOARD ? f.board.id : f.admin.id);
    await consumer.consumeBatch(); expect(await audience(f.process.id)).not.toContain(role === UserRole.BOARD ? f.board.id : f.admin.id);
  });
  it.each([ProcessResult.REJECTED, ProcessResult.NO_RESPONSE, ProcessResult.CECASEM_WITHDREW, ProcessResult.OTHER])('cierre %s no crea aviso ni recibo de proceso', async result => {
    const f = await fixture(); await close(f, result); await consumer.consumeBatch();
    expect(await audience(f.process.id)).toEqual([]); expect(await db.notificationDelivery.count({ where: { processId: f.process.id } })).toBe(0);
  });
  it('estado ordinario y reapertura no avisan; conserva cierre anterior y distingue segundo cierre', async () => {
    const f = await fixture(); let process = await processes.changeState(f.process.id, { state: 'IN_PROGRESS', expectedVersion: f.process.version }, f.owner.id);
    await consumer.consumeBatch(); expect(await audience(process.id)).toEqual([]);
    process = await processes.close(process.id, { result: 'ACHIEVED', expectedVersion: process.version }, f.owner.id); await consumer.consumeBatch();
    const first = await db.notification.findMany({ where: { processId: process.id } });
    process = await processes.reopen(process.id, { state: 'IN_PROGRESS', reason: 'Nueva continuidad', expectedVersion: process.version }, f.owner.id);
    await consumer.consumeBatch(); expect(await db.notification.findMany({ where: { processId: process.id } })).toEqual(first);
    await processes.close(process.id, { result: 'ACHIEVED', expectedVersion: process.version }, f.owner.id); await consumer.consumeBatch();
    expect(await db.notificationDelivery.count({ where: { processId: process.id } })).toBe(2); expect(await audience(process.id)).toHaveLength(8);
  });
  it('dos consumidores, reinicio y cambio posterior de rol no duplican ni recalculan', async () => {
    const f = await fixture(); await close(f); await Promise.all([consumer.consumeBatch(), restarted().consumeBatch()]);
    await db.user.update({ where: { id: f.outside.id }, data: { role: 'BOARD' } });
    await db.user.update({ where: { id: f.inactive.id }, data: { isActive: true, deactivatedAt: null } });
    for (let i = 0; i < 3; i++) await restarted().consumeBatch();
    expect(await audience(f.process.id)).toEqual([f.formal.id, f.planning.id, f.board.id, f.admin.id].sort());
  });
  it('reunión deduplica global participante y excluye actor global; incorporación permanece individual', async () => {
    const f = await fixture(), service = app.get(MeetingsService);
    let meeting = await service.create({ processId: f.process.id, scheduledLocal: '2099-10-15T10:00', timezone: 'UTC', modality: 'ONLINE', purpose: 'Audiencia consolidada' }, f.owner.id, randomUUID());
    meeting = await service.addParticipant(meeting.id, { userId: f.unrelated.id, expectedVersion: meeting.version }, f.owner.id, randomUUID());
    await consumer.consumeBatch();
    const recipients = (type: 'MEETING_CREATED' | 'MEETING_PARTICIPANT_ADDED' | 'MEETING_CANCELLED') => db.notification.findMany({ where: { meetingId: meeting.id, type }, select: { recipientUserId: true } }).then(rows => rows.map(row => row.recipientUserId).sort());
    expect(await recipients('MEETING_CREATED')).toEqual([f.formal.id, f.planning.id, f.board.id, f.admin.id, f.unrelated.id].sort());
    expect(await recipients('MEETING_PARTICIPANT_ADDED')).toEqual([f.unrelated.id]);
    await service.cancel(meeting.id, { expectedVersion: meeting.version, reason: 'Cambio institucional' }, f.board.id, randomUUID()); await consumer.consumeBatch();
    expect(await recipients('MEETING_CANCELLED')).toEqual([f.owner.id, f.formal.id, f.planning.id, f.admin.id, f.unrelated.id].sort());
  });
  it('HTTP /me es privado y mínimo; contador/lectura no alteran proceso, actividad, historial ni recordatorios', async () => {
    const f = await fixture(); await close(f); await consumer.consumeBatch();
    const before = await db.relationshipProcess.findUniqueOrThrow({ where: { id: f.process.id } }), events = await db.relationshipProcessEvent.count(), reminders = await db.reminderOccurrence.count();
    const response = await request(app.getHttpServer()).get('/api/v1/me/notifications').set('Cookie', f.formal.cookie).expect(200).expect('Cache-Control', 'no-store');
    const row = (response.body as NotificationPageDto).items[0]; expect(row.type).toBe('PROCESS_ACHIEVED');
    expect(Object.keys(row.process!).sort()).toEqual(['context', 'id', 'occurredAt', 'purpose']);
    expect(row.process!.id).toBe(f.process.id); expect(JSON.stringify(row)).not.toMatch(/Cuerpo privado|sourceEventId|actorUserId/);
    await request(app.getHttpServer()).get('/api/v1/me/notifications').expect(401);
    await request(app.getHttpServer()).patch('/api/v1/me/notifications/' + row.id + '/read').set('Cookie', f.outside.cookie).send({}).expect(404);
    await request(app.getHttpServer()).get('/api/v1/me/notifications/unread-count').set('Cookie', f.formal.cookie).expect(200, { count: 1 });
    await request(app.getHttpServer()).patch('/api/v1/me/notifications/' + row.id + '/read').set('Cookie', f.formal.cookie).send({}).expect(200);
    expect(await app.get(NotificationsService).unreadCount(f.formal.id)).toEqual({ count: 0 });
    expect(await db.relationshipProcess.findUniqueOrThrow({ where: { id: f.process.id } })).toEqual(before);
    expect(await db.relationshipProcessEvent.count()).toBe(events); expect(await db.reminderOccurrence.count()).toBe(reminders);
  });
  it('rollback del cierre no produce hecho; fallo de Processes no impide Opportunities/Meetings y se recupera', async () => {
    const f = await fixture(), audit = app.get(AuditService); jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(audit, 'recordProcess').mockRejectedValueOnce(new Error('fallo productor'));
    await expect(close(f)).rejects.toThrow(); expect((await processes.get(f.process.id, f.owner.id)).state).not.toBe('CLOSED');
    await consumer.consumeBatch(); expect(await audience(f.process.id)).toEqual([]);
    await close(f);
    const opportunity = await app.get(OpportunitiesService).create({ name: 'Fuente independiente', organizationIds: [f.org.id] }, f.owner.id, randomUUID());
    const meeting = await app.get(MeetingsService).create({ processId: f.process.id, scheduledLocal: '2099-10-15T10:00', timezone: 'UTC', modality: 'ONLINE', purpose: 'Continuidad' }, f.owner.id, randomUUID());
    jest.spyOn(processes, 'recordedActivity').mockRejectedValueOnce(new Error('fuente procesos'));
    await expect(consumer.consumeBatch()).rejects.toThrow();
    expect(await db.notificationDelivery.count({ where: { opportunityId: opportunity.id } })).toBe(1);
    expect(await db.notificationDelivery.count({ where: { meetingId: meeting.id } })).toBe(1);
    expect(await audience(f.process.id)).toEqual([]); await consumer.consumeBatch(); expect(await audience(f.process.id)).toHaveLength(4);
  });
  it('PostgreSQL exige evento CLOSED/ACHIEVED real, contexto único, deduplicación y procedencia inmutable', async () => {
    const f = await fixture(); await close(f); await consumer.consumeBatch();
    const row = await db.notification.findFirstOrThrow({ where: { processId: f.process.id } });
    const created = await db.relationshipProcessEvent.findFirstOrThrow({ where: { processId: f.process.id, type: 'CREATED' } });
    const data = { sourceEventId: row.sourceEventId, processId: f.process.id, recipientUserId: f.outside.id, type: 'PROCESS_ACHIEVED' as const };
    await expect(db.notificationDelivery.create({ data: { sourceEventId: created.id, processId: f.process.id, sourceType: null } })).rejects.toThrow();
    await expect(db.notificationDelivery.create({ data: { sourceEventId: randomUUID(), processId: f.process.id, sourceType: null } })).rejects.toThrow();
    await expect(db.notification.create({ data: { ...data, processId: randomUUID() } })).rejects.toThrow();
    await expect(db.notification.create({ data: { ...data, opportunityId: randomUUID() } })).rejects.toThrow();
    await expect(db.notification.create({ data: { ...data, type: 'MEETING_CREATED' } })).rejects.toThrow();
    await expect(db.notification.create({ data: { ...data, recipientUserId: row.recipientUserId } })).rejects.toThrow();
    await expect(db.notification.update({ where: { id: row.id }, data: { processId: randomUUID() } })).rejects.toThrow();
    await expect(db.notificationDelivery.update({ where: { sourceEventId: row.sourceEventId! }, data: { processedAt: new Date(0) } })).rejects.toThrow();
  });
  it('savepoint revierte recibo/avisos fallidos, confirma otro evento y recupera en siguiente barrido', async () => {
    const f = await fixture(); await close(f); const source = await db.relationshipProcessEvent.findFirstOrThrow({ where: { processId: f.process.id, type: 'CLOSED' } });
    const other = await processes.create({ organizationId: f.org.id, purpose: 'Segundo hecho' }, f.owner.id);
    await processes.close(other.id, { result: 'ACHIEVED', expectedVersion: 1 }, f.owner.id);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    await db.$executeRawUnsafe(`CREATE FUNCTION phase4_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."sourceEventId"='${source.id}'::uuid THEN RAISE EXCEPTION 'controlled failure'; END IF; RETURN NEW; END; $$`);
    await db.$executeRawUnsafe('CREATE TRIGGER phase4_test_failure BEFORE INSERT ON "Notification" FOR EACH ROW EXECUTE FUNCTION phase4_test_failure()');
    try {
      expect((await consumer.consumeBatch()).failed).toBe(1); expect(await audience(f.process.id)).toEqual([]);
      expect(await db.notificationDelivery.count({ where: { sourceEventId: source.id } })).toBe(0); expect(await audience(other.id)).toHaveLength(2);
    } finally { await db.$executeRawUnsafe('DROP TRIGGER phase4_test_failure ON "Notification"'); await db.$executeRawUnsafe('DROP FUNCTION phase4_test_failure()'); }
    await consumer.consumeBatch(); expect(await audience(f.process.id)).toHaveLength(4);
  });
  it('límite superior termina barrido con nuevas altas; frontera compuesta valida límites y cursor', async () => {
    const owner = await actor(), board = await actor(UserRole.BOARD);
    const org = await app.get(DirectoryService).createOrganization({ name: 'Lotes' }, owner.id); orgIds.push(org.id);
    for (let i = 0; i < 14; i++) { const p = await processes.create({ organizationId: org.id, purpose: 'Lote ' + i }, owner.id); await processes.close(p.id, { expectedVersion: 1, result: 'ACHIEVED' }, owner.id); }
    await consumer.consumeBatch(); const checkpoint = await db.notificationCheckpoint.findUniqueOrThrow({ where: { id: PROCESS_NOTIFICATION_CHECKPOINT } });
    expect(checkpoint.afterEventId).not.toBeNull(); expect(checkpoint.throughEventId).not.toBeNull();
    const late = await processes.create({ organizationId: org.id, purpose: 'Alta posterior' }, owner.id); await processes.close(late.id, { expectedVersion: 1, result: 'ACHIEVED' }, owner.id);
    await restarted().consumeBatch(); expect((await db.notificationCheckpoint.findUniqueOrThrow({ where: { id: PROCESS_NOTIFICATION_CHECKPOINT } })).completedSweeps).toBe(1);
    await consumer.consumeBatch(); await consumer.consumeBatch(); expect(await db.notification.count({ where: { recipientUserId: board.id, type: 'PROCESS_ACHIEVED' } })).toBe(15);
    await expect(processes.recordedActivity({ id: 'invalid', createdAt: new Date() }, 1)).rejects.toThrow();
    await expect(processes.recordedActivity(undefined, 101)).rejects.toThrow();
  });
  it('commit tardío detrás del cursor e histórico ACHIEVED sin recibo se descubren una sola vez', async () => {
    const f = await fixture(), lateActor = await actor(), org = await app.get(DirectoryService).createOrganization({ name: 'Tardío' }, lateActor.id); orgIds.push(org.id);
    // La fecha oficial no tiene corte de adopción: se conserva la fecha del hecho, incluso anterior al barrido.
    const late = await processes.create({ organizationId: org.id, purpose: 'Commit tardío' }, lateActor.id);
    const historical = await processes.create({ organizationId: org.id, purpose: 'Histórico confirmado' }, lateActor.id);
    const insertConfirmed = (processId: string, at: Date, wait?: ReturnType<typeof barrier>) => db.$transaction(async tx => {
      await tx.relationshipProcess.update({ where: { id: processId }, data: { state: 'CLOSED', currentResult: 'ACHIEVED', closedAt: at, closedByUserId: lateActor.id, version: 2 } });
      const event = await tx.relationshipProcessEvent.create({ data: { processId, type: 'CLOSED', previousState: 'PREPARATION', newState: 'CLOSED', result: 'ACHIEVED', actorUserId: lateActor.id, authority: 'PARTICIPANT', version: 2, createdAt: at } });
      await app.get(AuditService).recordProcess(AuditAction.PROCESS_CLOSED, event.id, lateActor.id, randomUUID(), tx);
      if (wait) { entered.release(); await wait.promise; }
    });
    await insertConfirmed(historical.id, new Date('2001-01-01'));
    await close(f);
    const entered = barrier(), gate = barrier();
    // Inserción de fuente histórica con fecha anterior, transacción real sin alterar el reloj de Prisma.
    const pending = insertConfirmed(late.id, new Date('2002-01-01'), gate); await entered.promise;
    try { await consumer.consumeBatch(); expect(await db.notificationDelivery.count({ where: { processId: late.id } })).toBe(0); }
    finally { gate.release(); await pending; }
    await consumer.consumeBatch(); await restarted().consumeBatch();
    expect(await db.notificationDelivery.count({ where: { processId: { in: [late.id, historical.id] } } })).toBe(2);
  });
  it.each(['create', 'update'] as const)('Organization update ↔ Opportunity %s: intercalado controlado confirma ambas operaciones y su historial/auditoría', async operation => {
    const owner = await actor(), directory = app.get(DirectoryService), opportunities = app.get(OpportunitiesService);
    const org = await directory.createOrganization({ name: 'Antes del cruce' }, owner.id); orgIds.push(org.id);
    const existing = operation === 'update' ? await opportunities.create({ name: 'Antes oportunidad', organizationIds: [org.id] }, owner.id, randomUUID()) : null;
    const entered = barrier(), gate = barrier(), targetEntered = barrier(), history = app.get(DirectoryHistoryService), targets = app.get(DirectoryTargetService);
    const originalHistory = history.record.bind(history), originalTargets = targets.requireOrganizationLinks.bind(targets);
    jest.spyOn(history, 'record').mockImplementation(async (...args) => { entered.release(); await gate.promise; return originalHistory(...args); });
    jest.spyOn(targets, 'requireOrganizationLinks').mockImplementation((...args) => { targetEntered.release(); return originalTargets(...args); });
    const edit = directory.editOrganization(org.id, { name: 'Después del cruce', expectedVersion: org.version }, owner.id); await entered.promise;
    const opportunity = existing ? opportunities.update(existing.id, { name: 'Después oportunidad', expectedVersion: existing.version }, owner.id)
      : opportunities.create({ name: 'Después oportunidad', organizationIds: [org.id] }, owner.id, randomUUID());
    await targetEntered.promise;
    // Opportunity ya sostiene el lock de User y está por adquirir Organization; Directory sostiene Organization.
    gate.release(); const [organization, row] = await Promise.all([edit, opportunity]);
    expect(organization.name).toBe('Después del cruce'); expect(organization.version).toBe(org.version + 1); expect(row.name).toBe('Después oportunidad');
    expect(await db.directoryChange.count({ where: { organizationId: org.id, field: 'name', newValue: { equals: 'Después del cruce' } } })).toBe(1);
    const event = await db.opportunityEvent.findFirstOrThrow({ where: { opportunityId: row.id, type: operation === 'create' ? 'CREATED' : 'UPDATED' } });
    expect(await db.auditEvent.count({ where: { opportunityEventId: event.id } })).toBe(1);
    expect(await db.auditEvent.count({ where: { organizationId: org.id, action: 'ORGANIZATION_UPDATED' } })).toBe(1);
  });
});
