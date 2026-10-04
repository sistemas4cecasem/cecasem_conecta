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
import { AuditAction, UserRole, type Prisma } from '../src/generated/prisma/client';
import { UsersService } from '../src/modules/users/users.service';
import { UsersAdministrationService } from '../src/modules/users-administration/users-administration.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { PasswordService } from '../src/modules/auth/password.service';
import { UserAccessService } from '../src/modules/auth/user-access.service';
import { BootstrapAdminService } from '../src/modules/auth/bootstrap-admin.service';
import { FirstAccessService } from '../src/modules/auth/first-access.service';
import { FirstAccessTokensService } from '../src/modules/auth/first-access-tokens.service';
import { PasswordResetService } from '../src/modules/auth/password-reset.service';
import { publicIdentity } from '../src/modules/auth/auth.dto';
import { hashOpaqueToken } from '../src/modules/auth/opaque-token';
import { getRolePermissions } from '../src/modules/auth/authorization/role-permissions';

const databaseUrl = validateDatabaseUrl(process.env.DATABASE_URL);
if (!new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('Administración requiere una base aislada _test.');
function barrier() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

describe('Administración mínima PostgreSQL y HTTP', () => {
  let app: INestApplication<Server>; let prisma: PrismaService; let users: UsersService;
  let administration: UsersAdministrationService; let access: UserAccessService; let audit: AuditService;
  let first: FirstAccessService; let resets: PasswordResetService; let bootstrap: BootstrapAdminService;
  let passwordHash: string;
  const password = randomBytes(24).toString('base64url'); const ids: string[] = []; const accounts: string[] = [];
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ConfigService)
      .useValue(new ConfigService(validateEnvironment({ NODE_ENV: 'test', DATABASE_URL: databaseUrl }))).compile();
    app = moduleRef.createNestApplication<INestApplication<Server>>(); configureApplication(app); await app.init();
    prisma = app.get(PrismaService); users = app.get(UsersService); administration = app.get(UsersAdministrationService);
    access = app.get(UserAccessService); audit = app.get(AuditService); first = app.get(FirstAccessService);
    resets = app.get(PasswordResetService); bootstrap = app.get(BootstrapAdminService);
    passwordHash = await app.get(PasswordService).hashNew(password);
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await prisma.$transaction([
      prisma.auditEvent.deleteMany({ where: { OR: [{ targetUserId: { in: ids } }, { actorUserId: { in: ids } }] } }),
      prisma.userEmailAccount.deleteMany({ where: { userId: { in: ids } } }),
      prisma.firstAccessToken.deleteMany({ where: { OR: [{ userId: { in: ids } }, { createdByUserId: { in: ids } }] } }),
      prisma.passwordResetToken.deleteMany({ where: { OR: [{ userId: { in: ids } }, { createdByUserId: { in: ids } }] } }),
      prisma.userSession.deleteMany({ where: { userId: { in: ids } } }),
      prisma.user.deleteMany({ where: { id: { in: ids } } }), prisma.emailAccount.deleteMany({ where: { id: { in: accounts } } }),
    ]); ids.length = 0; accounts.length = 0;
  });
  afterAll(async () => { await app.close(); });
  async function fixture(role: UserRole = UserRole.RESEARCH, established = true) {
    const user = await users.createIdentity({ givenNames: 'Fixture', familyNames: randomUUID(), email: `${randomUUID()}@example.test`, role });
    ids.push(user.id);
    if (established) await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
    return user;
  }
  async function mailbox() {
    const row = await users.createEmailAccount({ address: `${randomUUID()}@example.test`, displayName: 'Institucional' });
    accounts.push(row.id); return row;
  }
  async function login(user: { email: string }) {
    const response = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: user.email, password }).expect(200);
    return (response.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
  }
  function http(method: 'get' | 'post' | 'patch' | 'put' | 'delete', path: string, cookie?: string, body?: object) {
    const call = request(app.getHttpServer())[method](`/api/v1/${path}`);
    if (cookie) call.set('Cookie', cookie);
    if (body) call.send(body);
    return call;
  }

  const matrix = [
    ['get', 'users', 'read', 200], ['get', 'users?status=inactive', 'mutation', 200], ['get', 'users?status=all', 'mutation', 200],
    ['post', 'users', 'mutation', 201], ['patch', 'users/TARGET/role', 'mutation', 204],
    ['post', 'users/TARGET/deactivate', 'mutation', 204], ['post', 'users/TARGET/reactivate', 'mutation', 204],
    ['get', 'email-accounts', 'mutation', 200], ['post', 'email-accounts', 'mutation', 201],
    ['get', 'users/TARGET/email-accounts', 'mutation', 200], ['put', 'users/TARGET/email-accounts/MAILBOX', 'mutation', 204],
    ['delete', 'users/TARGET/email-accounts/MAILBOX', 'mutation', 204],
    ['post', 'auth/first-access-tokens', 'mutation', 201], ['post', 'auth/password-reset-tokens', 'mutation', 201],
  ] as const;
  it.each(Object.values(UserRole).flatMap(role => matrix.map(route => ({ role, route }))))('$role $route aplica RBAC', async ({ role, route }) => {
    const actor = await fixture(role); const target = await fixture(); const pending = await fixture(UserRole.RESEARCH, false);
    const account = await mailbox(); const cookie = await login(actor);
    const [method, path, category, success] = route;
    const data = path === 'users' && method === 'post' ? { givenNames: 'Nuevo', familyNames: 'Usuario', email: `${randomUUID()}@example.test`, role: UserRole.RESEARCH } :
      path === 'email-accounts' && method === 'post' ? { address: `${randomUUID()}@example.test`, displayName: 'Nuevo buzón' } :
      method === 'patch' ? { role: UserRole.PLANNING } : path.includes('tokens') ? { userId: path.includes('first-access') ? pending.id : target.id } : undefined;
    const status = role === UserRole.ADMINISTRATOR || role === UserRole.BOARD && category === 'read' ? success : 403;
    const before = await prisma.auditEvent.count();
    const response = await http(method, path.replace('TARGET', target.id).replace('MAILBOX', account.id), cookie, data).expect(status);
    if (status === 201 && path === 'users') ids.push((response.body as { id: string }).id);
    if (status === 201 && path === 'email-accounts') accounts.push((response.body as { id: string }).id);
    if (status === 403) expect(await prisma.auditEvent.count()).toBe(before);
  });
  it.each(matrix)('anónimo %s %s recibe 401', async (method, path) => {
    await http(method, path.replace('TARGET', randomUUID()).replace('MAILBOX', randomUUID())).expect(401);
  });
  it('crea normalizado, sin token, con colisión de username y contrato público estricto', async () => {
    const actor = await fixture(UserRole.ADMINISTRATOR); const cookie = await login(actor);
    const input = { givenNames: ' Diego  Armando ', familyNames: ` Fariñas ${randomUUID()} `, email: ` ${randomUUID()}@EXAMPLE.TEST `, role: UserRole.RESEARCH };
    const created = await http('post', 'users', cookie, input).expect(201); ids.push((created.body as { id: string }).id);
    const second = await http('post', 'users', cookie, { ...input, email: `${randomUUID()}@example.test` }).expect(201); ids.push((second.body as { id: string }).id);
    expect(second.body).toMatchObject({ username: `${(created.body as { username: string }).username}2`, isActive: true, credentialStatus: 'PENDING_FIRST_ACCESS' });
    const row = await users.findCredentialsById(ids.at(-2)!); expect(row?.passwordHash).toBeNull();
    expect(row?.email).toBe(input.email.trim().toLowerCase()); expect(row?.givenNames).toBe('Diego Armando');
    expect(Object.keys(created.body as object).sort()).toEqual(['id','givenNames','familyNames','username','email','role','isActive','createdAt','deactivatedAt','credentialStatus'].sort());
    expect(await prisma.firstAccessToken.count({ where: { userId: row!.id } })).toBe(0);
    await http('post', 'users', cookie, input).expect(409).expect(({ body }: { body: { code: string } }) => expect(body.code).toBe('EMAIL_EXISTS'));
  });
  it.each(['username','password','passwordHash','isActive','createdAt','createdBy','permissions','deactivatedAt'])('rechaza campo extra %s', async field => {
    const actor = await fixture(UserRole.ADMINISTRATOR);
    await http('post', 'users', await login(actor), { givenNames: 'Ana', familyNames: 'Prueba', email: `${randomUUID()}@example.test`, role: UserRole.RESEARCH, [field]: 'fixture' }).expect(400);
  });
  it('rechaza UUID, rol, consulta y datos inválidos; no existe bootstrap HTTP', async () => {
    const actor = await fixture(UserRole.ADMINISTRATOR); const cookie = await login(actor);
    await http('patch', 'users/invalid/role', cookie, { role: UserRole.BOARD }).expect(400);
    await http('patch', `users/${actor.id}/role`, cookie, { role: 'UNKNOWN' }).expect(400);
    await http('get', 'users?status=unknown', cookie).expect(400);
    await http('get', 'users?search=fixture', cookie).expect(400);
    for (const path of ['bootstrap','setup','auth/bootstrap']) await http('post', path).expect(404);
    await http('post', `users/${randomUUID()}/deactivate`, cookie).expect(404);
  });
  it('Board no lee inactivos antes de verificar su capability; orden estable', async () => {
    const actor = await fixture(UserRole.BOARD); const target = await fixture();
    await prisma.user.update({ where: { id: target.id }, data: { isActive: false, deactivatedAt: new Date() } });
    const list = jest.spyOn(users, 'listAdministrativeUsers'); const cookie = await login(actor);
    await http('get', 'users?status=inactive', cookie).expect(403); expect(list).not.toHaveBeenCalled();
    const response = await http('get', 'users', cookie).expect(200);
    expect(response.body).toHaveLength(1); expect(response.body).toMatchObject([{ id: actor.id }]);
  });
  it('ordena por apellidos, nombres e id y rechaza provider null/secretos', async () => {
    const actor = await fixture(UserRole.ADMINISTRATOR); const cookie = await login(actor);
    const created = [];
    for (const [familyNames, givenNames] of [['A Apellido','B Nombre'], ['A Apellido','A Nombre'], ['A Apellido','A Nombre']]) {
      const user = await users.createIdentity({ familyNames, givenNames, email: `${randomUUID()}@example.test`, role: UserRole.RESEARCH });
      ids.push(user.id); created.push(user);
    }
    const expected = [created[1].id, created[2].id].sort().concat(created[0].id);
    const response = await http('get', 'users', cookie).expect(200);
    expect((response.body as { id: string }[]).filter(row => row.id !== actor.id).map(row => row.id)).toEqual(expected);
    for (const extra of [{ provider: null }, { password: 'fixture' }, { oauthToken: 'fixture' }]) {
      await http('post', 'email-accounts', cookie, { address: `${randomUUID()}@example.test`, displayName: 'Institucional', ...extra }).expect(400);
    }
  });
  it('operaciones sobre otro Admin respetan el mínimo y actor desactualizado no concede acceso', async () => {
    const actor = await fixture(UserRole.ADMINISTRATOR); const target = await fixture(UserRole.ADMINISTRATOR);
    await access.deactivate(target.id, actor.id);
    await expect(administration.changeRole(actor.id, UserRole.BOARD, actor.id)).rejects.toMatchObject({ code: 'LAST_ADMINISTRATOR' });
    await administration.reactivate(target.id, actor.id);
    await administration.changeRole(actor.id, UserRole.BOARD, target.id);
    await expect(access.deactivate(target.id, actor.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(access.deactivate(target.id, target.id)).rejects.toMatchObject({ code: 'LAST_ADMINISTRATOR' });
  });
  it.each(['role', 'deactivate'])('último Admin no puede %s; con dos puede', async operation => {
    const actor = await fixture(UserRole.ADMINISTRATOR); const cookie = await login(actor);
    const attempt = () => operation === 'role' ? http('patch', `users/${actor.id}/role`, cookie, { role: UserRole.BOARD }) : http('post', `users/${actor.id}/deactivate`, cookie);
    await attempt().expect(409).expect(({ body }: { body: { code: string } }) => expect(body.code).toBe('LAST_ADMINISTRATOR'));
    await fixture(UserRole.ADMINISTRATOR); await attempt().expect(204);
  });
  it('cambio de rol auditado, idempotente, conserva sesión y adopta nuevo rol', async () => {
    const actor = await fixture(UserRole.ADMINISTRATOR); await fixture(UserRole.ADMINISTRATOR); const cookie = await login(actor);
    const before = await prisma.userSession.findMany({ where: { userId: actor.id } });
    await administration.changeRole(actor.id, UserRole.ADMINISTRATOR, actor.id); expect(await prisma.auditEvent.count()).toBe(0);
    await http('patch', `users/${actor.id}/role`, cookie, { role: UserRole.BOARD }).expect(204);
    expect(await prisma.auditEvent.findFirst({ where: { targetUserId: actor.id } })).toMatchObject({ action: AuditAction.USER_ROLE_CHANGED, actorUserId: actor.id, previousRole: UserRole.ADMINISTRATOR, newRole: UserRole.BOARD });
    expect(await prisma.userSession.findMany({ where: { userId: actor.id } })).toEqual(before);
    expect((await http('get', 'auth/me', cookie).expect(200)).body).toMatchObject({ role: UserRole.BOARD, permissions: [...getRolePermissions(UserRole.BOARD)] });
    await http('get', 'users', cookie).expect(200); await http('get', 'email-accounts', cookie).expect(403);
  });
  it('estado conserva identidad, buzones e historial; revoca todas las credenciales sin revivirlas', async () => {
    const actor = await fixture(UserRole.ADMINISTRATOR); const target = await fixture(); const pending = await fixture(UserRole.RESEARCH, false);
    const account = await mailbox(); const targetCookie = await login(target);
    await administration.setMailbox(target.id, account.id, true, actor.id);
    const reset = await resets.issue(target.id, publicIdentity(actor)); const initial = await first.issue(pending.id, publicIdentity(actor));
    await access.deactivate(target.id, actor.id); await access.deactivate(target.id, actor.id); await access.deactivate(pending.id, actor.id);
    await http('get', 'auth/me', targetCookie).expect(401);
    expect(await prisma.auditEvent.count({ where: { targetUserId: target.id, action: AuditAction.USER_DEACTIVATED } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { targetUserId: target.id, action: AuditAction.PASSWORD_RESET_REVOKED } })).toBe(1);
    await administration.reactivate(target.id, actor.id); await administration.reactivate(target.id, actor.id); await administration.reactivate(pending.id, actor.id);
    expect(await prisma.auditEvent.count({ where: { targetUserId: target.id, action: AuditAction.USER_REACTIVATED } })).toBe(1);
    expect(await users.findCredentialsById(target.id)).toMatchObject({ id: target.id, email: target.email, username: target.username, passwordHash, isActive: true, deactivatedAt: null });
    await http('get', 'auth/me', targetCookie).expect(401); await login(target);
    await expect(resets.consume(reset.token, randomBytes(24).toString('base64url'))).rejects.toThrow();
    await expect(first.consume(initial.token, password)).rejects.toThrow();
    expect(await administration.assignments(target.id, actor.id)).toMatchObject([{ id: account.id }]);
  });
  it('buzones: catálogo, duplicado, asignar/retirar/reasignar idempotentes conservan createdAt', async () => {
    const actor = await fixture(UserRole.ADMINISTRATOR); const target = await fixture(); const cookie = await login(actor);
    const response = await http('post', 'email-accounts', cookie, { address: ` ${randomUUID()}@EXAMPLE.TEST `, displayName: ' Institucional ', provider: ' Local ' }).expect(201);
    const account = response.body as { id: string; address: string }; accounts.push(account.id);
    await http('post', 'email-accounts', cookie, { address: account.address, displayName: 'Otro' }).expect(409);
    const path = `users/${target.id}/email-accounts/${account.id}`;
    await http('put', path, cookie).expect(204); await http('put', path, cookie).expect(204);
    const original = await prisma.userEmailAccount.findUniqueOrThrow({ where: { userId_emailAccountId: { userId: target.id, emailAccountId: account.id } } });
    await http('delete', path, cookie).expect(204); await http('delete', path, cookie).expect(204);
    expect((await administration.assignments(target.id, actor.id))).toEqual([]);
    await access.deactivate(target.id, actor.id); await http('put', path, cookie).expect(204);
    const current = await prisma.userEmailAccount.findUniqueOrThrow({ where: { userId_emailAccountId: { userId: target.id, emailAccountId: account.id } } });
    expect(current.createdAt).toEqual(original.createdAt); expect(current.removedAt).toBeNull();
    expect(await prisma.auditEvent.count({ where: { action: AuditAction.MAILBOX_ASSIGNED } })).toBe(2);
    expect(await prisma.auditEvent.count({ where: { action: AuditAction.MAILBOX_REMOVED } })).toBe(1);
    await prisma.emailAccount.update({ where: { id: account.id }, data: { isActive: false } });
    await http('put', path, cookie).expect(409); await http('put', `users/${target.id}/email-accounts/${randomUUID()}`, cookie).expect(404);
    expect((await administration.catalog(actor.id))).toEqual([]);
    await expect(prisma.userEmailAccount.update({ where: { userId_emailAccountId: { userId: target.id, emailAccountId: account.id } }, data: { removedAt: new Date(+original.createdAt - 1000) } })).rejects.toThrow();
  });
  it.each(['role','deactivate','reactivate','assign','remove'])('fallo de audit hace rollback de %s', async operation => {
    const actor = await fixture(UserRole.ADMINISTRATOR); const target = await fixture(); const account = await mailbox();
    if (operation === 'reactivate') await access.deactivate(target.id, actor.id);
    if (operation === 'remove') await administration.setMailbox(target.id, account.id, true, actor.id);
    const before = await users.findCredentialsById(target.id); const events = await prisma.auditEvent.count();
    const method = operation === 'role' ? 'recordRoleChange' : operation === 'deactivate' || operation === 'reactivate' ? 'recordUserStatus' : 'recordMailbox';
    jest.spyOn(audit, method).mockRejectedValueOnce(new Error('fixture audit failure'));
    const change = operation === 'role' ? administration.changeRole(target.id, UserRole.BOARD, actor.id) : operation === 'deactivate' ? access.deactivate(target.id, actor.id) :
      operation === 'reactivate' ? administration.reactivate(target.id, actor.id) : administration.setMailbox(target.id, account.id, operation === 'assign', actor.id);
    await expect(change).rejects.toThrow('fixture audit failure');
    expect(await users.findCredentialsById(target.id)).toEqual(before); expect(await prisma.auditEvent.count()).toBe(events);
    expect(await prisma.userEmailAccount.count({ where: { userId: target.id, removedAt: null } })).toBe(operation === 'remove' ? 1 : 0);
  });
  it.each(Object.values(AuditAction).filter(action => action.startsWith('PASSWORD_RESET_') || action.startsWith('USER_') || action.startsWith('MAILBOX_')))('CHECK acepta %s correcto y rechaza combinaciones imposibles', async action => {
    const actor = await fixture(UserRole.ADMINISTRATOR); const target = await fixture(); const account = await mailbox();
    const token = await resets.issue(target.id, publicIdentity(actor));
    const reset = await prisma.passwordResetToken.findUniqueOrThrow({ where: { tokenHash: hashOpaqueToken(token.token)! } });
    const data: Prisma.AuditEventUncheckedCreateInput = { action, targetUserId: target.id, actorUserId: actor.id };
    if (action.startsWith('PASSWORD_RESET')) { data.passwordResetTokenId = reset.id; if (action === AuditAction.PASSWORD_RESET_COMPLETED) data.actorUserId = null; }
    else if (action === AuditAction.USER_ROLE_CHANGED) { data.previousRole = UserRole.RESEARCH; data.newRole = UserRole.BOARD; }
    else if (action.startsWith('MAILBOX')) data.emailAccountId = account.id;
    await prisma.auditEvent.create({ data });
    await expect(prisma.auditEvent.create({ data: { ...data, ...(action.startsWith('PASSWORD_RESET') ? { newRole: UserRole.BOARD } : { passwordResetTokenId: reset.id }) } })).rejects.toThrow();
    if (!action.startsWith('PASSWORD_RESET')) await expect(prisma.auditEvent.create({ data: { ...data, actorUserId: null } })).rejects.toThrow();
    if (action === AuditAction.USER_ROLE_CHANGED) await expect(prisma.auditEvent.create({ data: { ...data, newRole: UserRole.RESEARCH } })).rejects.toThrow();
    if (action.startsWith('MAILBOX')) await expect(prisma.emailAccount.delete({ where: { id: account.id } })).rejects.toThrow();
  });

  it.each(['role-role','role-deactivate','deactivate-deactivate','assign-assign','assign-remove','reactivate-deactivate','emission-status'])('concurrencia con barrera %s', async scenario => {
    const actor = await fixture(UserRole.ADMINISTRATOR); const target = await fixture(); const account = await mailbox();
    if (scenario === 'assign-remove') await administration.setMailbox(target.id, account.id, true, actor.id);
    if (scenario === 'reactivate-deactivate') await access.deactivate(target.id, actor.id);
    const entered = barrier(); const release = barrier(); const original = users.withLockedCredentials.bind(users);
    let calls = 0;
    jest.spyOn(users, 'withLockedCredentials').mockImplementation((id, operation, locks) => original(id, async (user, tx) => {
      if (calls++ === 0) { entered.release(); await release.promise; }
      return operation(user, tx);
    }, locks));
    const firstOperation = () => scenario.startsWith('role') ? administration.changeRole(target.id, UserRole.BOARD, actor.id) :
      scenario.startsWith('assign') ? administration.setMailbox(target.id, account.id, true, actor.id) :
      scenario === 'reactivate-deactivate' ? administration.reactivate(target.id, actor.id) :
      scenario === 'emission-status' ? resets.issue(target.id, publicIdentity(actor)) : access.deactivate(target.id, actor.id);
    const secondOperation = () => scenario === 'role-role' ? administration.changeRole(target.id, UserRole.PLANNING, actor.id) :
      scenario === 'assign-assign' || scenario === 'assign-remove' ? administration.setMailbox(target.id, account.id, scenario === 'assign-assign', actor.id) : access.deactivate(target.id, actor.id);
    const one = firstOperation(); await entered.promise; const two = secondOperation(); release.release();
    expect((await Promise.allSettled([one, two])).every(result => result.status === 'fulfilled')).toBe(true);
    if (scenario === 'role-role') expect((await users.findIdentityById(target.id))?.role).toBe(UserRole.PLANNING);
    if (scenario === 'assign-assign') expect(await prisma.auditEvent.count({ where: { action: AuditAction.MAILBOX_ASSIGNED } })).toBe(1);
    if (scenario === 'assign-remove') expect(await administration.assignments(target.id, actor.id)).toEqual([]);
    if (scenario === 'emission-status') expect(await prisma.passwordResetToken.count({ where: { userId: target.id, revokedAt: null } })).toBe(0);
  });
  it.each(['role-role','role-deactivate','deactivate-deactivate'])('dos Admin salen concurrentemente: %s protege el último', async scenario => {
    const one = await fixture(UserRole.ADMINISTRATOR); const two = await fixture(UserRole.ADMINISTRATOR);
    const entered = barrier(); const release = barrier(); const original = users.protectLastAdministrator.bind(users);
    jest.spyOn(users, 'protectLastAdministrator').mockImplementationOnce(async (user, tx) => { entered.release(); await release.promise; return original(user, tx); });
    const changeOne = scenario.startsWith('role') ? administration.changeRole(one.id, UserRole.BOARD, one.id) : access.deactivate(one.id, one.id);
    await entered.promise;
    const changeTwo = scenario === 'role-role' ? administration.changeRole(two.id, UserRole.BOARD, two.id) : access.deactivate(two.id, two.id);
    release.release(); const results = await Promise.allSettled([changeOne, changeTwo]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.user.count({ where: { role: UserRole.ADMINISTRATOR, isActive: true } })).toBe(1);
  });
  it('actor pierde capability después del guard: la mutación y emisión releen bajo locks', async () => {
    const actor = await fixture(UserRole.ADMINISTRATOR); const other = await fixture(UserRole.ADMINISTRATOR); const target = await fixture(UserRole.RESEARCH, false);
    const entered = barrier(); const release = barrier(); const original = users.protectLastAdministrator.bind(users);
    jest.spyOn(users, 'protectLastAdministrator').mockImplementationOnce(async (user, tx) => { entered.release(); await release.promise; return original(user, tx); });
    const change = administration.changeRole(actor.id, UserRole.BOARD, other.id); await entered.promise;
    const denied = Promise.allSettled([administration.changeRole(target.id, UserRole.PLANNING, actor.id), first.issue(target.id, publicIdentity(actor))]);
    release.release(); await change;
    expect((await denied).every(result => result.status === 'rejected')).toBe(true);
    expect(await prisma.firstAccessToken.count({ where: { userId: target.id } })).toBe(0);
    expect((await users.findIdentityById(target.id))?.role).toBe(UserRole.RESEARCH);
  });

  describe('bootstrap inicial offline', () => {
    const input = () => ({ givenNames: 'Operador', familyNames: 'Inicial', email: `${randomUUID()}@example.test` });
    it('base vacía crea Admin y hash; pendiente puede regenerar, terminado rechaza', async () => {
      expect(await prisma.user.count()).toBe(0); const identity = input(); const result = await bootstrap.issue(identity); ids.push(result.id);
      expect(await users.findCredentialsById(result.id)).toMatchObject({ role: UserRole.ADMINISTRATOR, passwordHash: null, isActive: true });
      const row = await prisma.firstAccessToken.findUniqueOrThrow({ where: { tokenHash: hashOpaqueToken(result.token)! } });
      expect(row.createdByUserId).toBeNull(); expect(JSON.stringify(row)).not.toContain(result.token);
      const regenerated = await bootstrap.issue(identity); expect(regenerated.id).toBe(result.id);
      expect((await prisma.firstAccessToken.findUniqueOrThrow({ where: { id: row.id } })).revokedAt).not.toBeNull();
      await first.consume(regenerated.token, password); await expect(bootstrap.issue(identity)).rejects.toMatchObject({ code: 'BOOTSTRAP_UNAVAILABLE' });
    });
    it('dos procesos simultáneos solo uno completa, sin identidad parcial', async () => {
      expect(await prisma.user.count()).toBe(0); const entered = barrier(); const release = barrier(); const original = users.createIdentity.bind(users);
      jest.spyOn(users, 'createIdentity').mockImplementationOnce(async (input, tx) => { const user = await original(input, tx); entered.release(); await release.promise; return user; });
      const firstBootstrap = bootstrap.issue(input()); await entered.promise;
      await expect(bootstrap.issue(input())).rejects.toMatchObject({ code: 'BOOTSTRAP_BUSY' });
      release.release(); const result = await firstBootstrap; ids.push(result.id); expect(await prisma.user.count()).toBe(1);
    });
    it('falla token: rollback completo, y más de un usuario impide bootstrap', async () => {
      const initial = input();
      jest.spyOn(app.get(FirstAccessTokensService), 'revokePendingForUser').mockRejectedValueOnce(new Error('fixture token failure'));
      await expect(bootstrap.issue(initial)).rejects.toThrow(); expect(await prisma.user.count()).toBe(0); jest.restoreAllMocks();
      await fixture(UserRole.ADMINISTRATOR, false); await fixture(); await expect(bootstrap.issue(initial)).rejects.toMatchObject({ code: 'BOOTSTRAP_UNAVAILABLE' });
    });
    it.each(['inactive','other-role','other-email'])('único usuario %s impide aprovisionar', async state => {
      const actor = await fixture(state === 'other-role' ? UserRole.BOARD : UserRole.ADMINISTRATOR, false);
      if (state === 'inactive') await prisma.user.update({ where: { id: actor.id }, data: { isActive: false, deactivatedAt: new Date() } });
      await expect(bootstrap.issue({ ...input(), email: state === 'other-email' ? `${randomUUID()}@example.test` : actor.email })).rejects.toMatchObject({ code: 'BOOTSTRAP_UNAVAILABLE' });
      expect(await prisma.firstAccessToken.count()).toBe(0);
    });
  });
});
