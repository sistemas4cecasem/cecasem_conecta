import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import type { INestApplication } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/config/application';
import { validateEnvironment } from '../src/config/environment';
import { validateDatabaseUrl } from '../src/config/database-url';
import { PrismaService } from '../src/database/prisma.service';
import { UserRole } from '../src/generated/prisma/client';
import { UsersService } from '../src/modules/users/users.service';
import { SessionsService } from '../src/modules/auth/sessions.service';
import { OpportunitiesService } from '../src/modules/opportunities/opportunities.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { NotificationConsumer, NOTIFICATION_CHECKPOINT } from '../src/modules/notifications/notification-consumer';
import type { NotificationPageDto } from '../src/modules/notifications/notification.dto';

const databaseUrl = validateDatabaseUrl(process.env.DATABASE_URL);
if (!new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('Notificaciones requieren base aislada _test.');

describe('P0 notificaciones PostgreSQL/HTTP', () => {
  let app: INestApplication<Server>, prisma: PrismaService, consumer: NotificationConsumer,
    opportunities: OpportunitiesService, notifications: NotificationsService;
  const userIds: string[] = [], orgIds: string[] = [];
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ConfigService)
      .useValue(new ConfigService(validateEnvironment({ NODE_ENV: 'test', DATABASE_URL: databaseUrl }))).compile();
    app = module.createNestApplication<INestApplication<Server>>(); configureApplication(app); await app.init();
    prisma = app.get(PrismaService); consumer = app.get(NotificationConsumer);
    opportunities = app.get(OpportunitiesService); notifications = app.get(NotificationsService);
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    const owned = { opportunity: { createdByUserId: { in: userIds } } };
    await prisma.$transaction([
      prisma.notification.deleteMany({ where: { OR: [{ recipientUserId: { in: userIds } }, { delivery: { sourceEvent: { actorUserId: { in: userIds } } } }] } }),
      prisma.notificationDelivery.deleteMany({ where: { sourceEvent: { actorUserId: { in: userIds } } } }),
      prisma.notificationCheckpoint.deleteMany(),
      prisma.auditEvent.deleteMany({ where: { actorUserId: { in: userIds } } }),
      prisma.opportunityEvent.deleteMany({ where: { actorUserId: { in: userIds } } }),
      prisma.opportunityOrganization.deleteMany({ where: owned }), prisma.opportunity.deleteMany({ where: { createdByUserId: { in: userIds } } }),
      prisma.organization.deleteMany({ where: { id: { in: orgIds } } }),
      prisma.userSession.deleteMany({ where: { userId: { in: userIds } } }), prisma.user.deleteMany({ where: { id: { in: userIds } } }),
    ]);
    userIds.length = orgIds.length = 0;
  });
  afterAll(async () => { await app.close(); });
  async function actor(role: UserRole = UserRole.RESEARCH) {
    const user = await app.get(UsersService).createIdentity({ givenNames: 'QA', familyNames: randomUUID().slice(0, 8), email: randomUUID() + '@example.test', role });
    userIds.push(user.id);
    const token = await prisma.$transaction(tx => app.get(SessionsService).create(user.id, tx));
    return { ...user, cookie: 'cecasem_session=' + token };
  }
  async function create(ownerId: string) {
    const org = await prisma.organization.create({ data: { name: 'Organización P0 ' + randomUUID() } }); orgIds.push(org.id);
    return opportunities.create({ name: 'Oportunidad P0', organizationIds: [org.id] }, ownerId, randomUUID());
  }
  async function setup() {
    const research = await actor(), planning = await actor(UserRole.PLANNING), board = await actor(UserRole.BOARD), admin = await actor(UserRole.ADMINISTRATOR);
    const row = await create(research.id); return { research, planning, board, admin, row };
  }
  async function ownedId(userId: string, opportunityId: string) {
    return (await prisma.notification.findFirstOrThrow({ where: { recipientUserId: userId, opportunityId } })).id;
  }

  it('Búsqueda crea; Planificación, Directorio y Administración reciben, otro Búsqueda no', async () => {
    const { research, planning, board, admin, row } = await setup(), other = await actor();
    await consumer.consumeBatch();
    expect((await prisma.notification.findMany({ where: { opportunityId: row.id }, select: { recipientUserId: true } })).map(n => n.recipientUserId).sort())
      .toEqual([planning.id, board.id, admin.id].sort());
    expect(await notifications.unreadCount(research.id)).toEqual({ count: 0 });
    expect(await notifications.unreadCount(other.id)).toEqual({ count: 0 });
    const response = await request(app.getHttpServer()).get('/api/v1/me/notifications').set('Cookie', planning.cookie).expect(200);
    expect((response.body as NotificationPageDto).items[0].opportunity.id).toBe(row.id);
    expect(response.headers['cache-control']).toBe('no-store');
    const id = await ownedId(planning.id, row.id);
    await request(app.getHttpServer()).patch('/api/v1/me/notifications/' + id + '/read').set('Cookie', planning.cookie).send({}).expect(200);
    await request(app.getHttpServer()).get('/api/v1/me/notifications/unread-count').set('Cookie', planning.cookie).expect(200, { count: 0 });
  });
  it('reprocesar y ejecutar dos consumidores no duplica ni cambia destinatarios tras cambio de rol', async () => {
    const { planning, research, row } = await setup();
    await Promise.all([consumer.consumeBatch(), consumer.consumeBatch()]);
    await prisma.user.update({ where: { id: research.id }, data: { role: UserRole.PLANNING } });
    await consumer.consumeBatch(); await consumer.consumeBatch();
    expect(await prisma.notification.count({ where: { opportunityId: row.id } })).toBe(3);
    expect(await prisma.notification.count({ where: { opportunityId: row.id, recipientUserId: research.id } })).toBe(0);
    expect(await prisma.notification.count({ where: { opportunityId: row.id, recipientUserId: planning.id } })).toBe(1);
  });
  it('aplica actividad y rol actuales antes del procesamiento', async () => {
    const { planning, board, row } = await setup(), inactive = await actor(UserRole.PLANNING), promoted = await actor();
    await prisma.user.update({ where: { id: inactive.id }, data: { isActive: false, deactivatedAt: new Date() } });
    await prisma.user.update({ where: { id: board.id }, data: { role: UserRole.RESEARCH } });
    await prisma.user.update({ where: { id: promoted.id }, data: { role: UserRole.PLANNING } });
    await consumer.consumeBatch();
    const recipients = (await prisma.notification.findMany({ where: { opportunityId: row.id } })).map(n => n.recipientUserId);
    expect(recipients).toContain(planning.id); expect(recipients).toContain(promoted.id);
    expect(recipients).not.toContain(inactive.id); expect(recipients).not.toContain(board.id);
  });
  it('guarda recibo aun sin destinatarios y no entrega retrospectivamente tras promoción', async () => {
    const owner = await actor(), row = await create(owner.id); await consumer.consumeBatch();
    await prisma.user.update({ where: { id: owner.id }, data: { role: UserRole.PLANNING } }); await consumer.consumeBatch();
    expect(await prisma.notification.count({ where: { opportunityId: row.id, recipientUserId: owner.id } })).toBe(0);
    expect(await prisma.notificationDelivery.count({ where: { opportunityId: row.id } })).toBe(1);
  });
  it('todos los endpoints requieren sesión y no admiten destinatario enviado por cliente', async () => {
    await request(app.getHttpServer()).get('/api/v1/me/notifications').expect(401);
    await request(app.getHttpServer()).get('/api/v1/me/notifications/unread-count').expect(401);
    await request(app.getHttpServer()).patch('/api/v1/me/notifications/' + randomUUID() + '/read').send({}).expect(401);
    const user = await actor(); await request(app.getHttpServer()).get('/api/v1/me/notifications?recipientUserId=' + user.id).set('Cookie', user.cookie).expect(400);
  });
  it('ni Administración puede leer/modificar avisos ajenos por UUID conocido', async () => {
    const { planning, admin, row } = await setup(); await consumer.consumeBatch(); const id = await ownedId(planning.id, row.id);
    await request(app.getHttpServer()).patch('/api/v1/me/notifications/' + id + '/read').set('Cookie', admin.cookie).send({}).expect(404);
    expect((await notifications.list(admin.id, {})).items.map(n => n.id)).not.toContain(id);
    expect((await prisma.notification.findUniqueOrThrow({ where: { id } })).readAt).toBeNull();
  });
  it('marcar leída concurrentemente es idempotente y el contador converge', async () => {
    const { planning, row } = await setup(); await consumer.consumeBatch(); const id = await ownedId(planning.id, row.id);
    const [a, b] = await Promise.all([notifications.markRead(planning.id, id), notifications.markRead(planning.id, id), notifications.unreadCount(planning.id)]);
    expect(a.readAt).not.toBeNull(); expect(a.readAt).toBe(b.readAt); expect(await notifications.unreadCount(planning.id)).toEqual({ count: 0 });
    expect((await notifications.markRead(planning.id, id)).readAt).toBe(a.readAt);
  });
  it('desactivación posterior conserva historial pero bloquea acceso y sesiones', async () => {
    const { planning, row } = await setup(); await consumer.consumeBatch(); const id = await ownedId(planning.id, row.id);
    await prisma.user.update({ where: { id: planning.id }, data: { isActive: false, deactivatedAt: new Date() } });
    await request(app.getHttpServer()).get('/api/v1/me/notifications').set('Cookie', planning.cookie).expect(401);
    await expect(notifications.markRead(planning.id, id)).rejects.toThrow(); expect(await prisma.notification.count({ where: { id } })).toBe(1);
  });
  it('paginación estable y filtros leído/no leído', async () => {
    const { planning, research } = await setup(); await create(research.id); await create(research.id); await consumer.consumeBatch();
    const first = await notifications.list(planning.id, { pageSize: 1 }); const second = await notifications.list(planning.id, { pageSize: 1, after: first.nextCursor! });
    expect(first.items[0].id).not.toBe(second.items[0].id); await notifications.markRead(planning.id, first.items[0].id);
    expect((await notifications.list(planning.id, { status: 'read' })).items).toHaveLength(1);
    expect((await notifications.list(planning.id, { status: 'unread' })).items).toHaveLength(2);
    await request(app.getHttpServer()).get('/api/v1/me/notifications?pageSize=101').set('Cookie', planning.cookie).expect(400);
    await request(app.getHttpServer()).get('/api/v1/me/notifications?after=invalid').set('Cookie', planning.cookie).expect(400);
  });
  it('FKs, coherencia y unique dedupe protegen incluso inserción directa', async () => {
    const { planning, research, row } = await setup(); await consumer.consumeBatch(); const source = await prisma.notification.findFirstOrThrow({ where: { opportunityId: row.id } });
    const data = { recipientUserId: planning.id, sourceEventId: source.sourceEventId, opportunityId: row.id };
    await expect(prisma.notification.create({ data })).rejects.toThrow();
    await expect(prisma.notification.create({ data: { ...data, recipientUserId: randomUUID() } })).rejects.toThrow();
    await expect(prisma.notification.create({ data: { ...data, recipientUserId: research.id, opportunityId: randomUUID() } })).rejects.toThrow();
    await expect(prisma.notification.update({ where: { id: source.id }, data: { recipientUserId: research.id } })).rejects.toThrow();
    await expect(prisma.notification.update({ where: { id: source.id }, data: { readAt: new Date(0) } })).rejects.toThrow();
  });
  it('edición, descarte y estado no generan ruido ni modifican historial de oportunidad al leer', async () => {
    const { planning, research, row } = await setup();
    await opportunities.update(row.id, { name: 'Nueva descripción', expectedVersion: 1 }, research.id);
    await opportunities.discard(row.id, { reason: 'No corresponde', expectedVersion: 2 }, research.id); await consumer.consumeBatch();
    expect(await prisma.notification.count({ where: { opportunityId: row.id } })).toBe(3);
    const before = await prisma.opportunityEvent.count({ where: { opportunityId: row.id } });
    await notifications.markRead(planning.id, await ownedId(planning.id, row.id));
    expect(await prisma.opportunityEvent.count({ where: { opportunityId: row.id } })).toBe(before);
    expect((await notifications.list(planning.id, {})).items[0].opportunity.status).toBe('DISCARDED');
  });
  it('rollback del productor no genera avisos y fallo del consumidor no invalida oportunidad', async () => {
    const owner = await actor(), planning = await actor(UserRole.PLANNING);
    jest.spyOn(app.get(AuditService), 'recordOpportunity').mockRejectedValueOnce(new Error('rollback'));
    await expect(create(owner.id)).rejects.toThrow(); await consumer.consumeBatch(); expect(await notifications.unreadCount(planning.id)).toEqual({ count: 0 });
    const row = await create(owner.id); jest.spyOn(opportunities, 'recordedActivity').mockRejectedValueOnce(new Error('fallo'));
    await expect(consumer.consumeBatch()).rejects.toThrow(); expect((await opportunities.get(row.id, owner.id)).name).toBe('Oportunidad P0');
    await consumer.consumeBatch(); expect(await notifications.unreadCount(planning.id)).toEqual({ count: 1 });
  });
  it('fallo en un hecho revierte su entrega parcial, permite los posteriores y reintenta en otro barrido', async () => {
    const { research, planning, row } = await setup(), later = await create(research.id);
    const event = await prisma.opportunityEvent.findFirstOrThrow({ where: { opportunityId: row.id, type: 'CREATED' } });
    const original = app.get(UsersService).opportunityNotificationRecipients.bind(app.get(UsersService));
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(app.get(UsersService), 'opportunityNotificationRecipients').mockImplementationOnce(async tx => {
      await original(tx);
      await tx.notification.create({ data: { recipientUserId: planning.id, sourceEventId: event.id, opportunityId: row.id } });
      throw new Error('fallo después de inserción parcial');
    }).mockImplementation(original);
    const result = await consumer.consumeBatch(); expect(result.failed).toBe(1);
    expect(await prisma.notificationDelivery.count({ where: { opportunityId: row.id } })).toBe(0);
    expect(await prisma.notification.count({ where: { opportunityId: row.id } })).toBe(0);
    expect(await prisma.notification.count({ where: { opportunityId: later.id } })).toBe(3);
    await consumer.consumeBatch(); expect(await prisma.notification.count({ where: { opportunityId: row.id } })).toBe(3);
  });
  it('checkpoint de lote parcial sobrevive nueva instancia y procesa todos los hechos', async () => {
    const owner = await actor(), planning = await actor(UserRole.PLANNING);
    for (let i = 0; i < 27; i++) await create(owner.id);
    expect((await consumer.consumeBatch()).scanned).toBe(25);
    expect((await prisma.notificationCheckpoint.findUniqueOrThrow({ where: { id: NOTIFICATION_CHECKPOINT } })).afterEventId).not.toBeNull();
    for (let i = 0; i < 3; i++) await create(owner.id);
    const restarted = new NotificationConsumer(prisma, opportunities, app.get(UsersService), app.get(ConfigService));
    expect((await restarted.consumeBatch()).scanned).toBe(2); expect(await notifications.unreadCount(planning.id)).toEqual({ count: 27 });
    expect((await prisma.notificationCheckpoint.findUniqueOrThrow({ where: { id: NOTIFICATION_CHECKPOINT } })).throughEventId).toBeNull();
    await restarted.consumeBatch(); await restarted.consumeBatch();
    expect(await notifications.unreadCount(planning.id)).toEqual({ count: 30 });
  });
  it('un commit tardío detrás del cursor se recupera en el siguiente barrido', async () => {
    const owner = await actor(), lateOwner = await actor(), planning = await actor(UserRole.PLANNING), org = await prisma.organization.create({ data: { name: 'Tardía' } }); orgIds.push(org.id);
    let inserted!: () => void, release!: () => void;
    const ready = new Promise<void>(resolve => { inserted = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
    const lateId = randomUUID(), eventId = randomUUID();
    const late = prisma.$transaction(async tx => {
      await tx.opportunity.create({ data: { id: lateId, name: 'Tardía', createdByUserId: lateOwner.id, requestKey: randomUUID(), requestFingerprint: 'a'.repeat(64), organizations: { create: { organizationId: org.id } } } });
      const event = await tx.opportunityEvent.create({ data: { id: eventId, opportunityId: lateId, type: 'CREATED', newStatus: 'PENDING_REVIEW', changes: {}, actorUserId: lateOwner.id, version: 1, createdAt: new Date('2000-01-01T00:00:00.000Z') } });
      await app.get(AuditService).recordOpportunity('OPPORTUNITY_CREATED', event.id, lateOwner.id, tx);
      inserted(); await gate;
    });
    await ready;
    try {
      await create(owner.id); await consumer.consumeBatch();
      expect(await prisma.notification.count({ where: { opportunityId: lateId } })).toBe(0);
    } finally { release(); }
    await late; await consumer.consumeBatch();
    expect(await prisma.notification.count({ where: { opportunityId: lateId, recipientUserId: planning.id } })).toBe(1);
  });
  it('recibo de evento no creado y checkpoint incoherente son rechazados por SQL', async () => {
    const { research, row } = await setup(); await opportunities.update(row.id, { expectedVersion: 1, name: 'Otro nombre' }, research.id);
    const event = await prisma.opportunityEvent.findFirstOrThrow({ where: { opportunityId: row.id, type: 'UPDATED' } });
    await expect(prisma.notificationDelivery.create({ data: { sourceEventId: event.id, opportunityId: row.id } })).rejects.toThrow();
    await expect(prisma.notificationCheckpoint.create({ data: { id: NOTIFICATION_CHECKPOINT, afterEventId: randomUUID() } })).rejects.toThrow();
  });
});
