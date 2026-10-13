import { Pool } from 'pg';
import { validateDatabaseUrl } from '../src/config/database-url';
import { randomUUID } from 'node:crypto';
const databaseUrl=validateDatabaseUrl(process.env.DATABASE_URL);
import { accessFixture, UserRole, RequiredPasswordChangeService, SessionsService, UserAccessService, initialPassword, personalPassword, cookieOf, createOpaqueToken, hashOpaqueToken } from './access-fixture';
describe('Contraseña inicial y cambio obligatorio PostgreSQL/HTTP', () => {
  const f = accessFixture();
  it.each(Object.values(UserRole))('%s solo accede a me y cambio hasta establecer contraseña personal', async role => {
    const user = await f.user(role); const login = await f.login(user); const cookie = cookieOf(login);
    expect(login.body).toMatchObject({ id: user.id, mustChangePassword: true });
    await f.http().get('/api/v1/auth/me').set('Cookie', cookie).expect(200);
    for (const path of ['organizations','people','dashboard']) await f.http().get('/api/v1/'+path).set('Cookie', cookie).expect(403);
    const before = await f.users.findCredentialsById(user.id);
    expect(before!.passwordHash).toMatch(/^\$argon2id\$/);
    const changed = await f.change(cookie).expect(204).expect('Cache-Control','no-store');
    expect(changed.text).toBe(''); const next = cookieOf(changed); expect(next).not.toBe(cookie);
    expect(((await f.http().get('/api/v1/auth/me').set('Cookie', next).expect(200)).body as {mustChangePassword?:boolean}).mustChangePassword).toBeUndefined();
    await f.http().get('/api/v1/organizations').set('Cookie', next).expect(200);
    await f.http().get('/api/v1/auth/me').set('Cookie', cookie).expect(401);
    await f.http().post('/api/v1/auth/login').send({ email: user.email, password: initialPassword }).expect(401);
    await f.login(user, personalPassword);
  });
  it.each(['Aa!1234','aa!12345','AA!12345','Aa123456','Aa!'+ '😀'.repeat(126), null, 1])('rechaza política inválida sin cambiar hash ni sesión: %s', async password => {
    const user = await f.user(); const cookie = cookieOf(await f.login(user)); const before = await f.users.findCredentialsById(user.id);
    await f.change(cookie, password).expect(400); expect(await f.users.findCredentialsById(user.id)).toEqual(before);
    await f.http().get('/api/v1/auth/me').set('Cookie',cookie).expect(200);
  });
  it('rechaza reutilización NFC y acepta límites Unicode de 8 y 128 puntos', async () => {
    const original = 'A!'+ 'é'.repeat(6); const user = await f.user(UserRole.RESEARCH,true,original); const cookie = cookieOf(await f.login(user, original));
    await f.change(cookie,'A!'+ 'e\u0301'.repeat(6)).expect(400);
    await f.change(cookie,'Aa!'+ '😀'.repeat(125)).expect(204);
    const minimal = await f.user(); await f.change(cookieOf(await f.login(minimal)),'Aa!12345').expect(204);
  });
  it.each(['absent','malformed','unknown','expired','revoked','inactive'])('sesión %s recibe 401 y no altera credenciales', async state => {
    const user = await f.user(); let cookie: string | undefined = cookieOf(await f.login(user));
    if (state === 'absent') cookie=undefined;
    if (state === 'malformed') cookie='cecasem_session=bad';
    if (state === 'unknown') cookie='cecasem_session='+createOpaqueToken();
    if (state === 'expired') await f.prisma.userSession.updateMany({where:{userId:user.id},data:{createdAt:new Date(Date.now()-2000),expiresAt:new Date(Date.now()-1000)}});
    if (state === 'revoked') await f.prisma.userSession.updateMany({where:{userId:user.id},data:{revokedAt:new Date()}});
    if (state === 'inactive') await f.prisma.user.update({where:{id:user.id},data:{isActive:false,deactivatedAt:new Date()}});
    const before = await f.users.findCredentialsById(user.id); await f.change(cookie).expect(401); expect(await f.users.findCredentialsById(user.id)).toEqual(before);
  });
  it('rechaza campos ajenos, cuerpo no JSON y cambio repetido', async () => {
    const user = await f.user(); const cookie=cookieOf(await f.login(user));
    await f.http().post('/api/v1/auth/change-password').set('Cookie',cookie).send({password:personalPassword,confirmPassword:personalPassword}).expect(400);
    await f.http().post('/api/v1/auth/change-password').set('Cookie',cookie).type('form').send({password:personalPassword}).expect(415);
    const next=cookieOf(await f.change(cookie).expect(204)); await f.change(next).expect(409); await f.change(cookie).expect(401);
  });
  it('revoca todas las sesiones anteriores y persiste solo el hash del reemplazo', async () => {
    const user=await f.user(); const cookies=[cookieOf(await f.login(user)),cookieOf(await f.login(user))];
    const next=cookieOf(await f.change(cookies[0]).expect(204));
    for (const cookie of cookies) await f.http().get('/api/v1/auth/me').set('Cookie',cookie).expect(401);
    const sessions=await f.prisma.userSession.findMany({where:{userId:user.id,revokedAt:null}}); expect(sessions).toHaveLength(1);
    expect(JSON.stringify(sessions)).not.toContain(next.split('=')[1]); expect(sessions[0].tokenHash).toBe(hashOpaqueToken(next.split('=')[1]));
    expect(await f.passwords.verify(personalPassword,(await f.users.findCredentialsById(user.id))!.passwordHash)).toBe(true);
  });
  it.each(['replace','revoke','create'])('rollback completo ante fallo de %s permite reintentar', async operation => {
    const user=await f.user(); const cookie=cookieOf(await f.login(user)); const before=await f.users.findCredentialsById(user.id);
    if(operation==='replace') jest.spyOn(f.users,'replaceRequiredPassword').mockResolvedValueOnce(false);
    else jest.spyOn(f.app.get(SessionsService), operation==='revoke'?'revokeAllForUser':'create').mockRejectedValueOnce(new Error('fixture persistence failure'));
    await f.change(cookie).expect(operation==='replace'?409:500); expect(await f.users.findCredentialsById(user.id)).toEqual(before);
    await f.http().get('/api/v1/auth/me').set('Cookie',cookie).expect(200); await f.change(cookie).expect(204);
  });
  it.each(['hash','inactive','flag'])('revalida %s después del hash antes de escribir', async state => {
    const user=await f.user(); const cookie=cookieOf(await f.login(user)); const original=f.passwords.hashNew.bind(f.passwords);
    const initialHash=(await f.users.findCredentialsById(user.id))!.passwordHash;
    const changedHash=await original('Cc!'+personalPassword);
    jest.spyOn(f.passwords,'hashNew').mockImplementationOnce(async value=>{ const hash=await original(value);
      await f.prisma.user.update({where:{id:user.id},data:state==='hash'?{passwordHash:changedHash}:state==='inactive'?{isActive:false,deactivatedAt:new Date()}:{mustChangePassword:false}}); return hash; });
    await f.change(cookie).expect(409); expect((await f.users.findCredentialsById(user.id))!.passwordHash).toBe(state==='hash'?changedHash:initialHash);
    expect(await f.passwords.verify(personalPassword,(await f.users.findCredentialsById(user.id))!.passwordHash)).toBe(false);
  });
  it('dos cambios sincronizados solo producen una contraseña y una sesión vigente', async () => {
    const user=await f.user(); await f.login(user); const service=f.app.get(RequiredPasswordChangeService);
    const results=await f.race(()=>service.change(user.id,personalPassword),()=>service.change(user.id,'Cc!'+personalPassword));
    expect(results.map(r=>r.status)).toEqual(['fulfilled','rejected']); expect(await f.prisma.userSession.count({where:{userId:user.id,revokedAt:null}})).toBe(1);
    expect(await f.passwords.verify(personalPassword,(await f.users.findCredentialsById(user.id))!.passwordHash)).toBe(true);
  });
  it.each([true,false])('cambio y desactivación se serializan, cambioPrimero=%s', async changeFirst => {
    const admin=await f.user(UserRole.ADMINISTRATOR,false); const user=await f.user(); const change=()=>f.app.get(RequiredPasswordChangeService).change(user.id,personalPassword);
    const deactivate=()=>f.app.get(UserAccessService).deactivate(user.id,admin.id);
    const result=await f.race(changeFirst?change:deactivate,changeFirst?deactivate:change);
    expect(result.map(r=>r.status)).toEqual(changeFirst?['fulfilled','fulfilled']:['fulfilled','rejected']);
    expect((await f.users.findCredentialsById(user.id))!.isActive).toBe(false); expect(await f.prisma.userSession.count({where:{userId:user.id,revokedAt:null}})).toBe(0);
  });
  it.each(['first-access','first-access-tokens','password-reset','password-reset-tokens'])('endpoint retirado %s permanece ausente', async path => {
    const user=await f.user(); await f.http().post('/api/v1/auth/'+path).send({token:createOpaqueToken(),password:personalPassword}).expect(404);
    expect((await f.users.findCredentialsById(user.id))!.mustChangePassword).toBe(true);
  });
  it('enforces hash uniqueness, UUID FKs, restrictive deletion and every temporal CHECK', async () => {
    const actor=await f.user(UserRole.ADMINISTRATOR,false);const user=await f.user();const prisma=f.prisma;
    const row=await prisma.firstAccessToken.create({data:{userId:user.id,createdByUserId:actor.id,tokenHash:hashOpaqueToken(createOpaqueToken())!,expiresAt:new Date(Date.now()+60000)}});
    const sql=new Pool({connectionString:databaseUrl});
    try {
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
      } finally {await sql.end();}
  });
});
