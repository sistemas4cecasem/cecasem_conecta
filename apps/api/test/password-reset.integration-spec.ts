import { INestApplication } from '@nestjs/common';
import { AuditService } from '../src/modules/audit/audit.service';
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
import { AuditAction, UserRole } from '../src/generated/prisma/client';
import { UsersService } from '../src/modules/users/users.service';
import { AuthenticatedUserDto, publicIdentity } from '../src/modules/auth/auth.dto';
import { PasswordResetService } from '../src/modules/auth/password-reset.service';
import { PasswordResetTokensService } from '../src/modules/auth/password-reset-tokens.service';
import { PasswordResetEmissionError, INVALID_PASSWORD_RESET_MESSAGE, InvalidPasswordResetError, REUSED_PASSWORD_MESSAGE } from '../src/modules/auth/password-reset.errors';
import { PasswordService, NEW_PASSWORD_MESSAGE } from '../src/modules/auth/password.service';
import { SessionsService } from '../src/modules/auth/sessions.service';
import { UserAccessService } from '../src/modules/auth/user-access.service';
import { createOpaqueToken, hashOpaqueToken } from '../src/modules/auth/opaque-token';

const databaseUrl = validateDatabaseUrl(process.env.DATABASE_URL);
if (!new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('Restablecimiento requiere una base dedicada terminada en _test.');

function barrier() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

describe('Password reset PostgreSQL and HTTP E2E', () => {
  let app: INestApplication<Server>;
  let prisma: PrismaService;
  let users: UsersService;
  let passwords: PasswordService;
  let sessions: SessionsService;
  let tokens: PasswordResetTokensService;
  let resets: PasswordResetService;
  let access: UserAccessService;
  let audit: AuditService;
  let sql: Pool;
  let actor: AuthenticatedUserDto;
  let actorCookie: string;
  let configuredHash: string;
  const password = randomBytes(24).toString('base64url');
  const newPassword = randomBytes(24).toString('base64url');
  const ids: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ConfigService)
      .useValue(new ConfigService(validateEnvironment({ NODE_ENV: 'test', DATABASE_URL: databaseUrl }))).compile();
    app = moduleRef.createNestApplication<INestApplication<Server>>(); configureApplication(app); await app.init();
    prisma = app.get(PrismaService); users = app.get(UsersService); passwords = app.get(PasswordService);
    sessions = app.get(SessionsService); tokens = app.get(PasswordResetTokensService); resets = app.get(PasswordResetService); access = app.get(UserAccessService); audit = app.get(AuditService);
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
      prisma.auditEvent.deleteMany({ where: { targetUserId: { in: ids } } }),
      prisma.passwordResetToken.deleteMany({ where: { OR: [{ userId: { in: ids } }, { createdByUserId: { in: ids } }] } }),
      prisma.userSession.deleteMany({ where: { userId: { in: ids } } }),
      prisma.user.deleteMany({ where: { id: { in: ids } } }),
    ]); ids.length = 0;
  });
  afterAll(async () => { try { await sql?.end(); } finally { await app?.close(); } });

  async function fixture(role: UserRole = UserRole.RESEARCH, withPassword = true) {
    const identity = await users.createIdentity({ givenNames: `Fixture${randomUUID().replace(/-/g, '')}`, familyNames: 'Restablecimiento', email: `${randomUUID()}@example.test`, role });
    ids.push(identity.id);
    if (withPassword) await prisma.user.update({ where: { id: identity.id }, data: { passwordHash: configuredHash } });
    return identity;
  }
  const consume = (token: string, cookie?: string, inputPassword = newPassword) => {
    const req = request(app.getHttpServer()).post('/api/v1/auth/password-reset').send({ token, password: inputPassword });
    return cookie ? req.set('Cookie', cookie) : req;
  };
  const issue = (userId: string, cookie = actorCookie) => request(app.getHttpServer()).post('/api/v1/auth/password-reset-tokens').set('Cookie', cookie).send({ userId });

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

  it('issues a digest-only UUID token and a secret-free audit event with absolute four-hour TTL', async () => {
    const user = await fixture(); const response = await issue(user.id).expect(201).expect('Cache-Control','no-store');
    const body = response.body as { token: string; expiresAt: string }; const row = (await tokens.findByToken(body.token))!;
    expect(Object.keys(body).sort()).toEqual(['expiresAt','token']); expect(row.createdByUserId).toBe(actor.id);
    expect(row.id).toMatch(/^[0-9a-f-]{36}$/); expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(+row.expiresAt - +row.createdAt).toBe(14400000); expect(JSON.stringify(row)).not.toContain(body.token);
    const event = (await prisma.auditEvent.findMany({where:{targetUserId:user.id}}))[0];
    expect(event).toMatchObject({action:AuditAction.PASSWORD_RESET_ISSUED,actorUserId:actor.id,passwordResetTokenId:row.id});
    expect(Object.keys(event).sort()).toEqual(['action','actorUserId','createdAt','emailAccountId','id','newRole','passwordResetTokenId','previousRole','targetUserId']);
    expect(event).toMatchObject({ previousRole: null, newRole: null, emailAccountId: null });
    expect(JSON.stringify(event)).not.toContain(body.token); expect(JSON.stringify(event)).not.toContain(row.tokenHash);
    await request(app.getHttpServer()).get('/api/v1/auth/password-reset-tokens').set('Cookie',actorCookie).expect(404);
  });
  it.each([UserRole.BOARD,UserRole.RESEARCH,UserRole.PLANNING])('rejects role %s through HTTP and service', async role => {
    const issuer = await fixture(role); const user = await fixture();
    const login = await request(app.getHttpServer()).post('/api/v1/auth/login').send({email:issuer.email,password}).expect(200);
    await issue(user.id,(login.headers['set-cookie'] as unknown as string[])[0].split(';')[0]).expect(403).expect('Cache-Control','no-store');
    await expect(resets.issue(user.id,publicIdentity(issuer))).rejects.toBeInstanceOf(PasswordResetEmissionError);
    expect(await prisma.passwordResetToken.count({where:{userId:user.id}})).toBe(0);
  });
  it('rejects anonymous, forged actor, invalid UUID and non-JSON requests', async () => {
    const user = await fixture();
    await request(app.getHttpServer()).post('/api/v1/auth/password-reset-tokens').send({userId:user.id}).expect(401);
    await issue('bad').expect(400);
    await request(app.getHttpServer()).post('/api/v1/auth/password-reset-tokens').set('Cookie',actorCookie).send({userId:user.id,createdByUserId:user.id}).expect(400);
    await request(app.getHttpServer()).post('/api/v1/auth/password-reset-tokens').set('Cookie',actorCookie).type('form').send({userId:user.id}).expect(415);
    await request(app.getHttpServer()).post('/api/v1/auth/password-reset').type('form').send({token:createOpaqueToken(),password:newPassword}).expect(415);
  });
  it('rejects missing, inactive and first-access recipients and stale issuer identity', async () => {
    await issue(randomUUID()).expect(404);
    const inactive = await fixture(); await access.deactivate(inactive.id, actor.id); await issue(inactive.id).expect(409);
    const firstAccess = await fixture(UserRole.RESEARCH,false); await issue(firstAccess.id).expect(409);
    await prisma.user.update({where:{id:actor.id},data:{role:UserRole.BOARD}});
    await expect(resets.issue(firstAccess.id,actor)).rejects.toBeInstanceOf(PasswordResetEmissionError);
  });
  it('preserves hash, ordinary login and all current sessions during issuance, regeneration and expiration', async () => {
    const user = await fixture();
    const login = () => request(app.getHttpServer()).post('/api/v1/auth/login').send({email:user.email,password});
    const firstLogin = await login().expect(200); const cookie=(firstLogin.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
    const old = await resets.issue(user.id,actor); await login().expect(200);
    const next = await resets.issue(user.id,actor); await login().expect(200);
    expect((await tokens.findByToken(old.token))!.revokedAt).not.toBeNull();
    await prisma.passwordResetToken.updateMany({where:{userId:user.id,revokedAt:null},data:{createdAt:new Date(Date.now()-2000),expiresAt:new Date(Date.now()-1000)}});
    await consume(next.token).expect(400); await login().expect(200);
    await request(app.getHttpServer()).get('/api/v1/auth/me').set('Cookie',cookie).expect(200);
    expect((await users.findCredentialsById(user.id))!.passwordHash).toBe(configuredHash);
    const regenerated = await resets.issue(user.id,actor);
    expect((await tokens.findByToken(next.token))!.revokedAt).not.toBeNull();
    expect(await prisma.auditEvent.count({where:{targetUserId:user.id,action:AuditAction.PASSWORD_RESET_REGENERATED}})).toBe(2);
    await consume(regenerated.token).expect(204);
  });
  it('allows administrator self-reset without invalidating access on issue', async () => {
    const emitted = await issue(actor.id).expect(201);
    await request(app.getHttpServer()).get('/api/v1/auth/me').set('Cookie',actorCookie).expect(200);
    await consume((emitted.body as {token:string}).token).expect(204);
    await request(app.getHttpServer()).get('/api/v1/auth/me').set('Cookie',actorCookie).expect(401);
  });
  it('replaces the password, consumes once, revokes all sessions and audits anonymous completion', async () => {
    const user = await fixture(); const cookies:string[]=[];
    for(let i=0;i<2;i++){const login=await request(app.getHttpServer()).post('/api/v1/auth/login').send({email:user.email,password}).expect(200);cookies.push((login.headers['set-cookie'] as unknown as string[])[0].split(';')[0]);}
    const emitted=await resets.issue(user.id,actor);
    const response=await consume(emitted.token).expect(204).expect('Cache-Control','no-store');
    expect(response.text).toBe('');expect(response.headers['set-cookie']).toBeUndefined();
    const row=(await tokens.findByToken(emitted.token))!;expect(row.usedAt).not.toBeNull();expect(row.revokedAt).toBeNull();
    const hash=(await users.findCredentialsById(user.id))!.passwordHash!;expect(hash).toMatch(/^\$argon2id\$/);
    expect(await passwords.verify(newPassword,hash)).toBe(true);expect(await passwords.verify(password,hash)).toBe(false);
    await request(app.getHttpServer()).post('/api/v1/auth/login').send({email:user.email,password}).expect(401);
    await request(app.getHttpServer()).post('/api/v1/auth/login').send({email:user.email,password:newPassword}).expect(200);
    for(const cookie of cookies) await request(app.getHttpServer()).get('/api/v1/auth/me').set('Cookie',cookie).expect(401);
    expect((await prisma.auditEvent.findMany({where:{targetUserId:user.id,action:AuditAction.PASSWORD_RESET_COMPLETED}}))).toEqual([expect.objectContaining({actorUserId:null,passwordResetTokenId:row.id})]);
    await consume(emitted.token).expect(400);
  });
  it.each(['unknown','malformed','expired','used','revoked','inactive','first-access'])('returns uniform public rejection for %s', async state => {
    const user=await fixture();const emitted=await resets.issue(user.id,actor);
    if(state==='expired')await prisma.passwordResetToken.updateMany({where:{userId:user.id},data:{createdAt:new Date(Date.now()-2000),expiresAt:new Date(Date.now()-1000)}});
    if(state==='used')await resets.consume(emitted.token,newPassword);
    if(state==='revoked')await resets.issue(user.id,actor);
    if(state==='inactive')await access.deactivate(user.id, actor.id);
    if(state==='first-access')await prisma.user.update({where:{id:user.id},data:{passwordHash:null}});
    const response=await consume(state==='unknown'?createOpaqueToken():state==='malformed'?'bad':emitted.token).expect(400).expect('Cache-Control','no-store');
    expect(response.body).toMatchObject({message:INVALID_PASSWORD_RESET_MESSAGE});expect(response.text).not.toContain(user.email);
  });
  it('separates policy and password reuse errors and never consumes on rejection', async () => {
    const user=await fixture();const emitted=await resets.issue(user.id,actor);
    expect((await consume(emitted.token,undefined,password).expect(400)).body).toMatchObject({message:REUSED_PASSWORD_MESSAGE});
    for(const invalid of ['a'.repeat(14),'😀'.repeat(129)])expect((await consume(emitted.token,undefined,invalid).expect(400)).body).toMatchObject({message:[NEW_PASSWORD_MESSAGE]});
    await request(app.getHttpServer()).post('/api/v1/auth/password-reset').send({token:emitted.token,password:newPassword,confirmPassword:newPassword}).expect(400);
    expect((await tokens.findByToken(emitted.token))!.usedAt).toBeNull();
    expect(await prisma.auditEvent.count({where:{targetUserId:user.id,action:AuditAction.PASSWORD_RESET_COMPLETED}})).toBe(0);
    await consume(emitted.token,undefined,'😀'.repeat(15)).expect(204);
  });
  it('rejects NFC-equivalent current password without rehashing it', async () => {
    const user=await fixture();await prisma.user.update({where:{id:user.id},data:{passwordHash:await passwords.hashNew('é'.repeat(15))}});
    const emitted=await resets.issue(user.id,actor);await consume(emitted.token,undefined,'e\u0301'.repeat(15)).expect(400);
    expect((await tokens.findByToken(emitted.token))!.usedAt).toBeNull();
  });
  it('requires explicit logout of any valid browser session', async () => {
    const user=await fixture();const emitted=await resets.issue(user.id,actor);
    await consume(emitted.token,actorCookie).expect(409);expect((await tokens.findByToken(emitted.token))!.usedAt).toBeNull();
    await request(app.getHttpServer()).post('/api/v1/auth/logout').set('Cookie',actorCookie).send({}).expect(204);
    await consume(emitted.token,actorCookie).expect(204);
  });
  it.each(['malformed','unknown','expired','revoked'])('treats %s browser cookie as anonymous', async state => {
    const user=await fixture();const emitted=await resets.issue(user.id,actor);let browserToken=createOpaqueToken();
    if(state==='expired'||state==='revoked'){
      browserToken=await users.withLockedCredentials(actor.id,(_user,tx)=>sessions.create(actor.id,tx));
      if(state==='revoked')await sessions.revoke(browserToken);else await prisma.userSession.updateMany({where:{tokenHash:hashOpaqueToken(browserToken)!},data:{createdAt:new Date(Date.now()-2000),expiresAt:new Date(Date.now()-1000)}});
    }
    await consume(emitted.token,`cecasem_session=${state==='malformed'?'bad':browserToken}`).expect(204);
  });
  it('audits deactivation with trusted actor and never revives old reset', async () => {
    const user=await fixture();const emitted=await resets.issue(user.id,actor);await access.deactivate(user.id,actor.id);
    const row=(await tokens.findByToken(emitted.token))!;expect(row.revokedAt).not.toBeNull();
    expect(await prisma.auditEvent.findFirst({where:{passwordResetTokenId:row.id,action:AuditAction.PASSWORD_RESET_REVOKED}})).toMatchObject({actorUserId:actor.id,targetUserId:user.id});
    await prisma.user.update({where:{id:user.id},data:{isActive:true,deactivatedAt:null}});await consume(emitted.token).expect(400);
    await consume((await resets.issue(user.id,actor)).token).expect(204);
  });
  it.each(['issue','regenerate','consume','deactivate'])('rolls back every change when audit fails during %s', async operation => {
    const user=await fixture();const cookies:string[]=[];
    for(let i=0;i<2;i++){
      const login=await request(app.getHttpServer()).post('/api/v1/auth/login').send({email:user.email,password}).expect(200);
      cookies.push((login.headers['set-cookie'] as unknown as string[])[0].split(';')[0]);
    }
    const priorSessions=await prisma.userSession.findMany({where:{userId:user.id},orderBy:{id:'asc'}});
    const old=operation==='issue'?null:await resets.issue(user.id,actor);
    const priorEvents=await prisma.auditEvent.count({where:{targetUserId:user.id}});
    jest.spyOn(audit,'recordPasswordReset').mockRejectedValueOnce(new Error('fixture failure'));
    if(operation==='consume')await consume(old!.token).expect(500);
    else if(operation==='deactivate')await expect(access.deactivate(user.id, actor.id)).rejects.toThrow('fixture failure');
    else await issue(user.id).expect(500);
    const current=(await users.findCredentialsById(user.id))!;expect(current.passwordHash).toBe(configuredHash);expect(current.isActive).toBe(true);
    expect(await prisma.auditEvent.count({where:{targetUserId:user.id}})).toBe(priorEvents);
    expect(await prisma.passwordResetToken.count({where:{userId:user.id}})).toBe(old?1:0);
    if(old){const row=(await tokens.findByToken(old.token))!;expect(row.usedAt).toBeNull();expect(row.revokedAt).toBeNull();}
    expect(await prisma.userSession.findMany({where:{userId:user.id},orderBy:{id:'asc'}})).toEqual(priorSessions);
    for(const cookie of cookies)await request(app.getHttpServer()).get('/api/v1/auth/me').set('Cookie',cookie).expect(200);
  });
  it.each(['hash-change','expired'])('revalidates %s after Argon2 without overwriting credentials', async state => {
    const user=await fixture();const emitted=await resets.issue(user.id,actor);const original=passwords.hashNew.bind(passwords);
    const changedHash=await original(randomBytes(24).toString('base64url'));
    jest.spyOn(passwords,'hashNew').mockImplementationOnce(async value=>{
      const result=await original(value);
      if(state==='hash-change')await prisma.user.update({where:{id:user.id},data:{passwordHash:changedHash}});
      else await prisma.passwordResetToken.updateMany({where:{userId:user.id},data:{createdAt:new Date(Date.now()-2000),expiresAt:new Date(Date.now()-1000)}});
      return result;
    });
    await expect(resets.consume(emitted.token,newPassword)).rejects.toBeInstanceOf(InvalidPasswordResetError);
    expect((await tokens.findByToken(emitted.token))!.usedAt).toBeNull();
    expect((await users.findCredentialsById(user.id))!.passwordHash).toBe(state==='hash-change'?changedHash:configuredHash);
  });
  it('rolls back token consumption if conditional replacement or session persistence fails', async () => {
    const user=await fixture();const emitted=await resets.issue(user.id,actor);
    jest.spyOn(users,'replaceCredentialIfUnchanged').mockResolvedValueOnce(false);await consume(emitted.token).expect(400);
    expect((await tokens.findByToken(emitted.token))!.usedAt).toBeNull();
    jest.spyOn(sessions,'revokeAllForUser').mockRejectedValueOnce(new Error('fixture failure'));await consume(emitted.token).expect(500);
    expect((await users.findCredentialsById(user.id))!.passwordHash).toBe(configuredHash);expect((await tokens.findByToken(emitted.token))!.usedAt).toBeNull();
  });
  it('enforces uniqueness, all FKs, restrictive deletion, temporal CHECKs and audit actor semantics', async () => {
    const user=await fixture();const emitted=await resets.issue(user.id,actor);const row=(await tokens.findByToken(emitted.token))!;
    await expect(prisma.passwordResetToken.create({data:{userId:user.id,createdByUserId:actor.id,tokenHash:row.tokenHash,expiresAt:row.expiresAt}})).rejects.toMatchObject({code:'P2002'});
    for(const missing of ['userId','createdByUserId'])await expect(prisma.passwordResetToken.create({data:{userId:user.id,createdByUserId:actor.id,[missing]:randomUUID(),tokenHash:hashOpaqueToken(createOpaqueToken())!,expiresAt:row.expiresAt}})).rejects.toMatchObject({code:'P2003'});
    for(const id of [user.id,actor.id])await expect(prisma.user.delete({where:{id}})).rejects.toMatchObject({code:'P2003'});
    await expect(prisma.passwordResetToken.delete({where:{id:row.id}})).rejects.toMatchObject({code:'P2003'});
    for(const expression of ['"expiresAt" = "createdAt"','"usedAt" = "createdAt" - interval \'1 second\'','"revokedAt" = "createdAt" - interval \'1 second\'','"usedAt" = "createdAt", "revokedAt" = "createdAt"','"tokenHash" = \'bad\''])await expect(sql.query(`UPDATE "PasswordResetToken" SET ${expression} WHERE id=$1`,[row.id])).rejects.toMatchObject({code:'23514'});
    const event=(await prisma.auditEvent.findMany({where:{targetUserId:user.id}}))[0];
    for(const field of ['actorUserId','targetUserId','passwordResetTokenId'])await expect(sql.query(`UPDATE "AuditEvent" SET "${field}"=$1 WHERE id=$2`,[randomUUID(),event.id])).rejects.toMatchObject({code:'23503'});
    await expect(sql.query('UPDATE "AuditEvent" SET "actorUserId"=NULL WHERE id=$1',[event.id])).rejects.toMatchObject({code:'23514'});
    await expect(sql.query('UPDATE "AuditEvent" SET action=\'PASSWORD_RESET_COMPLETED\' WHERE id=$1',[event.id])).rejects.toMatchObject({code:'23514'});
    await expect(sql.query('UPDATE "AuditEvent" SET "passwordResetTokenId"=NULL WHERE id=$1',[event.id])).rejects.toMatchObject({code:'23514'});
  });
  it('allows exactly one synchronized consumption and one completion audit', async () => {
    const user=await fixture();const emitted=await resets.issue(user.id,actor);
    expect((await race(()=>resets.consume(emitted.token,newPassword),()=>resets.consume(emitted.token,newPassword))).map(result=>result.status)).toEqual(['fulfilled','rejected']);
    expect(await prisma.auditEvent.count({where:{targetUserId:user.id,action:AuditAction.PASSWORD_RESET_COMPLETED}})).toBe(1);
  });
  it('serializes two emissions and leaves only the final token usable', async () => {
    const user=await fixture();const emitted:string[]=[];const emission=async()=>{emitted.push((await resets.issue(user.id,actor)).token)};
    expect((await race(emission,emission)).every(result=>result.status==='fulfilled')).toBe(true);
    await consume(emitted[0]).expect(400);await consume(emitted[1]).expect(204);
  });
  it.each([true,false])('serializes consumption versus regeneration, consumptionFirst=%s', async consumptionFirst => {
    const user=await fixture();const old=await resets.issue(user.id,actor);let next:string|undefined;
    const consumption=()=>resets.consume(old.token,newPassword);const regeneration=async()=>{next=(await resets.issue(user.id,actor)).token};
    const result=await race(consumptionFirst?consumption:regeneration,consumptionFirst?regeneration:consumption);
    expect(result.map(value=>value.status)).toEqual(consumptionFirst?['fulfilled','fulfilled']:['fulfilled','rejected']);
    await consume(next!,undefined,randomBytes(24).toString('base64url')).expect(204);
  });
  it.each([true,false])('serializes consumption versus deactivation, consumptionFirst=%s', async consumptionFirst => {
    const user=await fixture();const emitted=await resets.issue(user.id,actor);
    const consumption=()=>resets.consume(emitted.token,newPassword);const deactivation=()=>access.deactivate(user.id, actor.id);
    expect((await race(consumptionFirst?consumption:deactivation,consumptionFirst?deactivation:consumption)).map(value=>value.status)).toEqual(consumptionFirst?['fulfilled','fulfilled']:['fulfilled','rejected']);
    expect((await users.findCredentialsById(user.id))!.isActive).toBe(false);
  });
  it.each([true,false])('serializes issuance versus deactivation, issuanceFirst=%s', async issuanceFirst => {
    const user=await fixture();const emission=()=>resets.issue(user.id,actor);const deactivation=()=>access.deactivate(user.id, actor.id);
    expect((await race(issuanceFirst?emission:deactivation,issuanceFirst?deactivation:emission)).map(value=>value.status)).toEqual(issuanceFirst?['fulfilled','fulfilled']:['fulfilled','rejected']);
    expect(await prisma.passwordResetToken.count({where:{userId:user.id,usedAt:null,revokedAt:null}})).toBe(0);
  });
});
