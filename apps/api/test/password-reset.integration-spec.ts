import { Pool } from 'pg';
import { validateDatabaseUrl } from '../src/config/database-url';
import { randomUUID } from 'node:crypto';
const databaseUrl=validateDatabaseUrl(process.env.DATABASE_URL);
import { accessFixture, UserRole, AuditAction, AuditService, SessionsService, RequiredPasswordChangeService, initialPassword, personalPassword, cookieOf, createOpaqueToken, hashOpaqueToken } from './access-fixture';
describe('Restablecimiento administrativo PostgreSQL/HTTP', () => {
  const f=accessFixture();
  async function reset(id: string, cookie?: string, password: unknown=personalPassword) {
    const call=f.http().patch('/api/v1/users/'+id+'/password').send({password}); return cookie?call.set('Cookie',cookie):call;
  }
  it.each(Object.values(UserRole))('%s respeta RBAC y no tiene efectos en rechazo', async role => {
    const actor=await f.user(role,false); const target=await f.user(UserRole.RESEARCH,false); const cookie=cookieOf(await f.login(actor));
    const before=await f.users.findCredentialsById(target.id);
    await reset(target.id,cookie).then(response=>expect(response.status).toBe(role===UserRole.ADMINISTRATOR?204:403));
    if(role!==UserRole.ADMINISTRATOR) { expect(await f.users.findCredentialsById(target.id)).toEqual(before); expect(await f.prisma.auditEvent.count({where:{targetUserId:target.id}})).toBe(0); }
    else expect((await f.users.findCredentialsById(target.id))!.mustChangePassword).toBe(true);
  });
  it('anónimo, UUID, campos extra y contraseña inválida se rechazan sin escribir', async()=>{
    const admin=await f.user(UserRole.ADMINISTRATOR,false);const user=await f.user(UserRole.RESEARCH,false);const cookie=cookieOf(await f.login(admin));const before=await f.users.findCredentialsById(user.id);
    expect((await reset(user.id)).status).toBe(401);expect((await reset('bad',cookie)).status).toBe(400);
    for(const password of ['Aa!1234','aa!12345','AA!12345','Aa123456',null,12,'Aa!'+ '😀'.repeat(126)]) expect((await reset(user.id,cookie,password)).status).toBe(400);
    await f.http().patch('/api/v1/users/'+user.id+'/password').set('Cookie',cookie).send({password:personalPassword,actorUserId:admin.id}).expect(400);
    expect(await f.users.findCredentialsById(user.id)).toEqual(before);
    expect((await reset('00000000-0000-4000-8000-000000000000',cookie)).status).toBe(404);
  });
  it('revoca todas las sesiones, fuerza cambio y audita sin exponer contraseña/hash', async()=>{
    const admin=await f.user(UserRole.ADMINISTRATOR,false);const user=await f.user(UserRole.RESEARCH,false); const adminCookie=cookieOf(await f.login(admin));
    const cookies=[cookieOf(await f.login(user)),cookieOf(await f.login(user))];
    const response=await reset(user.id,adminCookie);expect(response.status).toBe(204);expect(response.text).toBe('');expect(response.headers['set-cookie']).toBeUndefined();
    for(const cookie of cookies) await f.http().get('/api/v1/auth/me').set('Cookie',cookie).expect(401);
    await f.http().post('/api/v1/auth/login').send({email:user.email,password:initialPassword}).expect(401);
    const initial=await f.login(user,personalPassword);expect((initial.body as {mustChangePassword?:boolean}).mustChangePassword).toBe(true);
    await f.http().get('/api/v1/organizations').set('Cookie',cookieOf(initial)).expect(403);
    await f.change(cookieOf(initial),personalPassword).expect(400);
    await f.change(cookieOf(initial),'Cc!'+personalPassword).expect(204);
    const row=(await f.users.findCredentialsById(user.id))!;
    const events=await f.prisma.auditEvent.findMany({where:{targetUserId:user.id}});expect(events).toEqual([expect.objectContaining({action:AuditAction.USER_PASSWORD_RESET,actorUserId:admin.id,targetUserId:user.id})]);
    expect(JSON.stringify(events)).not.toContain(personalPassword);expect(JSON.stringify(events)).not.toContain(row.passwordHash!);
  });
  it('revoca tokens históricos pendientes incluidos expirados sin habilitar endpoints', async()=>{
    const admin=await f.user(UserRole.ADMINISTRATOR,false);const user=await f.user(UserRole.RESEARCH,false);
    for(const expired of [true,false]) {
      const data={userId:user.id,createdByUserId:admin.id,tokenHash:hashOpaqueToken(createOpaqueToken())!,createdAt:new Date(Date.now()-2000),expiresAt:new Date(Date.now()+(expired?-1000:60000))};
      await f.prisma.firstAccessToken.create({data});await f.prisma.passwordResetToken.create({data});
    }
    await f.administration.resetPassword(user.id,personalPassword,admin.id);
    expect(await f.prisma.firstAccessToken.count({where:{userId:user.id,revokedAt:null}})).toBe(0);expect(await f.prisma.passwordResetToken.count({where:{userId:user.id,revokedAt:null}})).toBe(0);
    expect(await f.prisma.auditEvent.count({where:{targetUserId:user.id,action:AuditAction.PASSWORD_RESET_REVOKED}})).toBe(2);
  });
  it('restablecimiento repetido invalida contraseña y sesión de cada generación', async()=>{
    const admin=await f.user(UserRole.ADMINISTRATOR,false);const user=await f.user();
    await f.administration.resetPassword(user.id,personalPassword,admin.id);const first=cookieOf(await f.login(user,personalPassword));
    await f.administration.resetPassword(user.id,'Cc!'+personalPassword,admin.id);
    await f.http().get('/api/v1/auth/me').set('Cookie',first).expect(401);
    await f.http().post('/api/v1/auth/login').send({email:user.email,password:personalPassword}).expect(401);
    expect(((await f.login(user,'Cc!'+personalPassword)).body as {mustChangePassword?:boolean}).mustChangePassword).toBe(true);
    expect(await f.prisma.auditEvent.count({where:{targetUserId:user.id,action:AuditAction.USER_PASSWORD_RESET}})).toBe(2);
  });
  it('Admin puede restablecer su propia cuenta y su sesión se revoca inmediatamente',async()=>{
    const admin=await f.user(UserRole.ADMINISTRATOR,false);const cookie=cookieOf(await f.login(admin));expect((await reset(admin.id,cookie)).status).toBe(204);
    await f.http().get('/api/v1/auth/me').set('Cookie',cookie).expect(401);expect(((await f.login(admin,personalPassword)).body as {mustChangePassword?:boolean}).mustChangePassword).toBe(true);
  });
  it('cuenta inactiva y cuenta sin contraseña reciben inicial pero no se activan por restablecimiento',async()=>{
    const admin=await f.user(UserRole.ADMINISTRATOR,false);const user=await f.user();
    await f.prisma.user.update({where:{id:user.id},data:{passwordHash:null,isActive:false,deactivatedAt:new Date()}});
    await f.administration.resetPassword(user.id,personalPassword,admin.id);
    expect(await f.users.findCredentialsById(user.id)).toMatchObject({isActive:false,mustChangePassword:true});
    await f.http().post('/api/v1/auth/login').send({email:user.email,password:personalPassword}).expect(401);
  });
  it.each(['audit','sessions','write'])('fallo de %s revierte hash, sesiones, flags e historial',async operation=>{
    const admin=await f.user(UserRole.ADMINISTRATOR,false);const user=await f.user(UserRole.RESEARCH,false);const cookie=cookieOf(await f.login(user));
    const before=await f.users.findCredentialsById(user.id);
    if(operation==='audit') jest.spyOn(f.app.get(AuditService),'recordUserPasswordReset').mockRejectedValueOnce(new Error('fixture failure'));
    else if(operation==='sessions') jest.spyOn(f.app.get(SessionsService),'revokeAllForUser').mockRejectedValueOnce(new Error('fixture failure'));
    else jest.spyOn(f.users,'assignAdministrativePasswordLocked').mockRejectedValueOnce(new Error('fixture failure'));
    await expect(f.administration.resetPassword(user.id,personalPassword,admin.id)).rejects.toThrow('fixture failure');
    expect(await f.users.findCredentialsById(user.id)).toEqual(before);await f.http().get('/api/v1/auth/me').set('Cookie',cookie).expect(200);
    expect(await f.prisma.auditEvent.count({where:{targetUserId:user.id}})).toBe(0);
    await f.administration.resetPassword(user.id,personalPassword,admin.id);
  });
  it('emisor con rol obsoleto o desactivado se revalida bajo lock',async()=>{
    const admin=await f.user(UserRole.ADMINISTRATOR,false);const user=await f.user();const before=await f.users.findCredentialsById(user.id);
    await f.prisma.user.update({where:{id:admin.id},data:{role:UserRole.BOARD}});await expect(f.administration.resetPassword(user.id,personalPassword,admin.id)).rejects.toMatchObject({code:'FORBIDDEN'});
    await f.prisma.user.update({where:{id:admin.id},data:{role:UserRole.ADMINISTRATOR,isActive:false,deactivatedAt:new Date()}});await expect(f.administration.resetPassword(user.id,personalPassword,admin.id)).rejects.toMatchObject({code:'FORBIDDEN'});
    expect(await f.users.findCredentialsById(user.id)).toEqual(before);
  });
  it('dos restablecimientos concurrentes conservan ambos eventos y una sola credencial final',async()=>{
    const admin=await f.user(UserRole.ADMINISTRATOR,false);const user=await f.user();
    await Promise.all([f.administration.resetPassword(user.id,personalPassword,admin.id),f.administration.resetPassword(user.id,'Cc!'+personalPassword,admin.id)]);
    const row=(await f.users.findCredentialsById(user.id))!;const matches=await Promise.all([f.passwords.verify(personalPassword,row.passwordHash),f.passwords.verify('Cc!'+personalPassword,row.passwordHash)]);
    expect(matches.filter(Boolean)).toHaveLength(1);expect(row.mustChangePassword).toBe(true);expect(await f.prisma.auditEvent.count({where:{targetUserId:user.id,action:AuditAction.USER_PASSWORD_RESET}})).toBe(2);
  });
  it.each([true,false])('cambio personal y restablecimiento se serializan, cambioPrimero=%s',async changeFirst=>{
    const admin=await f.user(UserRole.ADMINISTRATOR,false);const user=await f.user();const change=()=>f.app.get(RequiredPasswordChangeService).change(user.id,personalPassword);
    const reset=()=>f.administration.resetPassword(user.id,'Cc!'+personalPassword,admin.id);
    const result=await f.race(changeFirst?change:reset,changeFirst?reset:change);expect(result.map(r=>r.status)).toEqual(changeFirst?['fulfilled','fulfilled']:['fulfilled','rejected']);
    expect((await f.users.findCredentialsById(user.id))!.mustChangePassword).toBe(true);expect(await f.prisma.userSession.count({where:{userId:user.id,revokedAt:null}})).toBe(0);
  });
  it('enforces uniqueness, all FKs, restrictive deletion, temporal CHECKs and audit actor semantics', async () => {
    const actor=await f.user(UserRole.ADMINISTRATOR,false);const user=await f.user();const prisma=f.prisma;
    const row=await prisma.passwordResetToken.create({data:{userId:user.id,createdByUserId:actor.id,tokenHash:hashOpaqueToken(createOpaqueToken())!,expiresAt:new Date(Date.now()+60000)}});
    await prisma.auditEvent.create({data:{action:AuditAction.PASSWORD_RESET_ISSUED,actorUserId:actor.id,targetUserId:user.id,passwordResetTokenId:row.id}});
    const sql=new Pool({connectionString:databaseUrl});
    try {
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
      } finally {await sql.end();}
  });
});
