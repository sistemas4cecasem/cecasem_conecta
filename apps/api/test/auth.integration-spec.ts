import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { randomBytes, randomUUID } from 'node:crypto';
import { Server } from 'node:http';
import { Pool } from 'pg';
import { hash } from 'argon2';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/config/application';
import { validateEnvironment } from '../src/config/environment';
import { validateDatabaseUrl } from '../src/config/database-url';
import { PrismaService } from '../src/database/prisma.service';
import { UserRole } from '../src/generated/prisma/client';
import { UsersService } from '../src/modules/users/users.service';
import { AuthService, InvalidCredentialsError } from '../src/modules/auth/auth.service';
import { PasswordService, PASSWORD_OPTIONS } from '../src/modules/auth/password.service';
import { SessionsService } from '../src/modules/auth/sessions.service';
import { UserAccessService } from '../src/modules/auth/user-access.service';
import { createSessionToken, hashSessionToken } from '../src/modules/auth/session-token';

const databaseUrl = validateDatabaseUrl(process.env.DATABASE_URL);
if (!new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('La integración auth requiere una base dedicada terminada en _test.');

describe('Authentication integration and HTTP E2E with PostgreSQL', () => {
  let app: INestApplication<Server>;
  let prisma: PrismaService;
  let users: UsersService;
  let passwords: PasswordService;
  let auth: AuthService;
  let sessions: SessionsService;
  let access: UserAccessService;
  let sql: Pool;
  let configuredHash: string;
  const password = randomBytes(24).toString('base64url');
  const ids: string[] = [];
  let sequence = 0;
  const names = `Fixture${randomUUID().replace(/-/g, '')}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ConfigService).useValue(new ConfigService(validateEnvironment({ NODE_ENV: 'test', DATABASE_URL: databaseUrl }))).compile();
    app = moduleRef.createNestApplication<INestApplication<Server>>();
    configureApplication(app); await app.init();
    prisma = app.get(PrismaService); users = app.get(UsersService); passwords = app.get(PasswordService);
    auth = app.get(AuthService); sessions = app.get(SessionsService); access = app.get(UserAccessService);
    sql = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });
    configuredHash = await passwords.hashNew(password);
  });
  afterEach(async () => {
    if (!prisma) return;
    await prisma.$transaction([
      prisma.userSession.deleteMany({ where: { userId: { in: ids } } }),
      prisma.user.deleteMany({ where: { id: { in: ids } } }),
    ]);
    ids.length = 0;
  });
  afterAll(async () => { try { await sql?.end(); } finally { await app?.close(); } });

  async function fixture(withPassword = true) {
    const user = await users.createIdentity({ givenNames: names, familyNames: `Persona${++sequence}`,
      email: `${randomUUID()}@example.test`, role: UserRole.RESEARCH });
    ids.push(user.id);
    if (withPassword) await prisma.user.update({ where: { id: user.id }, data: { passwordHash: configuredHash } });
    return user;
  }
  function login(email: string, inputPassword = password, cookie?: string) {
    const req = request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password: inputPassword });
    if (cookie) req.set('Cookie', cookie);
    return req;
  }
  function cookieOf(response: { headers: Record<string, unknown> }): string {
    return cookieHeader(response).split(';')[0];
  }
  function cookieHeader(response: { headers: Record<string, unknown> }): string {
    const values = response.headers['set-cookie'];
    if (!Array.isArray(values) || typeof values[0] !== 'string') throw new Error('Expected Set-Cookie');
    return values[0];
  }
  function tokenOf(response: { headers: Record<string, unknown> }): string { return cookieOf(response).split('=')[1]; }

  it('keeps new accounts without credentials and all public/internal identity projections hash-free', async () => {
    const user = await fixture(false);
    expect(user).not.toHaveProperty('passwordHash');
    expect(await users.findByEmail(user.email)).not.toHaveProperty('passwordHash');
    expect(await users.findIdentityById(user.id)).not.toHaveProperty('passwordHash');
    expect((await users.findCredentialsByEmail(user.email))?.passwordHash).toBeNull();
  });
  it('persists approved PHC only inside credentials', async () => {
    const user = await fixture();
    const credential = await users.findCredentialsByEmail(user.email);
    expect(credential?.passwordHash).toBe(configuredHash);
    expect(await passwords.verify(password, credential!.passwordHash)).toBe(true);
  });
  it('logs in with normalized email, stores only tokenHash and issues scoped HttpOnly cookie', async () => {
    const user = await fixture();
    const response = await login(` ${user.email.toUpperCase()} `).expect(200).expect('Cache-Control', 'no-store');
    expect(Object.keys(response.body as object).sort()).toEqual(['email', 'familyNames', 'givenNames', 'id', 'permissions', 'role', 'username']);
    const cookie = cookieHeader(response);
    expect(cookie).toContain('HttpOnly'); expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/api/v1'); expect(cookie).toContain('Max-Age=28800');
    expect(cookie).not.toContain('Domain='); expect(cookie).not.toContain('Secure');
    const token = tokenOf(response);
    const stored = await prisma.userSession.findUniqueOrThrow({ where: { tokenHash: hashSessionToken(token)! } });
    expect(stored.id).toMatch(/^[0-9a-f-]{36}$/); expect(stored.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(+stored.expiresAt - +stored.createdAt).toBe(28800000);
    expect(JSON.stringify(stored)).not.toContain(token);
    expect(JSON.stringify(response.body)).not.toContain(token);
    expect((await sql.query("SELECT column_name FROM information_schema.columns WHERE table_name='UserSession'")).rows.map((row: { column_name: string }) => row.column_name).sort())
      .toEqual(['createdAt', 'expiresAt', 'id', 'revokedAt', 'tokenHash', 'userId']);
    await request(app.getHttpServer()).get('/api/v1/auth/me').set('Cookie', cookieOf(response)).expect(200).expect('Cache-Control', 'no-store').expect(response.body);
  });
  it.each(['missing', 'null', 'incorrect', 'inactive'])('returns the same generic 401 for %s', async (kind) => {
    const user = await fixture(kind !== 'null');
    if (kind === 'inactive') await access.deactivate(user.id);
    const response = await login(kind === 'missing' ? `${randomUUID()}@example.test` : user.email,
      kind === 'incorrect' ? randomBytes(24).toString('base64url') : password).expect(401).expect('Cache-Control', 'no-store');
    expect((response.body as { message: string }).message).toBe('Credenciales no válidas.');
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(await prisma.userSession.count({ where: { userId: user.id } })).toBe(0);
  });
  it('issues and clears Secure cookies when HTTPS security is configured explicitly', async () => {
    const user = await fixture(); const config = app.get(ConfigService);
    config.set('SESSION_COOKIE_SECURE', true);
    try {
      const response = await login(user.email).expect(200);
      expect(cookieHeader(response)).toContain('; Secure');
      const out = await request(app.getHttpServer()).post('/api/v1/auth/logout').set('Cookie', cookieOf(response)).send({}).expect(204);
      expect(cookieHeader(out)).toContain('; Secure');
    } finally { config.set('SESSION_COOKIE_SECURE', false); }
  });
  it('rejects malformed input and extra properties without exposing passwords', async () => {
    const user = await fixture();
    const response = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: user.email, password: 'a'.repeat(129), extra: true }).expect(400);
    expect(JSON.stringify(response.body)).not.toContain('a'.repeat(129));
    await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: user.email }).expect(400);
    await request(app.getHttpServer()).post('/api/v1/auth/logout').type('form').send({}).expect(415);
  });
  it('protects me from absent, malformed and unknown cookies', async () => {
    for (const cookie of [undefined, 'cecasem_session=bad', `cecasem_session=${createSessionToken()}`]) {
      const req = request(app.getHttpServer()).get('/api/v1/auth/me');
      if (cookie) req.set('Cookie', cookie);
      await req.expect(401).expect('Cache-Control', 'no-store');
    }
  });
  it('uses current identity and role rather than a snapshot stored in the session', async () => {
    const user = await fixture(); const response = await login(user.email).expect(200);
    await prisma.user.update({ where: { id: user.id }, data: { role: UserRole.BOARD, givenNames: 'Nombre actualizado' } });
    const me = await request(app.getHttpServer()).get('/api/v1/auth/me').set('Cookie', cookieOf(response)).expect(200);
    expect(me.body).toMatchObject({ role: 'BOARD', givenNames: 'Nombre actualizado' });
  });
  it('allows multiple sessions and failed login preserves the current one', async () => {
    const user = await fixture();
    const first = await login(user.email).expect(200); const second = await login(user.email).expect(200);
    expect(tokenOf(first)).not.toBe(tokenOf(second));
    await login(user.email, randomBytes(24).toString('base64url'), cookieOf(first)).expect(401);
    await request(app.getHttpServer()).get('/api/v1/auth/me').set('Cookie', cookieOf(first)).expect(200);
    expect(await prisma.userSession.count({ where: { userId: user.id, revokedAt: null } })).toBe(2);
  });
  it('replaces only the previous browser session after successful login', async () => {
    const user = await fixture(); const first = await login(user.email).expect(200); const other = await login(user.email).expect(200);
    const replacement = await login(user.email, password, cookieOf(first)).expect(200);
    await request(app.getHttpServer()).get('/api/v1/auth/me').set('Cookie', cookieOf(first)).expect(401);
    await request(app.getHttpServer()).get('/api/v1/auth/me').set('Cookie', cookieOf(other)).expect(200);
    await request(app.getHttpServer()).get('/api/v1/auth/me').set('Cookie', cookieOf(replacement)).expect(200);
  });
  it('rejects expired/revoked sessions and logout is idempotent with matching cookie scope', async () => {
    const user = await fixture(); const response = await login(user.email).expect(200);
    const cookie = cookieOf(response);
    const where = { tokenHash: hashSessionToken(tokenOf(response))! };
    await prisma.userSession.update({ where, data: { createdAt: new Date(Date.now() - 2000), expiresAt: new Date(Date.now() - 1000) } });
    await request(app.getHttpServer()).get('/api/v1/auth/me').set('Cookie', cookie).expect(401);
    const out = await request(app.getHttpServer()).post('/api/v1/auth/logout').set('Cookie', cookie).send({}).expect(204).expect('Cache-Control', 'no-store');
    const revoked = (await prisma.userSession.findUniqueOrThrow({ where })).revokedAt;
    expect(revoked).not.toBeNull();
    const cleared = cookieHeader(out);
    expect(cleared).toContain('cecasem_session=;'); expect(cleared).toContain('Path=/api/v1');
    expect(cleared).toContain('HttpOnly'); expect(cleared).toContain('SameSite=Lax');
    expect(cleared).toContain('Expires=Thu, 01 Jan 1970');
    await request(app.getHttpServer()).post('/api/v1/auth/logout').set('Cookie', cookie).send({}).expect(204);
    expect((await prisma.userSession.findUniqueOrThrow({ where })).revokedAt).toEqual(revoked);
    await request(app.getHttpServer()).post('/api/v1/auth/logout').send({}).expect(204);
    await request(app.getHttpServer()).post('/api/v1/auth/logout').set('Cookie', `cecasem_session=${createSessionToken()}`).send({}).expect(204);
  });
  it('revokes a live session on logout and denies subsequent access', async () => {
    const user = await fixture(); const response = await login(user.email).expect(200);
    await request(app.getHttpServer()).post('/api/v1/auth/logout').set('Cookie', cookieOf(response)).send({}).expect(204);
    await request(app.getHttpServer()).get('/api/v1/auth/me').set('Cookie', cookieOf(response)).expect(401);
  });
  it('does not claim revocation or clear the cookie when persistence fails', async () => {
    const user = await fixture(); const response = await login(user.email).expect(200);
    jest.spyOn(sessions, 'revoke').mockRejectedValueOnce(new Error('fixture failure'));
    const failed = await request(app.getHttpServer()).post('/api/v1/auth/logout').set('Cookie', cookieOf(response)).send({}).expect(500);
    expect(failed.headers['set-cookie']).toBeUndefined();
    await request(app.getHttpServer()).get('/api/v1/auth/me').set('Cookie', cookieOf(response)).expect(200);
  });
  it('immediately rejects an inactive user even before persistent revocation', async () => {
    const user = await fixture(); const response = await login(user.email).expect(200);
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false, deactivatedAt: new Date() } });
    await request(app.getHttpServer()).get('/api/v1/auth/me').set('Cookie', cookieOf(response)).expect(401);
    expect((await prisma.userSession.findFirstOrThrow({ where: { userId: user.id } })).revokedAt).toBeNull();
  });
  it('atomically revokes all sessions on deactivation and reactivation cannot revive them', async () => {
    const user = await fixture(); const first = await login(user.email).expect(200); const second = await login(user.email).expect(200);
    await access.deactivate(user.id);
    expect(await prisma.userSession.count({ where: { userId: user.id, revokedAt: null } })).toBe(0);
    await access.deactivate(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { isActive: true, deactivatedAt: null } });
    for (const response of [first, second]) await request(app.getHttpServer()).get('/api/v1/auth/me').set('Cookie', cookieOf(response)).expect(401);
    await login(user.email).expect(200);
  });
  it('does not create a session if deactivation occurs during password verification', async () => {
    const user = await fixture();
    let entered!: () => void; let resume!: () => void;
    const start = new Promise<void>((resolve) => { entered = resolve; });
    const wait = new Promise<void>((resolve) => { resume = resolve; });
    const realVerify = passwords.verify.bind(passwords);
    jest.spyOn(passwords, 'verify').mockImplementationOnce(async (value, stored) => {
      entered(); const verified = await realVerify(value, stored); await wait; return verified;
    });
    const attempt = auth.login(user.email, password);
    const assertion = expect(attempt).rejects.toBeInstanceOf(InvalidCredentialsError);
    await start; await access.deactivate(user.id); resume(); await assertion;
    expect(await prisma.userSession.count({ where: { userId: user.id } })).toBe(0);
  });
  it('serializes a concurrent successful login and deactivation without usable sessions', async () => {
    const user = await fixture();
    await Promise.allSettled([auth.login(user.email, password), access.deactivate(user.id)]);
    expect((await users.findIdentityById(user.id))?.isActive).toBe(false);
    expect(await prisma.userSession.count({ where: { userId: user.id, revokedAt: null } })).toBe(0);
  });
  it('rehashes old parameters and conditional replacement cannot overwrite a newer credential', async () => {
    const user = await fixture();
    const oldHash = await hash(password, { ...PASSWORD_OPTIONS, timeCost: 2 });
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: oldHash } });
    await login(user.email).expect(200);
    const newHash = (await users.findCredentialsByEmail(user.email))!.passwordHash!;
    expect(newHash).not.toBe(oldHash); expect(passwords.needsRehash(newHash)).toBe(false);
    expect(await users.withLockedCredentials(user.id, (_current, tx) => users.replaceCredentialIfUnchanged(user.id, oldHash, configuredHash, tx))).toBe(false);
    expect((await users.findCredentialsByEmail(user.email))!.passwordHash).toBe(newHash);
  });
  it('rejects a concurrent credential replacement before creating a session', async () => {
    const user = await fixture();
    const realVerify = passwords.verify.bind(passwords);
    jest.spyOn(passwords, 'verify').mockImplementationOnce(async (value, stored) => {
      const result = await realVerify(value, stored);
      await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await passwords.hashNew(randomBytes(24).toString('base64url')) } });
      return result;
    });
    await login(user.email).expect(401);
    expect(await prisma.userSession.count({ where: { userId: user.id } })).toBe(0);
  });
  it('enforces hash uniqueness, required user FK, temporal CHECKs and restricted user deletion', async () => {
    const user = await fixture(); const token = createSessionToken(); const tokenHash = hashSessionToken(token)!;
    const createdAt = new Date(); const expiresAt = new Date(+createdAt + 10000);
    await prisma.userSession.create({ data: { userId: user.id, tokenHash, createdAt, expiresAt } });
    await expect(prisma.userSession.create({ data: { userId: user.id, tokenHash, expiresAt } })).rejects.toMatchObject({ code: 'P2002' });
    await expect(prisma.userSession.create({ data: { userId: randomUUID(), tokenHash: hashSessionToken(createSessionToken())!, expiresAt } })).rejects.toMatchObject({ code: 'P2003' });
    await expect(prisma.user.delete({ where: { id: user.id } })).rejects.toMatchObject({ code: 'P2003' });
    await expect(sql.query('UPDATE "UserSession" SET "expiresAt" = "createdAt" WHERE "tokenHash"=$1', [tokenHash])).rejects.toMatchObject({ code: '23514' });
    await expect(sql.query('UPDATE "UserSession" SET "revokedAt" = "createdAt" - interval \'1 second\' WHERE "tokenHash"=$1', [tokenHash])).rejects.toMatchObject({ code: '23514' });
    await expect(sql.query('UPDATE "UserSession" SET "tokenHash"=$1 WHERE "tokenHash"=$2', ['wrong', tokenHash])).rejects.toMatchObject({ code: '23514' });
  });
});
