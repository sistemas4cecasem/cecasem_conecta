import { type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { randomBytes, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/config/application';
import { validateEnvironment } from '../src/config/environment';
import { validateDatabaseUrl } from '../src/config/database-url';
import { PrismaService } from '../src/database/prisma.service';
import { MeetingModality, UserRole } from '../src/generated/prisma/client';
import { UsersService } from '../src/modules/users/users.service';
import { PasswordService } from '../src/modules/auth/password.service';
import type { DashboardResponseDto } from '../src/modules/dashboard/dashboard.dto';

const databaseUrl = validateDatabaseUrl(process.env.DATABASE_URL);
if (!new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('Dashboard requiere una base aislada _test.');

describe('5.3 dashboard PostgreSQL/HTTP', () => {
  let app: INestApplication<Server>, prisma: PrismaService, users: UsersService, passwordHash: string;
  const userIds: string[] = [], organizationIds: string[] = [], processIds: string[] = [], opportunityIds: string[] = [], meetingIds: string[] = [], reminderIds: string[] = [], intentIds: string[] = [];
  const password = randomBytes(24).toString('base64url');
  const actors = new Map<UserRole, { id: string; cookie: string }>();

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ConfigService)
      .useValue(new ConfigService(validateEnvironment({ NODE_ENV: 'test', DATABASE_URL: databaseUrl }))).compile();
    app = module.createNestApplication<INestApplication<Server>>(); configureApplication(app); await app.init();
    prisma = app.get(PrismaService); users = app.get(UsersService); passwordHash = await app.get(PasswordService).hashNew(password);
    for (const role of Object.values(UserRole)) {
      const row = await users.createIdentity({ givenNames: 'Dashboard', familyNames: role, role, email: `dashboard-${role.toLowerCase()}-${randomUUID()}@example.test` });
      userIds.push(row.id); await prisma.user.update({ where: { id: row.id }, data: { passwordHash } });
      const login = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: row.email, password }).expect(200);
      actors.set(role, { id: row.id, cookie: (login.headers['set-cookie'] as unknown as string[])[0].split(';')[0] });
    }
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.$transaction([
        prisma.notification.deleteMany({ where: { recipientUserId: { in: userIds } } }),
        prisma.auditEvent.deleteMany({ where: { OR: [{ actorUserId: { in: userIds } }, { targetUserId: { in: userIds } }] } }),
        prisma.reminderOccurrence.deleteMany({ where: { id: { in: reminderIds } } }),
        prisma.meetingEvent.deleteMany({ where: { meetingId: { in: meetingIds } } }),
        prisma.meeting.deleteMany({ where: { id: { in: meetingIds } } }),
        prisma.opportunityEvent.deleteMany({ where: { opportunityId: { in: opportunityIds } } }),
        prisma.opportunity.deleteMany({ where: { id: { in: opportunityIds } } }),
        prisma.contactIntent.deleteMany({ where: { id: { in: intentIds } } }),
        prisma.processParticipant.deleteMany({ where: { processId: { in: processIds } } }),
        prisma.relationshipProcessEvent.deleteMany({ where: { processId: { in: processIds } } }),
        prisma.relationshipProcess.deleteMany({ where: { id: { in: processIds } } }),
        prisma.verification.deleteMany({ where: { organizationId: { in: organizationIds } } }),
        prisma.organization.deleteMany({ where: { id: { in: organizationIds } } }),
        prisma.userSession.deleteMany({ where: { userId: { in: userIds } } }),
        prisma.userEmailAccount.deleteMany({ where: { userId: { in: userIds } } }),
        prisma.user.deleteMany({ where: { id: { in: userIds } } }),
      ]);
      await app.close();
    }
  });

  async function organization(name: string) {
    const row = await prisma.organization.create({ data: { name } }); organizationIds.push(row.id); return row;
  }
  async function opportunity(creator: string, name: string, status: 'PENDING_REVIEW' | 'SUBMITTED' | 'FINISHED', deadline?: Date) {
    const row = await prisma.opportunity.create({ data: { name, status, deadline, createdByUserId: creator, requestKey: randomUUID(), requestFingerprint: 'a'.repeat(64) } });
    opportunityIds.push(row.id); return row;
  }

  it('separa vistas por rol y refleja conteos, detalle acotado, cancelación, deadline y verificación sobre PostgreSQL', async () => {
    await request(app.getHttpServer()).get('/api/v1/dashboard').expect(401);
    const board = actors.get(UserRole.BOARD)!, admin = actors.get(UserRole.ADMINISTRATOR)!, research = actors.get(UserRole.RESEARCH)!, planning = actors.get(UserRole.PLANNING)!;
    const reviewed = await organization('QA53 revisión pendiente'), never = await organization('QA53 nunca verificada');
    await prisma.verification.create({ data: { organizationId: reviewed.id, actorUserId: board.id, verifiedAt: new Date('2024-01-01T00:00:00Z'), objectVersion: 1 } });
    const target = await organization('QA53 relación institucional');
    const oldActivity = new Date(Date.now() - 10 * 86_400_000);
    const process = await prisma.relationshipProcess.create({ data: { purpose: 'QA53 continuidad institucional', organizationId: target.id, createdByUserId: board.id, state: 'WAITING_RESPONSE', createdAt: oldActivity, updatedAt: oldActivity, lastActivityAt: oldActivity } });
    processIds.push(process.id);
    await prisma.processParticipant.create({ data: { processId: process.id, userId: research.id, origin: 'SENT_COMMUNICATION' } });
    const unrelated = await prisma.relationshipProcess.create({ data: { purpose: 'QA53 proceso no pertinente', organizationId: target.id, createdByUserId: board.id, state: 'IN_PROGRESS' } });
    processIds.push(unrelated.id);
    const intent = await prisma.contactIntent.create({ data: { purpose: 'QA53 seguimiento', authorUserId: research.id, organizationId: target.id, state: 'ACTIVE' } }); intentIds.push(intent.id);
    const reminder = await prisma.reminderOccurrence.create({ data: { processId: process.id, inactivityAnchorAt: process.lastActivityAt, intervalDaysSnapshot: 7, settingsVersionSnapshot: 1, dueAt: new Date(process.lastActivityAt.getTime() + 7 * 86_400_000) } }); reminderIds.push(reminder.id);
    const reminderNotification = await prisma.notification.create({ data: { recipientUserId: research.id, type: 'PROCESS_INACTIVITY_REMINDER', reminderId: reminder.id } });

    const pending = await opportunity(board.id, 'QA53 nueva', 'PENDING_REVIEW', new Date(Date.now() + 10 * 86_400_000));
    await opportunity(board.id, 'QA53 postulada', 'SUBMITTED');
    await opportunity(board.id, 'QA53 finalizada', 'FINISHED', new Date(Date.now() + 9 * 86_400_000));
    const future = await prisma.meeting.create({ data: { opportunityId: pending.id, scheduledAt: new Date(Date.now() + 3_600_000), timezone: 'America/La_Paz', modality: MeetingModality.ONLINE, purpose: 'QA53 próxima', createdByUserId: planning.id, requestKey: randomUUID(), requestFingerprint: 'b'.repeat(64) } }); meetingIds.push(future.id);
    const cancelled = await prisma.meeting.create({ data: { opportunityId: pending.id, scheduledAt: new Date(Date.now() + 7_200_000), timezone: 'America/La_Paz', modality: MeetingModality.ONLINE, purpose: 'QA53 cancelada', status: 'CANCELLED', cancelledAt: new Date(), cancellationReason: 'Prueba de exclusión de canceladas', createdByUserId: planning.id, requestKey: randomUUID(), requestFingerprint: 'c'.repeat(64) } }); meetingIds.push(cancelled.id);
    const past = await prisma.meeting.create({ data: { opportunityId: pending.id, scheduledAt: new Date(Date.now() - 3_600_000), timezone: 'America/La_Paz', modality: MeetingModality.ONLINE, purpose: 'QA53 pasada', createdByUserId: planning.id, requestKey: randomUUID(), requestFingerprint: 'd'.repeat(64) } }); meetingIds.push(past.id);

    const institutional = await request(app.getHttpServer()).get('/api/v1/dashboard').set('Cookie', board.cookie).expect(200);
    expect(institutional.headers['cache-control']).toBe('no-store');
    expect(institutional.body).toMatchObject({ view: 'institutional', activeProcesses: 2, waitingResponseProcesses: 1,
      opportunities: { pendingReview: 1, submitted: 1, finished: 1 }, pendingApplications: 1, organizationsReviewDue: 1, organizationsNeverVerified: 2,
      upcomingMeetingCount: 1, upcomingMeetings: [{ id: future.id, processId: null, opportunityId: pending.id }] });
    expect(JSON.stringify(institutional.body)).not.toContain('QA53 cancelada'); expect(JSON.stringify(institutional.body)).not.toContain('QA53 pasada');
    const adminView = await request(app.getHttpServer()).get('/api/v1/dashboard').set('Cookie', admin.cookie).expect(200);
    const adminBody = adminView.body as DashboardResponseDto;
    expect(adminBody.view).toBe('institutional');
    const operations = await request(app.getHttpServer()).get('/api/v1/dashboard').set('Cookie', research.cookie).expect(200);
    const operationsBody = operations.body as DashboardResponseDto;
    expect(operationsBody).toMatchObject({ view: 'research', activeProcesses: 1, activeIntents: 1, unreadReminders: 1,
      relevantProcesses: [{ id: process.id }], relevantIntents: [{ id: intent.id }], reminderItems: [{ id: reminderNotification.id, processId: process.id }] });
    expect(JSON.stringify(operations.body)).not.toContain(reviewed.name);
    const planningView = await request(app.getHttpServer()).get('/api/v1/dashboard').set('Cookie', planning.cookie).expect(200);
    const planningBody = planningView.body as DashboardResponseDto;
    expect(planningBody).toMatchObject({ view: 'planning', opportunities: { pendingReview: 1, submitted: 1, finished: 1 }, deadlinesInNext30Days: 1,
      upcomingDeadlines: [{ id: pending.id, deadline: pending.deadline!.toISOString().slice(0, 10) }], upcomingMeetingCount: 1, upcomingMeetings: [{ id: future.id }] });

    await request(app.getHttpServer()).post(`/api/v1/users/${research.id}/deactivate`).set('Cookie', admin.cookie).expect(204);
    await request(app.getHttpServer()).get('/api/v1/dashboard').set('Cookie', research.cookie).expect(401);
    await request(app.getHttpServer()).post(`/api/v1/users/${research.id}/reactivate`).set('Cookie', admin.cookie).expect(204);
    expect(never.isActive).toBe(true);
  });
});
