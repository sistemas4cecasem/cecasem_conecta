import { type INestApplication } from '@nestjs/common';
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
import { UserRole, AuditAction } from '../src/generated/prisma/client';
import { UsersService } from '../src/modules/users/users.service';
import { UsersAdministrationService } from '../src/modules/users-administration/users-administration.service';
import { PasswordService } from '../src/modules/auth/password.service';
import { RequiredPasswordChangeService } from '../src/modules/auth/required-password-change.service';
import { SessionsService } from '../src/modules/auth/sessions.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { UserAccessService } from '../src/modules/auth/user-access.service';
import { createOpaqueToken, hashOpaqueToken } from '../src/modules/auth/opaque-token';

const databaseUrl = validateDatabaseUrl(process.env.DATABASE_URL);
if (!new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('Acceso requiere PostgreSQL aislado _test.');
const initialPassword = `Aa!${randomUUID()}`;
const personalPassword = `Bb!${randomUUID()}`;
const cookieOf = (response: request.Response) => (response.headers['set-cookie'] as unknown as string[])[0].split(';')[0];

export function accessFixture() {
  let app: INestApplication<Server>; let prisma: PrismaService; let users: UsersService;
  let administration: UsersAdministrationService; let passwords: PasswordService;
  const ids: string[] = [];
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ConfigService)
      .useValue(new ConfigService(validateEnvironment({ NODE_ENV: 'test', DATABASE_URL: databaseUrl }))).compile();
    app = module.createNestApplication<INestApplication<Server>>(); configureApplication(app); await app.init();
    prisma = app.get(PrismaService); users = app.get(UsersService); passwords = app.get(PasswordService); administration = app.get(UsersAdministrationService);
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await prisma.$transaction([
      prisma.auditEvent.deleteMany({ where: { OR: [{ actorUserId: { in: ids } }, { targetUserId: { in: ids } }] } }),
      prisma.firstAccessToken.deleteMany({ where: { OR: [{ userId: { in: ids } }, { createdByUserId: { in: ids } }] } }),
      prisma.passwordResetToken.deleteMany({ where: { OR: [{ userId: { in: ids } }, { createdByUserId: { in: ids } }] } }),
      prisma.userSession.deleteMany({ where: { userId: { in: ids } } }),
      prisma.user.deleteMany({ where: { id: { in: ids } } }),
    ]); ids.length = 0;
  });
  afterAll(async () => { await app?.close(); });
  async function user(role: UserRole = UserRole.RESEARCH, required = true, password = initialPassword) {
    const row = await users.createIdentity({ givenNames: 'Acceso', familyNames: randomUUID(), email: `${randomUUID()}@example.test`, role,
      passwordHash: await passwords.hashNew(password), mustChangePassword: required });
    ids.push(row.id); return row;
  }
  const http = () => request(app.getHttpServer());
  async function login(row: { email: string }, password = initialPassword) {
    return http().post('/api/v1/auth/login').send({ email: row.email, password }).expect(200);
  }
  function change(cookie?: string, password: unknown = personalPassword) {
    const call = http().post('/api/v1/auth/change-password').send({ password });
    return cookie ? call.set('Cookie', cookie) : call;
  }
  async function race(first: () => Promise<unknown>, second: () => Promise<unknown>) {
    let entered!: () => void; let release!: () => void; let attempted!: () => void;
    const locked = new Promise<void>(r => { entered = r; }); const resume = new Promise<void>(r => { release = r; }); const secondAttempt = new Promise<void>(r => { attempted = r; });
    const original = users.withLockedCredentials.bind(users); let calls = 0;
    jest.spyOn(users, 'withLockedCredentials').mockImplementation((id, operation, locks) => {
      const position = ++calls; if (position === 2) attempted();
      return original(id, async (row, tx) => { if (position === 1) { entered(); await resume; } return operation(row, tx); }, locks);
    });
    const one = first(); await locked; const two = second(); const result = Promise.allSettled([one, two]); await secondAttempt; release(); return result;
  }
  return { user, login, change, http, race, ids, get app() { return app; }, get prisma() { return prisma; }, get users() { return users; },
    get administration() { return administration; }, get passwords() { return passwords; } };
}
export { UserRole, AuditAction, RequiredPasswordChangeService, SessionsService, AuditService, UserAccessService, initialPassword, personalPassword, cookieOf, createOpaqueToken, hashOpaqueToken };
