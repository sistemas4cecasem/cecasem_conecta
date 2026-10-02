import { type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { randomBytes, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/config/application';
import { validateDatabaseUrl } from '../src/config/database-url';
import { validateEnvironment } from '../src/config/environment';
import { PrismaService } from '../src/database/prisma.service';
import { UserRole } from '../src/generated/prisma/client';
import { UsersService } from '../src/modules/users/users.service';
import type { UserIdentity } from '../src/modules/users/user-projections';
import { publicIdentity } from '../src/modules/auth/auth.dto';
import { getRolePermissions } from '../src/modules/auth/authorization/role-permissions';
import { FirstAccessService } from '../src/modules/auth/first-access.service';
import { PasswordResetService } from '../src/modules/auth/password-reset.service';
import { PasswordService } from '../src/modules/auth/password.service';
import { createOpaqueToken } from '../src/modules/auth/opaque-token';

const databaseUrl = validateDatabaseUrl(process.env.DATABASE_URL);
if (!new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('RBAC requiere una base dedicada terminada en _test.');


describe('RBAC PostgreSQL y HTTP con rol vigente', () => {
  let app: INestApplication<Server>;
  let prisma: PrismaService;
  let users: UsersService;
  let configuredHash: string;
  const password = randomBytes(24).toString('base64url');
  const ids: string[] = [];
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ConfigService)
      .useValue(new ConfigService(validateEnvironment({ NODE_ENV: 'test', DATABASE_URL: databaseUrl }))).compile();
    app = moduleRef.createNestApplication<INestApplication<Server>>(); configureApplication(app); await app.init();
    prisma = app.get(PrismaService); users = app.get(UsersService);
    configuredHash = await app.get(PasswordService).hashNew(password);
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    if (!prisma) return;
    await prisma.$transaction([
      prisma.auditEvent.deleteMany({ where: { OR: [{ targetUserId: { in: ids } }, { actorUserId: { in: ids } }] } }),
      prisma.firstAccessToken.deleteMany({ where: { OR: [{ userId: { in: ids } }, { createdByUserId: { in: ids } }] } }),
      prisma.passwordResetToken.deleteMany({ where: { OR: [{ userId: { in: ids } }, { createdByUserId: { in: ids } }] } }),
      prisma.userSession.deleteMany({ where: { userId: { in: ids } } }),
      prisma.user.deleteMany({ where: { id: { in: ids } } }),
    ]); ids.length = 0;
  });
  afterAll(async () => { await app?.close(); });

  async function fixture(role: UserRole, withPassword = true): Promise<UserIdentity> {
    const identity = await users.createIdentity({ givenNames: `Fixture${randomUUID().replace(/-/g, '')}`,
      familyNames: 'Autorización', email: `${randomUUID()}@example.test`, role });
    ids.push(identity.id);
    if (withPassword) await prisma.user.update({ where: { id: identity.id }, data: { passwordHash: configuredHash } });
    return identity;
  }
  async function login(user: UserIdentity) {
    const response = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: user.email, password }).expect(200);
    return { response, cookie: (response.headers['set-cookie'] as unknown as string[])[0].split(';')[0] };
  }
  const me = (cookie: string) => request(app.getHttpServer()).get('/api/v1/auth/me').set('Cookie', cookie);
  function issue(endpoint: string, userId: string, cookie?: string) {
    const req = request(app.getHttpServer()).post(`/api/v1/auth/${endpoint}`).send({ userId });
    return cookie === undefined ? req : req.set('Cookie', cookie);
  }
  async function state() {
    return {
      users: await prisma.user.findMany({ where: { id: { in: ids } }, orderBy: { id: 'asc' } }),
      sessions: await prisma.userSession.findMany({ where: { userId: { in: ids } }, orderBy: { id: 'asc' } }),
      firstAccess: await prisma.firstAccessToken.findMany({ where: { userId: { in: ids } } }),
      resets: await prisma.passwordResetToken.findMany({ where: { userId: { in: ids } } }),
      audit: await prisma.auditEvent.findMany({ where: { targetUserId: { in: ids } } }),
    };
  }

  it.each([UserRole.ADMINISTRATOR, UserRole.BOARD, UserRole.RESEARCH, UserRole.PLANNING])(
    '%s devuelve login/me coherentes y aplica ambas capabilities sin efectos por 403', async role => {
      const actor = await fixture(role); const pending = await fixture(UserRole.RESEARCH, false);
      const configured = await fixture(UserRole.RESEARCH); const { response, cookie } = await login(actor);
      const expected = [...getRolePermissions(role)];
      expect(response.body).toEqual({ ...publicIdentity(actor), permissions: expected });
      expect(Object.keys(response.body as object).sort()).toEqual(['email','familyNames','givenNames','id','permissions','role','username']);
      expect((await me(cookie).expect(200)).body).toEqual(response.body);
      const before = await state(); const status = role === UserRole.ADMINISTRATOR ? 201 : 403;
      const first = await issue('first-access-tokens', pending.id, cookie).expect(status);
      const reset = await issue('password-reset-tokens', configured.id, cookie).expect(status);
      expect(first.headers['set-cookie']).toBeUndefined(); expect(reset.headers['set-cookie']).toBeUndefined();
      expect((await me(cookie).expect(200)).body).toEqual(response.body);
      if (status === 403) expect(await state()).toEqual(before);
      else {
        expect(await prisma.firstAccessToken.count({ where: { userId: pending.id } })).toBe(1);
        expect(await prisma.passwordResetToken.count({ where: { userId: configured.id } })).toBe(1);
        expect(await prisma.auditEvent.count({ where: { targetUserId: configured.id } })).toBe(1);
      }
    });

  it('la misma cookie pierde y recupera ambas capabilities sin relogin', async () => {
    const actor = await fixture(UserRole.ADMINISTRATOR); const pending = await fixture(UserRole.RESEARCH, false);
    const configured = await fixture(UserRole.RESEARCH); const { cookie } = await login(actor);
    const originalSessions = await prisma.userSession.findMany({ where: { userId: actor.id } });
    await prisma.user.update({ where: { id: actor.id }, data: { role: UserRole.BOARD } });
    expect((await me(cookie).expect(200)).body).toMatchObject({ role: UserRole.BOARD, permissions: [...getRolePermissions(UserRole.BOARD)] });
    const before = await state();
    await issue('first-access-tokens', pending.id, cookie).expect(403);
    await issue('password-reset-tokens', configured.id, cookie).expect(403);
    expect(await state()).toEqual(before);
    await prisma.user.update({ where: { id: actor.id }, data: { role: UserRole.ADMINISTRATOR } });
    expect((await me(cookie).expect(200)).body).toMatchObject({ role: UserRole.ADMINISTRATOR, permissions: [...getRolePermissions(UserRole.ADMINISTRATOR)] });
    await issue('first-access-tokens', pending.id, cookie).expect(201);
    await issue('password-reset-tokens', configured.id, cookie).expect(201);
    expect(await prisma.userSession.findMany({ where: { userId: actor.id } })).toEqual(originalSessions);
  });
  it('Búsqueda y Planificación conservan roles distintos con las mismas capabilities del directorio', async () => {
    const actor = await fixture(UserRole.RESEARCH); const { cookie } = await login(actor);
    expect((await me(cookie).expect(200)).body).toMatchObject({ role: UserRole.RESEARCH, permissions: [...getRolePermissions(UserRole.RESEARCH)] });
    await prisma.user.update({ where: { id: actor.id }, data: { role: UserRole.PLANNING } });
    expect((await me(cookie).expect(200)).body).toMatchObject({ role: UserRole.PLANNING, permissions: [...getRolePermissions(UserRole.PLANNING)] });
  });
  it.each(['first-access-tokens', 'password-reset-tokens'])('%s revalida el emisor en llamadas directas', async endpoint => {
    const actor = await fixture(UserRole.ADMINISTRATOR);
    const target = await fixture(UserRole.RESEARCH, endpoint === 'password-reset-tokens');
    const service = endpoint === 'first-access-tokens' ? app.get(FirstAccessService) : app.get(PasswordResetService);
    const stale = publicIdentity(actor);
    await prisma.user.update({ where: { id: actor.id }, data: { role: UserRole.BOARD } });
    const before = await state();
    await expect(service.issue(target.id, stale)).rejects.toMatchObject({ reason: 'FORBIDDEN' });
    expect(await state()).toEqual(before);
    await prisma.user.update({ where: { id: actor.id }, data: { role: UserRole.ADMINISTRATOR } });
    const current = publicIdentity((await users.findIdentityById(actor.id))!);
    await expect(service.issue(target.id, current)).resolves.toHaveProperty('token');
  });
  it.each(['first-access-tokens', 'password-reset-tokens'])('%s rechaza un cambio de rol posterior al guard', async endpoint => {
    const actor = await fixture(UserRole.ADMINISTRATOR); const { cookie } = await login(actor);
    const target = await fixture(UserRole.RESEARCH, endpoint === 'password-reset-tokens');
    const original = users.withLockedCredentials.bind(users);
    const lock = jest.spyOn(users, 'withLockedCredentials').mockImplementation(async (id, operation) => {
      await prisma.user.update({ where: { id: actor.id }, data: { role: UserRole.BOARD } });
      return original(id, operation);
    });
    await issue(endpoint, target.id, cookie).expect(403);
    expect(lock).toHaveBeenCalledTimes(1);
    expect((await users.findCredentialsById(target.id))?.passwordHash).toBe(endpoint === 'password-reset-tokens' ? configuredHash : null);
    expect(await prisma.firstAccessToken.count({ where: { userId: target.id } })).toBe(0);
    expect(await prisma.passwordResetToken.count({ where: { userId: target.id } })).toBe(0);
    expect(await prisma.auditEvent.count({ where: { targetUserId: target.id } })).toBe(0);
    expect((await me(cookie).expect(200)).body).toMatchObject({ role: UserRole.BOARD, permissions: [...getRolePermissions(UserRole.BOARD)] });
  });
  it.each(['absent', 'malformed', 'unknown', 'expired', 'revoked', 'inactive'])('sesión %s mantiene 401 antes de RBAC', async kind => {
    const actor = await fixture(UserRole.ADMINISTRATOR); const { cookie } = await login(actor);
    const target = await fixture(UserRole.RESEARCH, false);
    let supplied: string | undefined = cookie;
    if (kind === 'absent') supplied = undefined;
    if (kind === 'malformed') supplied = 'cecasem_session=malformed';
    if (kind === 'unknown') supplied = `cecasem_session=${createOpaqueToken()}`;
    if (kind === 'expired') await prisma.userSession.updateMany({ where: { userId: actor.id },
      data: { createdAt: new Date(Date.now() - 120000), expiresAt: new Date(Date.now() - 60000) } });
    if (kind === 'revoked') await prisma.userSession.updateMany({ where: { userId: actor.id }, data: { revokedAt: new Date() } });
    if (kind === 'inactive') await prisma.user.update({ where: { id: actor.id }, data: { isActive: false, deactivatedAt: new Date() } });
    const before = await state();
    await issue('first-access-tokens', target.id, supplied).expect(401);
    await issue('password-reset-tokens', target.id, supplied).expect(401);
    expect(await state()).toEqual(before);
  });
});
