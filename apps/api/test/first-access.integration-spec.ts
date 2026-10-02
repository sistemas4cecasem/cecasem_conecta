import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { randomBytes, randomUUID } from 'node:crypto';
import { Server } from 'node:http';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/config/application';
import { validateEnvironment } from '../src/config/environment';
import { validateDatabaseUrl } from '../src/config/database-url';
import { PrismaService } from '../src/database/prisma.service';
import { UserRole } from '../src/generated/prisma/client';
import { UsersService } from '../src/modules/users/users.service';
import { AuthenticatedUserDto, publicIdentity } from '../src/modules/auth/auth.dto';
import { FirstAccessService } from '../src/modules/auth/first-access.service';
import { FirstAccessTokensService } from '../src/modules/auth/first-access-tokens.service';
import { FirstAccessEmissionError, INVALID_FIRST_ACCESS_MESSAGE, InvalidFirstAccessError } from '../src/modules/auth/first-access.errors';
import { PasswordService, NEW_PASSWORD_MESSAGE } from '../src/modules/auth/password.service';
import { SessionsService } from '../src/modules/auth/sessions.service';
import { UserAccessService } from '../src/modules/auth/user-access.service';
import { createOpaqueToken, hashOpaqueToken } from '../src/modules/auth/opaque-token';

const databaseUrl = validateDatabaseUrl(process.env.DATABASE_URL);
if (!new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('Primer acceso requiere una base dedicada terminada en _test.');

function barrier() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

describe('First access PostgreSQL and HTTP E2E', () => {
  let app: INestApplication<Server>;
  let prisma: PrismaService;
  let users: UsersService;
  let passwords: PasswordService;
  let sessions: SessionsService;
  let tokens: FirstAccessTokensService;
  let firstAccess: FirstAccessService;
  let access: UserAccessService;
  let sql: Pool;
  let actor: AuthenticatedUserDto;
  let actorCookie: string;
  let configuredHash: string;
  const password = randomBytes(24).toString('base64url');
  const ids: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ConfigService)
      .useValue(new ConfigService(validateEnvironment({ NODE_ENV: 'test', DATABASE_URL: databaseUrl }))).compile();
    app = moduleRef.createNestApplication<INestApplication<Server>>(); configureApplication(app); await app.init();
    prisma = app.get(PrismaService); users = app.get(UsersService); passwords = app.get(PasswordService);
    sessions = app.get(SessionsService); tokens = app.get(FirstAccessTokensService); firstAccess = app.get(FirstAccessService); access = app.get(UserAccessService);
    sql = new Pool({ connectionString: databaseUrl }); configuredHash = await passwords.hashNew(password);
  });
  beforeEach(async () => {
    const admin = await fixture(UserRole.ADMINISTRATOR, true); actor = publicIdentity(admin);
    const response = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: admin.email, password }).expect(200);
    actorCookie = (response.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    if (!prisma) return;
    await prisma.$transaction([
      prisma.firstAccessToken.deleteMany({ where: { OR: [{ userId: { in: ids } }, { createdByUserId: { in: ids } }] } }),
      prisma.userSession.deleteMany({ where: { userId: { in: ids } } }),
      prisma.user.deleteMany({ where: { id: { in: ids } } }),
    ]); ids.length = 0;
  });
  afterAll(async () => { try { await sql?.end(); } finally { await app?.close(); } });

  async function fixture(role: UserRole = UserRole.RESEARCH, withPassword = false) {
    const identity = await users.createIdentity({ givenNames: `Fixture${randomUUID().replace(/-/g, '')}`, familyNames: 'PrimerAcceso', email: `${randomUUID()}@example.test`, role });
    ids.push(identity.id);
    if (withPassword) await prisma.user.update({ where: { id: identity.id }, data: { passwordHash: configuredHash } });
    return identity;
  }
  const consume = (token: string, cookie?: string, inputPassword = password) => {
    const req = request(app.getHttpServer()).post('/api/v1/auth/first-access').send({ token, password: inputPassword });
    return cookie ? req.set('Cookie', cookie) : req;
  };
  const issue = (userId: string, cookie = actorCookie) => request(app.getHttpServer()).post('/api/v1/auth/first-access-tokens').set('Cookie', cookie).send({ userId });

  // La primera operación retiene el lock; la segunda alcanza su adquisición antes de liberarlo.
  async function race(first: () => Promise<unknown>, second: () => Promise<unknown>) {
    const locked = barrier(); const resume = barrier(); const secondAttempted = barrier();
    const original = users.withLockedCredentials.bind(users); let calls = 0;
    jest.spyOn(users, 'withLockedCredentials').mockImplementation((id, operation) => {
      const position = ++calls;
      if (position === 2) secondAttempted.release();
      return original(id, async (user, tx) => {
        if (position === 1) { locked.release(); await resume.promise; }
        return operation(user, tx);
      });
    });
    const firstResult = first(); await locked.promise;
    const secondResult = second(); const results = Promise.allSettled([firstResult, secondResult]);
    await secondAttempted.promise; resume.release(); return results;
  }

  it('issues once, persists only a unique digest, UUIDs, issuer and absolute TTL', async () => {
    const user = await fixture(); const response = await issue(user.id).expect(201).expect('Cache-Control', 'no-store');
    const body = response.body as { token: string; expiresAt: string };
    expect(Object.keys(body).sort()).toEqual(['expiresAt', 'token']);
    const row = await tokens.findByToken(body.token);
    expect(row!.id).toMatch(/^[0-9a-f-]{36}$/); expect(row!.createdByUserId).toBe(actor.id);
    expect(+row!.expiresAt - +row!.createdAt).toBe(86400000); expect(JSON.stringify(row)).not.toContain(body.token);
    expect((await sql.query("SELECT column_name FROM information_schema.columns WHERE table_name='FirstAccessToken'")).rows.map((row: { column_name: string }) => row.column_name).sort())
      .toEqual(['createdAt', 'createdByUserId', 'expiresAt', 'id', 'revokedAt', 'tokenHash', 'usedAt', 'userId']);
    await request(app.getHttpServer()).get('/api/v1/auth/first-access-tokens').set('Cookie', actorCookie).expect(404);
  });
  it.each([UserRole.BOARD, UserRole.RESEARCH, UserRole.PLANNING])('denies emission to %s through HTTP and internal interface', async (role) => {
    const user = await fixture(); const issuer = await fixture(role, true);
    const login = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: issuer.email, password }).expect(200);
    await issue(user.id, (login.headers['set-cookie'] as unknown as string[])[0].split(';')[0]).expect(403).expect('Cache-Control', 'no-store');
    await expect(firstAccess.issue(user.id, publicIdentity(issuer))).rejects.toBeInstanceOf(FirstAccessEmissionError);
    expect(await prisma.firstAccessToken.count({ where: { userId: user.id } })).toBe(0);
  });
  it('requires authentication and rejects forged actor, invalid UUID and non-JSON', async () => {
    const user = await fixture();
    await request(app.getHttpServer()).post('/api/v1/auth/first-access-tokens').send({ userId: user.id }).expect(401);
    await issue('bad').expect(400);
    await request(app.getHttpServer()).post('/api/v1/auth/first-access-tokens').set('Cookie', actorCookie).send({ userId: user.id, createdByUserId: user.id }).expect(400);
    await request(app.getHttpServer()).post('/api/v1/auth/first-access-tokens').set('Cookie', actorCookie).type('form').send({ userId: user.id }).expect(415);
    await request(app.getHttpServer()).post('/api/v1/auth/first-access').type('form').send({ token: createOpaqueToken(), password }).expect(415);
  });
  it('rechecks current administrator state even when the caller holds an earlier identity', async () => {
    const user = await fixture();
    await prisma.user.update({ where: { id: actor.id }, data: { role: UserRole.BOARD } });
    await expect(firstAccess.issue(user.id, actor)).rejects.toBeInstanceOf(FirstAccessEmissionError);
    await issue(user.id).expect(403);
  });
  it('rejects missing, inactive and already established recipients with administrative errors', async () => {
    await issue(randomUUID()).expect(404);
    const inactive = await fixture(); await access.deactivate(inactive.id); await issue(inactive.id).expect(409);
    const established = await fixture(UserRole.RESEARCH, true); await issue(established.id).expect(409);
  });
  it('revokes old pending credentials including expired ones on regeneration', async () => {
    const user = await fixture(); const old = await firstAccess.issue(user.id, actor);
    await prisma.firstAccessToken.updateMany({ where: { userId: user.id }, data: { createdAt: new Date(Date.now() - 2000), expiresAt: new Date(Date.now() - 1000) } });
    const next = await firstAccess.issue(user.id, actor);
    expect(next.token).not.toBe(old.token); expect((await tokens.findByToken(old.token))!.revokedAt).not.toBeNull();
    await consume(old.token).expect(400); await consume(next.token).expect(204);
  });
  it('consumes atomically, revokes defensive sessions, returns no identity/cookie and enables ordinary login', async () => {
    const user = await fixture(); const emitted = await firstAccess.issue(user.id, actor);
    await users.withLockedCredentials(user.id, async (_user, tx) => { await sessions.create(user.id, tx); });
    const response = await consume(emitted.token).expect(204).expect('Cache-Control', 'no-store');
    expect(response.text).toBe(''); expect(response.headers['set-cookie']).toBeUndefined();
    const row = await tokens.findByToken(emitted.token); expect(row!.usedAt).not.toBeNull(); expect(row!.revokedAt).toBeNull();
    const credentials = await users.findCredentialsByEmail(user.email);
    expect(credentials!.passwordHash).toMatch(/^\$argon2id\$/); expect(await passwords.verify(password, credentials!.passwordHash)).toBe(true);
    expect(await prisma.userSession.count({ where: { userId: user.id, revokedAt: null } })).toBe(0);
    await consume(emitted.token).expect(400);
    await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: user.email, password }).expect(200);
  });
  it.each(['unknown', 'malformed', 'expired', 'used', 'revoked', 'inactive', 'established'])('returns the same public rejection for %s', async (state) => {
    const user = await fixture(); const emitted = await firstAccess.issue(user.id, actor);
    if (state === 'expired') await prisma.firstAccessToken.updateMany({ where: { userId: user.id }, data: { createdAt: new Date(Date.now() - 2000), expiresAt: new Date(Date.now() - 1000) } });
    if (state === 'used') await firstAccess.consume(emitted.token, password);
    if (state === 'revoked') await users.withLockedCredentials(user.id, (_user, tx) => tokens.revokePendingForUser(user.id, tx));
    if (state === 'inactive') await access.deactivate(user.id);
    if (state === 'established') await prisma.user.update({ where: { id: user.id }, data: { passwordHash: configuredHash } });
    const response = await consume(state === 'unknown' ? createOpaqueToken() : state === 'malformed' ? 'bad' : emitted.token).expect(400).expect('Cache-Control', 'no-store');
    expect(response.body).toMatchObject({ message: INVALID_FIRST_ACCESS_MESSAGE }); expect(response.text).not.toContain(user.email);
  });
  it('distinguishes password policy errors and keeps the token unconsumed', async () => {
    const user = await fixture(); const emitted = await firstAccess.issue(user.id, actor);
    for (const invalid of ['a'.repeat(14), '😀'.repeat(129)]) {
      const response = await consume(emitted.token, undefined, invalid).expect(400);
      expect(response.body).toMatchObject({ message: [NEW_PASSWORD_MESSAGE] });
    }
    await request(app.getHttpServer()).post('/api/v1/auth/first-access').send({ token: emitted.token, password, confirmPassword: password }).expect(400);
    expect((await tokens.findByToken(emitted.token))!.usedAt).toBeNull();
    await consume(emitted.token, undefined, '😀'.repeat(15)).expect(204);
  });
  it('blocks valid browser sessions without changes and proceeds after explicit logout', async () => {
    const user = await fixture(); const emitted = await firstAccess.issue(user.id, actor);
    await consume(emitted.token, actorCookie).expect(409);
    expect((await tokens.findByToken(emitted.token))!.usedAt).toBeNull(); expect((await users.findCredentialsByEmail(user.email))!.passwordHash).toBeNull();
    await request(app.getHttpServer()).post('/api/v1/auth/logout').set('Cookie', actorCookie).send({}).expect(204);
    await consume(emitted.token, actorCookie).expect(204);
  });
  it.each(['malformed', 'unknown', 'expired', 'revoked'])('treats %s browser cookie as anonymous', async (state) => {
    const user = await fixture(); const emitted = await firstAccess.issue(user.id, actor);
    let browserToken = createOpaqueToken();
    if (state === 'expired' || state === 'revoked') {
      browserToken = await users.withLockedCredentials(actor.id, (_user, tx) => sessions.create(actor.id, tx));
      if (state === 'revoked') await sessions.revoke(browserToken);
      else await prisma.userSession.updateMany({ where: { tokenHash: hashOpaqueToken(browserToken)! }, data: { createdAt: new Date(Date.now() - 2000), expiresAt: new Date(Date.now() - 1000) } });
    }
    await consume(emitted.token, `cecasem_session=${state === 'malformed' ? 'bad' : browserToken}`).expect(204);
  });
  it('rechecks expiration after hashing and before conditional consumption', async () => {
    const user = await fixture(); const emitted = await firstAccess.issue(user.id, actor);
    const original = passwords.hashNew.bind(passwords);
    jest.spyOn(passwords, 'hashNew').mockImplementationOnce(async (value) => {
      const hash = await original(value);
      await prisma.firstAccessToken.updateMany({ where: { userId: user.id }, data: { createdAt: new Date(Date.now() - 2000), expiresAt: new Date(Date.now() - 1000) } });
      return hash;
    });
    await expect(firstAccess.consume(emitted.token, password)).rejects.toBeInstanceOf(InvalidFirstAccessError);
    expect((await users.findCredentialsByEmail(user.email))!.passwordHash).toBeNull();
  });
  it('revokes pending tokens on deactivation and never revives them on reactivation', async () => {
    const user = await fixture(); const emitted = await firstAccess.issue(user.id, actor); await access.deactivate(user.id);
    expect((await tokens.findByToken(emitted.token))!.revokedAt).not.toBeNull();
    await prisma.user.update({ where: { id: user.id }, data: { isActive: true, deactivatedAt: null } });
    await consume(emitted.token).expect(400); const next = await firstAccess.issue(user.id, actor); await consume(next.token).expect(204);
  });
  it('rolls back password, token use and sibling revocation on session persistence failure', async () => {
    const user = await fixture(); const emitted = await firstAccess.issue(user.id, actor);
    const sibling = createOpaqueToken();
    await prisma.firstAccessToken.create({ data: { userId: user.id, createdByUserId: actor.id, tokenHash: hashOpaqueToken(sibling)!, expiresAt: new Date(Date.now() + 60000) } });
    jest.spyOn(sessions, 'revokeAllForUser').mockRejectedValueOnce(new Error('fixture failure'));
    await consume(emitted.token).expect(500);
    expect((await tokens.findByToken(emitted.token))!.usedAt).toBeNull(); expect((await tokens.findByToken(sibling))!.revokedAt).toBeNull();
    expect((await users.findCredentialsByEmail(user.email))!.passwordHash).toBeNull();
    await consume(emitted.token).expect(204); expect((await tokens.findByToken(sibling))!.revokedAt).not.toBeNull();
  });
  it('rolls back revocation if a replacement cannot be persisted', async () => {
    const user = await fixture(); const old = await firstAccess.issue(user.id, actor);
    const original = users.withLockedCredentials.bind(users);
    jest.spyOn(users, 'withLockedCredentials').mockImplementationOnce((id, operation) => original(id, async (identity, tx) => {
      jest.spyOn(tx.firstAccessToken, 'create').mockRejectedValueOnce(new Error('fixture failure')); return operation(identity, tx);
    }));
    await issue(user.id).expect(500); expect((await tokens.findByToken(old.token))!.revokedAt).toBeNull();
  });
  it('rolls back token use when conditional initial-password establishment fails', async () => {
    const user = await fixture(); const emitted = await firstAccess.issue(user.id, actor);
    jest.spyOn(users, 'establishInitialPassword').mockResolvedValueOnce(false);
    await consume(emitted.token).expect(400);
    expect((await tokens.findByToken(emitted.token))!.usedAt).toBeNull();
    expect((await users.findCredentialsByEmail(user.email))!.passwordHash).toBeNull();
  });
  it('enforces hash uniqueness, UUID FKs, restrictive deletion and every temporal CHECK', async () => {
    const user = await fixture(); const emitted = await firstAccess.issue(user.id, actor); const row = (await tokens.findByToken(emitted.token))!;
    await expect(prisma.firstAccessToken.create({ data: { userId: user.id, createdByUserId: actor.id, tokenHash: row.tokenHash, expiresAt: row.expiresAt } })).rejects.toMatchObject({ code: 'P2002' });
    for (const missing of ['userId', 'createdByUserId']) await expect(prisma.firstAccessToken.create({ data: {
      userId: user.id, createdByUserId: actor.id, [missing]: randomUUID(), tokenHash: hashOpaqueToken(createOpaqueToken())!, expiresAt: row.expiresAt,
    } })).rejects.toMatchObject({ code: 'P2003' });
    await expect(prisma.user.delete({ where: { id: user.id } })).rejects.toMatchObject({ code: 'P2003' });
    await expect(prisma.user.delete({ where: { id: actor.id } })).rejects.toMatchObject({ code: 'P2003' });
    for (const expression of ['"expiresAt" = "createdAt"', '"usedAt" = "createdAt" - interval \'1 second\'',
      '"revokedAt" = "createdAt" - interval \'1 second\'', '"usedAt" = "createdAt", "revokedAt" = "createdAt"', '"tokenHash" = \'bad\'']) {
      await expect(sql.query(`UPDATE "FirstAccessToken" SET ${expression} WHERE id=$1`, [row.id])).rejects.toMatchObject({ code: '23514' });
    }
  });
  it('allows only one of two synchronized consumers', async () => {
    const user = await fixture(); const emitted = await firstAccess.issue(user.id, actor);
    const results = await race(() => firstAccess.consume(emitted.token, password), () => firstAccess.consume(emitted.token, password));
    expect(results.map((result) => result.status)).toEqual(['fulfilled', 'rejected']);
  });
  it('serializes two emissions and leaves only the last credential usable', async () => {
    const user = await fixture(); const emitted: string[] = [];
    const emission = async () => { emitted.push((await firstAccess.issue(user.id, actor)).token); };
    expect((await race(emission, emission)).every((result) => result.status === 'fulfilled')).toBe(true);
    expect((await tokens.findByToken(emitted[0]))!.revokedAt).not.toBeNull(); await consume(emitted[0]).expect(400); await consume(emitted[1]).expect(204);
  });
  it.each([true, false])('serializes consumption versus regeneration, consumptionFirst=%s', async (consumptionFirst) => {
    const user = await fixture(); const old = await firstAccess.issue(user.id, actor);
    let next: string | undefined;
    const regenerate = async () => { next = (await firstAccess.issue(user.id, actor)).token; };
    const consumption = () => firstAccess.consume(old.token, password);
    expect((await race(consumptionFirst ? consumption : regenerate, consumptionFirst ? regenerate : consumption)).map((result) => result.status)).toEqual(['fulfilled', 'rejected']);
    if (!consumptionFirst) { expect(next).toBeDefined(); await consume(next!).expect(204); }
  });
  it.each([true, false])('serializes consumption versus deactivation, consumptionFirst=%s', async (consumptionFirst) => {
    const user = await fixture(); const emitted = await firstAccess.issue(user.id, actor);
    const consumption = () => firstAccess.consume(emitted.token, password); const deactivate = () => access.deactivate(user.id);
    const results = await race(consumptionFirst ? consumption : deactivate, consumptionFirst ? deactivate : consumption);
    expect(results.map((result) => result.status)).toEqual(consumptionFirst ? ['fulfilled', 'fulfilled'] : ['fulfilled', 'rejected']);
    const credentials = (await users.findCredentialsByEmail(user.email))!; expect(credentials.isActive).toBe(false);
    expect(credentials.passwordHash === null).toBe(!consumptionFirst);
  });
  it.each([true, false])('serializes emission versus deactivation, emissionFirst=%s', async (emissionFirst) => {
    const user = await fixture(); const emission = () => firstAccess.issue(user.id, actor); const deactivate = () => access.deactivate(user.id);
    const results = await race(emissionFirst ? emission : deactivate, emissionFirst ? deactivate : emission);
    expect(results.map((result) => result.status)).toEqual(emissionFirst ? ['fulfilled', 'fulfilled'] : ['fulfilled', 'rejected']);
    expect(await prisma.firstAccessToken.count({ where: { userId: user.id, usedAt: null, revokedAt: null } })).toBe(0);
  });
});
