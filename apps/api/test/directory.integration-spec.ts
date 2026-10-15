import { OrganizationBranchesService } from '../src/modules/directory/organization-branches.service';
import { type INestApplication, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { randomBytes, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import request from 'supertest';
import { Client } from 'pg';
import { readFileSync } from 'node:fs';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/config/application';
import { validateEnvironment } from '../src/config/environment';
import { validateDatabaseUrl } from '../src/config/database-url';
import { PrismaService } from '../src/database/prisma.service';
import { AuditAction, UserRole, Prisma } from '../src/generated/prisma/client';
import { UsersService } from '../src/modules/users/users.service';
import { PasswordService } from '../src/modules/auth/password.service';
import { SessionsService } from '../src/modules/auth/sessions.service';
import { DirectoryService } from '../src/modules/directory/directory.service';
import { DirectoryHistoryService } from '../src/modules/directory/directory-history.service';
import { AuditService } from '../src/modules/audit/audit.service';

const databaseUrl = validateDatabaseUrl(process.env.DATABASE_URL);
if (!new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('Directorio requiere una base aislada _test.');
function barrier() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}
describe('Directorio PostgreSQL y HTTP', () => {
  let app: INestApplication<Server>; let prisma: PrismaService; let users: UsersService; let directory: DirectoryService;
  let history: DirectoryHistoryService; let audit: AuditService; let passwordHash: string;
  const password = `Dir!a${randomBytes(24).toString('base64url')}`;
  const contactMethodIds:string[]=[];
  const userIds: string[] = []; const organizationIds: string[] = []; const categoryIds: string[] = [];
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ConfigService)
      .useValue(new ConfigService(validateEnvironment({ NODE_ENV: 'test', DATABASE_URL: databaseUrl }))).compile();
    app = moduleRef.createNestApplication<INestApplication<Server>>(); configureApplication(app); await app.init();
    prisma = app.get(PrismaService); users = app.get(UsersService); directory = app.get(DirectoryService);
    history = app.get(DirectoryHistoryService); audit = app.get(AuditService);
    passwordHash = await app.get(PasswordService).hashNew(password);
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await prisma.$transaction([
      prisma.auditEvent.deleteMany({ where: { actorUserId: { in: userIds } } }),
      prisma.directoryChange.deleteMany({ where: { actorUserId: { in: userIds } } }),
      prisma.organizationContact.deleteMany({where:{organizationId:{in:organizationIds}}}),
      prisma.contactMethod.deleteMany({where:{id:{in:contactMethodIds}}}),
      prisma.archivedOrganizationCategory.deleteMany({ where: { organizationId: { in: organizationIds } } }),
      prisma.organization.updateMany({ where: { id: { in: organizationIds } }, data: { branchOfId: null } }),
      prisma.organization.deleteMany({ where: { id: { in: organizationIds } } }),
      prisma.archivedCategory.deleteMany({ where: { id: { in: categoryIds } } }),
      prisma.userSession.deleteMany({ where: { userId: { in: userIds } } }),
      prisma.user.deleteMany({ where: { id: { in: userIds } } }),
    ]);
    contactMethodIds.length=0; userIds.length = 0; organizationIds.length = 0; categoryIds.length = 0;
  });
  afterAll(async () => { await app.close(); });
  async function fixture(role: UserRole = UserRole.ADMINISTRATOR) {
    const user = await users.createIdentity({ givenNames: 'QA', familyNames: randomUUID(), email: randomUUID() + '@example.test', role });
    userIds.push(user.id); await prisma.user.update({ where: { id: user.id }, data: { passwordHash } }); return user;
  }
  async function organization(actor: string, name = 'Organización', branchOfId?: string) {
    const row = await directory.createOrganization({ name, branchOfId,country:branchOfId?'La Paz':undefined }, actor); organizationIds.push(row.id); return row;
  }
  async function cookie(user: { email: string }) {
    const result = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: user.email, password }).expect(200);
    return (result.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
  }
  const routes = [
    ['get', 'organizations'], ['get', 'organizations/ID'], ['get', 'organizations/ID/branches'], ['get', 'organizations/ID/history'],
    ['post', 'organizations'], ['post','organizations/ID/branches'],['get','organizations/ID/branches/ID/profile'],['put','organizations/ID/branches/ID/profile'], ['put', 'organizations/ID'], ['patch', 'organizations/ID/status'],
  ] as const;
  it.each(routes)('anónimo %s %s recibe 401', async (method, path) => {
    await request(app.getHttpServer())[method]('/api/v1/' + path.replace('ID', randomUUID())).expect(401);
  });
  it.each(routes)('sin capability %s %s recibe 403 antes de operar', async (method, path) => {
    const actor = await fixture();
    jest.spyOn(app.get(SessionsService), 'findIdentity').mockResolvedValue({ ...actor, role: 'UNKNOWN' as UserRole });
    await request(app.getHttpServer())[method]('/api/v1/' + path.replace('ID', randomUUID())).set('Cookie', 'cecasem_session=fixture').expect(403);
    expect(await prisma.organization.count()).toBe(0);
  });
  it.each(Object.values(UserRole))('%s opera fichas y áreas de interés; estado solo Admin', async role => {
    const actor = await fixture(role); const auth = await cookie(actor);
    const created = await request(app.getHttpServer()).post('/api/v1/organizations').set('Cookie', auth).send({ name: '  Fundación   Inicial  ' }).expect(201);
    const org = created.body as { id: string; version: number }; organizationIds.push(org.id);
    expect(created.body).toMatchObject({ name: 'Fundación Inicial', country: null, interestAreas: [], version: 1 });
    expect(created.body).not.toHaveProperty('lastVerifiedAt');
    expect(created.body).not.toHaveProperty('normalizedName');
    const edited = await request(app.getHttpServer()).put('/api/v1/organizations/' + org.id).set('Cookie', auth)
      .send({ name: 'Fundación Inicial', expectedVersion: 1, country: '  Bolivia  ', interestAreas: ['Salud Institucional'] }).expect(200);
    expect(edited.body).toMatchObject({ version: 2, country: 'Bolivia' });
    expect(edited.body).not.toHaveProperty('lastVerifiedAt');
    for (const path of ['organizations', 'organizations/' + org.id, 'organizations/' + org.id + '/branches', 'organizations/' + org.id + '/history']) await request(app.getHttpServer()).get('/api/v1/' + path).set('Cookie', auth).expect(path.endsWith('/history') && role !== UserRole.ADMINISTRATOR ? 403 : 200);
    for (const [path, version] of [['organizations/' + org.id, 2]] as const) {
      await request(app.getHttpServer()).patch('/api/v1/' + path + '/status').set('Cookie', auth)
        .send({ isActive: false, expectedVersion: version }).expect(role === UserRole.ADMINISTRATOR ? 200 : 403);
    }
    expect((await directory.getOrganization(org.id)).interestAreas).toEqual(['Salud Institucional']);
  });
  it.each([
    {}, { name: '' }, { name: ' '.repeat(5) }, { name: 12 }, { name: 'x'.repeat(251) }, { name: 'Ficha', country: 'x'.repeat(151) },
    { name: 'Ficha', officialWebsite: 'javascript:alert(1)' }, { name: 'Ficha', isActive: false },
    { name: 'Ficha', lastVerifiedAt: new Date().toISOString() }, { name: 'Ficha', categoryIds: null },
    { name: 'Ficha', categoryIds: ['bad'] }, { name: 'Ficha', interestAreas: null },
    { name: 'Ficha', interestAreas: [' '] }, { name: 'Ficha', interestAreas: [123] }, { name: 'Ficha', interestAreas: ['x'.repeat(151)] },
    { name: 'Ficha', interestAreas: Array(101).fill('Salud') }, { name: 'Ficha', branchOfId: 'bad' },
  ])('rechaza DTO inválido %j con 400', async input => {
    const actor = await fixture(); const auth = await cookie(actor);
    await request(app.getHttpServer()).post('/api/v1/organizations').set('Cookie', auth).send(input).expect(400);
    expect(await prisma.organization.count()).toBe(0);
  });
  it('400,404,409 públicos, sin detalles Prisma; paginación ordenada y acotada', async () => {
    const actor = await fixture(); const auth = await cookie(actor);
    for (const path of ['organizations/invalid', 'organizations?page=0', 'organizations?pageSize=101', 'organizations?unexpected=1']) {
      await request(app.getHttpServer()).get('/api/v1/' + path).set('Cookie', auth).expect(400);
    }
    await request(app.getHttpServer()).get('/api/v1/organizations/' + randomUUID()).set('Cookie', auth).expect(404);
    const first = await organization(actor.id, 'Igual'); const second = await organization(actor.id, 'Igual');
    const list = await request(app.getHttpServer()).get('/api/v1/organizations?page=1&pageSize=1').set('Cookie', auth).expect(200);
    expect(list.body).toMatchObject({ total: 2, page: 1, pageSize: 1, items: [{ id: [first.id, second.id].sort()[0] }] });
    const conflict = await request(app.getHttpServer()).put('/api/v1/organizations/' + first.id).set('Cookie', auth)
      .send({ name: 'Nuevo', expectedVersion: 2 }).expect(409);
    expect(conflict.body).toMatchObject({ statusCode: 409, code: 'VERSION_CONFLICT', path: '/api/v1/organizations/' + first.id });
    expect(Object.keys(conflict.body as object).sort()).toEqual(['code','message','path','statusCode','timestamp']);
  });
  it('las áreas se guardan, editan y vacían conservando valores y autoría en historial', async () => {
    const actor = await fixture(), row = await organization(actor.id);
    const edited = await directory.editOrganization(row.id, { name: row.name, interestAreas: [' Educación ', 'Salud'], expectedVersion: 1 }, actor.id);
    expect(edited.interestAreas).toEqual(['Educación', 'Salud']);
    await directory.editOrganization(row.id, { name: row.name, interestAreas: [], expectedVersion: 2 }, actor.id);
    const result = await directory.organizationHistory(row.id, { page: 1, pageSize: 25 });
    expect(result.total).toBe(2);
    expect(result.items[0].changes).toContainEqual(expect.objectContaining({ field: 'interestAreas', previousValue: ['Educación', 'Salud'], newValue: [] }));
    await expect(prisma.organization.delete({ where: { id: row.id } })).rejects.toThrow();
  });
  it('edición agrupa valores tipados, autor y auditoría; no modifica verificación ni creación', async () => {
    const actor = await fixture(); const row = await organization(actor.id);
    const edited = await directory.editOrganization(row.id, { name: 'Nuevo nombre', country: 'Bolivia', description: 'Descripción', expectedVersion: 1 }, actor.id);
    expect(edited.createdAt).toEqual(row.createdAt); expect(edited.version).toBe(2); expect(edited).not.toHaveProperty('lastVerifiedAt');
    const entries = await prisma.directoryChange.findMany({ where: { organizationId: row.id } });
    expect(entries).toHaveLength(3); expect(new Set(entries.map(e => e.operationId)).size).toBe(1);
    expect(entries.find(e => e.field === 'description')).toMatchObject({ previousValue: null, newValue: 'Descripción', actorUserId: actor.id });
    expect(await prisma.auditEvent.findFirst({ where: { organizationId: row.id } })).toMatchObject({
      action: AuditAction.ORGANIZATION_UPDATED, operationId: entries[0].operationId, targetUserId: null, actorUserId: actor.id });
    await directory.editOrganization(row.id, { name: edited.name, country: edited.country, description: edited.description, expectedVersion: 2 }, actor.id);
    expect(await prisma.directoryChange.count()).toBe(3); expect((await directory.getOrganization(row.id)).version).toBe(2);
  });
  it.each(['history', 'audit'])('rollback completo de edición si falla %s', async failure => {
    const actor = await fixture(); const row = await organization(actor.id);
    if (failure === 'history') jest.spyOn(history, 'record').mockRejectedValueOnce(new Error('fixture'));
    else jest.spyOn(audit, 'recordDirectory').mockRejectedValueOnce(new Error('fixture'));
    await expect(directory.editOrganization(row.id, { name: 'No confirmar', expectedVersion: 1, interestAreas: ['Salud'] }, actor.id)).rejects.toThrow();
    expect(await directory.getOrganization(row.id)).toEqual(row); expect(await prisma.directoryChange.count()).toBe(0);
    expect(await prisma.auditEvent.count()).toBe(0);
  });
  it('rollback de estado si falla auditoría, actor inactivo/rol vigente protegido', async () => {
    const actor = await fixture(); const row = await organization(actor.id);
    jest.spyOn(audit, 'recordDirectory').mockRejectedValue(new Error('fixture'));
    await expect(directory.organizationStatus(row.id, { isActive: false, expectedVersion: 1 }, actor.id)).rejects.toThrow();
    expect((await directory.getOrganization(row.id)).isActive).toBe(true);
    await prisma.user.update({ where: { id: actor.id }, data: { role: UserRole.RESEARCH } });
    await expect(directory.organizationStatus(row.id, { isActive: false, expectedVersion: 1 }, actor.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await prisma.user.update({ where: { id: actor.id }, data: { isActive: false, deactivatedAt: new Date() } });
    await expect(directory.editOrganization(row.id, { name: 'No', expectedVersion: 1 }, actor.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('el catálogo y los filtros retirados ya no están disponibles', async () => {
    const auth = await cookie(await fixture());
    await request(app.getHttpServer()).get('/api/v1/categories').set('Cookie', auth).expect(404);
    await request(app.getHttpServer()).post('/api/v1/categories').set('Cookie', auth).send({ name: 'Salud' }).expect(404);
    await request(app.getHttpServer()).get('/api/v1/organizations').set('Cookie', auth).query({ categoryId: randomUUID() }).expect(400);
  });
  it('rechaza ciclos y expone las sedes asociadas', async () => {
    const actor = await fixture(); const a = await organization(actor.id, 'A'); const b = await organization(actor.id, 'B', a.id); const c = await organization(actor.id, 'C', b.id);
    const auth = await cookie(actor);
    for (const branchOfId of [a.id, c.id]) await request(app.getHttpServer()).put('/api/v1/organizations/' + a.id).set('Cookie', auth)
      .send({ name: 'A', country:'La Paz', branchOfId, expectedVersion: 1 }).expect(409).expect(({ body }: { body: { code: string } }) => expect(body.code).toBe('INVALID_HIERARCHY'));
    await expect(directory.editOrganization(a.id, { name: 'A',country:'La Paz', branchOfId: randomUUID(), expectedVersion: 1 }, actor.id)).rejects.toMatchObject({ code: 'ORGANIZATION_NOT_FOUND' });
    expect((await directory.branches(a.id, { page: 1, pageSize: 25, status: 'all' })).items.map(r => r.id)).toEqual([b.id]);
  });
  it('dos ediciones de versión N: solo una confirma, sin perder historial', async () => {
    const actor = await fixture(); const row = await organization(actor.id); const entered = barrier(); const release = barrier(); const queued = barrier();
    const original = directory.lockHierarchy.bind(directory); let calls = 0;
    jest.spyOn(directory, 'lockHierarchy').mockImplementation(async tx => {
      const order = ++calls; if (order === 2) queued.release();
      await original(tx); if (order === 1) { entered.release(); await release.promise; }
    });
    const first = directory.editOrganization(row.id, { name: 'Primera', expectedVersion: 1 }, actor.id);
    await entered.promise;
    const second = directory.editOrganization(row.id, { name: 'Segunda', expectedVersion: 1 }, actor.id);
    await queued.promise; release.release();
    const results = await Promise.allSettled([first, second]);
    expect(results[0].status).toBe('fulfilled'); expect(results[1]).toMatchObject({ status: 'rejected', reason: { code: 'VERSION_CONFLICT' } });
    expect((await directory.getOrganization(row.id)).name).toBe('Primera'); expect(await prisma.directoryChange.count()).toBe(1);
  });
  it('asociaciones de sede concurrentes A→B/B→A no forman ciclo con barrera determinista', async () => {
    const actor = await fixture(); const a = await organization(actor.id, 'A'); const b = await organization(actor.id, 'B');
    const entered = barrier(); const release = barrier(); const queued = barrier(); let calls = 0;
    const original = directory.lockHierarchy.bind(directory);
    jest.spyOn(directory, 'lockHierarchy').mockImplementation(async tx => {
      const order = ++calls; if (order === 2) queued.release();
      await original(tx); if (order === 1) { entered.release(); await release.promise; }
    });
    const first = directory.editOrganization(a.id, { name: 'A',country:'La Paz', branchOfId: b.id, expectedVersion: 1 }, actor.id);
    await entered.promise;
    const second = directory.editOrganization(b.id, { name: 'B',country:'La Paz', branchOfId: a.id, expectedVersion: 1 }, actor.id);
    await queued.promise; release.release();
    expect((await Promise.allSettled([first, second]))[1]).toMatchObject({ status: 'rejected', reason: { code: 'INVALID_HIERARCHY' } });
    expect((await directory.getOrganization(a.id)).branchOfId).toBe(b.id); expect((await directory.getOrganization(b.id)).branchOfId).toBeNull();
  });
  it('SQL protege nombres, versión, sede asociada y self, historial tipado/target', async () => {
    const actor = await fixture(); const row = await organization(actor.id);
    for (const data of [{ name: '   ' }, { version: 0 }, { branchOfId: row.id }, { branchOfId: randomUUID() }]) {
      await expect(prisma.organization.update({ where: { id: row.id }, data })).rejects.toThrow();
    }
    const base = { organizationId: row.id, actorUserId: actor.id, operationId: randomUUID(), field: 'country', newValue: 'Bolivia' };
    // JsonNull representa JSON null; el campo SQL nunca es NULL.
    const valid = { ...base, previousValue: Prisma.JsonNull };
    await prisma.directoryChange.create({ data: valid });
    for (const data of [
      { ...valid, operationId: randomUUID(), organizationId: null }, { ...valid, operationId: randomUUID(), field: 'password' },
      { ...valid, operationId: randomUUID(), field: 'isActive', previousValue: 'true', newValue: false },
      { ...valid, operationId: randomUUID(), field: 'categoryIds', previousValue: [], newValue: [false] },
      { ...valid, operationId: randomUUID(), previousValue: 'Bolivia' },
    ]) await expect(prisma.directoryChange.create({ data })).rejects.toThrow();
  });
  it.each([AuditAction.ORGANIZATION_UPDATED, AuditAction.ORGANIZATION_STATUS_CHANGED])('SQL auditoría %s exige subject real, actor y operación', async action => {
    const actor = await fixture(); const row = await organization(actor.id);
    const target = { organizationId: row.id };
    const data = { action, ...target, actorUserId: actor.id, operationId: randomUUID() };
    await prisma.auditEvent.create({ data });
    for (const invalid of [{ ...data, actorUserId: null }, { ...data, operationId: null }, { ...data, targetUserId: actor.id },
      { ...data, previousRole: UserRole.BOARD }, { ...data, organizationId: row.id, categoryId: randomUUID() }]) {
      await expect(prisma.auditEvent.create({ data: invalid })).rejects.toThrow();
    }
    await expect(prisma.auditEvent.create({ data: { action: AuditAction.USER_DEACTIVATED, actorUserId: actor.id } })).rejects.toThrow();
  });
  it('la migración conserva categorías asignadas, enlaces e historial sin inventar áreas', async () => {
    const actor = await fixture(), org = await organization(actor.id), empty = await organization(actor.id, 'Sin clasificación');
    const client = new Client({ connectionString: databaseUrl }); await client.connect();
    const categoryId = randomUUID(), operationId = randomUUID();
    try {
      await client.query('BEGIN');
      // Reconstruct the immediately preceding schema inside a rolled-back transaction.
      await client.query('ALTER TABLE "ArchivedCategory" RENAME TO "Category"; ALTER TABLE "ArchivedOrganizationCategory" RENAME TO "OrganizationCategory"; ALTER TABLE "Organization" DROP COLUMN "interestAreas";');
      await client.query('INSERT INTO "Category" (id, name, "normalizedName", "isActive") VALUES ($1, $2, $3, false)', [categoryId, 'Educación', 'educación']);
      await client.query('INSERT INTO "OrganizationCategory" ("organizationId", "categoryId") VALUES ($1, $2)', [org.id, categoryId]);
      await client.query(`INSERT INTO "DirectoryChange" ("organizationId", "actorUserId", "operationId", field, "previousValue", "newValue") VALUES ($1, $2, $3, 'categoryIds', '[]', $4::jsonb)`, [org.id, actor.id, operationId, JSON.stringify([categoryId])]);
      const migration = readFileSync('prisma/migrations/20261015120000_organization_interest_areas/migration.sql', 'utf8').replace(/^BEGIN;|COMMIT;$/gm, '');
      await client.query(migration);
      const rows = await client.query<{id: string; interestAreas: string[]}>('SELECT id, "interestAreas" FROM "Organization" WHERE id = ANY($1::uuid[])', [[org.id, empty.id]]);
      expect(rows.rows.find(row => row.id === org.id)?.interestAreas).toEqual(['Educación']);
      expect(rows.rows.find(row => row.id === empty.id)?.interestAreas).toEqual([]);
      expect((await client.query('SELECT 1 FROM "ArchivedOrganizationCategory" WHERE "organizationId"=$1 AND "categoryId"=$2', [org.id, categoryId])).rowCount).toBe(1);
      expect((await client.query<{newValue: string[]}>('SELECT "newValue" FROM "DirectoryChange" WHERE "operationId"=$1', [operationId])).rows[0].newValue).toEqual([categoryId]);
    } finally { await client.query('ROLLBACK'); await client.end(); }
  });
  it('fallo inesperado se traduce a 500 público y no deja modificación', async () => {
    const actor = await fixture(); const row = await organization(actor.id);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(history, 'record').mockRejectedValueOnce(new Error('internal fixture'));
    const auth = await cookie(actor);
    const response = await request(app.getHttpServer()).put('/api/v1/organizations/' + row.id).set('Cookie', auth).send({ name: 'No', expectedVersion: 1 }).expect(500);
    expect(response.body).toMatchObject({ message: 'Error interno del servidor.' });
    expect(JSON.stringify(response.body)).not.toContain('fixture'); expect(await directory.getOrganization(row.id)).toEqual(row);
  });
  it('crea una sede con varios medios propios y hereda áreas actualizadas sin copiarlas',async()=>{
    const actor=await fixture(),auth=await cookie(actor),owner=await organization(actor.id);
    await directory.editOrganization(owner.id,{name:owner.name,interestAreas:['Salud'],expectedVersion:1},actor.id);
    const response=await request(app.getHttpServer()).post('/api/v1/organizations/'+owner.id+'/branches').set('Cookie',auth).send({country:'La Paz, Bolivia',contactMethods:[{type:'EMAIL',value:'sede-'+randomUUID()+'@example.test'},{type:'PHONE',value:'+591 76543210'}]}).expect(201);
    expect(response.body).toMatchObject({name:owner.name,country:'La Paz, Bolivia'});
    const branch=response.body as {id:string;interestAreas:string[]};organizationIds.push(branch.id);
    const media=await prisma.organizationContact.findMany({where:{organizationId:branch.id},include:{contactMethod:true}});contactMethodIds.push(...media.map(row=>row.contactMethodId));
    expect(media).toHaveLength(2);expect(branch.interestAreas).toEqual(['Salud']);
    expect((await prisma.organization.findUniqueOrThrow({where:{id:branch.id}})).interestAreas).toEqual([]);
    expect(await prisma.organizationContact.count({where:{organizationId:owner.id}})).toBe(0);
    await directory.editOrganization(owner.id,{name:owner.name,interestAreas:['Cooperación'],expectedVersion:2},actor.id);
    expect((await directory.getOrganization(branch.id)).interestAreas).toEqual(['Cooperación']);
    expect((await directory.branches(owner.id,{page:1,pageSize:25,status:'all'})).items[0].interestAreas).toEqual(['Cooperación']);
    const nested=await organization(actor.id,'Representación',branch.id);expect(nested.interestAreas).toEqual(['Cooperación']);
    const edited=await directory.editOrganization(branch.id,{name:'Sede corregida',country:'Cochabamba',branchOfId:owner.id,interestAreas:['No independiente'],expectedVersion:1},actor.id);
    expect(edited.interestAreas).toEqual(['Cooperación']);expect(edited.name).toBe(owner.name);
  });
  it('un correo ocupado revierte la sede y los otros contactos de su mismo registro',async()=>{
    const actor=await fixture(),auth=await cookie(actor),owner=await organization(actor.id);
    const first=await request(app.getHttpServer()).post('/api/v1/organizations/'+owner.id+'/branches').set('Cookie',auth).send({country:'La Paz',contactMethods:[{type:'EMAIL',value:'ocupado-'+randomUUID()+'@example.test'}]}).expect(201);
    const original=first.body as {id:string};organizationIds.push(original.id);
    const existing=await prisma.organizationContact.findFirstOrThrow({where:{organizationId:original.id},include:{contactMethod:true}});contactMethodIds.push(existing.contactMethodId);
    const before=await prisma.organization.count(),methods=await prisma.contactMethod.count(),changes=await prisma.directoryChange.count();
    await request(app.getHttpServer()).post('/api/v1/organizations/'+owner.id+'/branches').set('Cookie',auth).send({country:'Cochabamba',contactMethods:[{type:'PHONE',value:'+591 76543211'},{type:'EMAIL',value:existing.contactMethod.value}]}).expect(409);
    expect(await prisma.organization.count()).toBe(before);expect(await prisma.contactMethod.count()).toBe(methods);expect(await prisma.directoryChange.count()).toBe(changes);
  });
  it('el formulario de sede admite contactos vacíos y rechaza datos inválidos y áreas propias',async()=>{
    const actor=await fixture(),auth=await cookie(actor),owner=await organization(actor.id);
    const created=await request(app.getHttpServer()).post('/api/v1/organizations/'+owner.id+'/branches').set('Cookie',auth).send({country:'Santa Cruz',contactMethods:[]}).expect(201);
    organizationIds.push((created.body as {id:string}).id);
    for(const input of [{country:'La Paz',contactMethods:[{type:'EMAIL',value:'bad'}]},{country:'La Paz',interestAreas:['Propias']},{country:'La Paz',branchOfId:owner.id},{},{country:null},{country:''},{country:'   '},{country:'La Paz',name:'Nombre arbitrario'}])await request(app.getHttpServer()).post('/api/v1/organizations/'+owner.id+'/branches').set('Cookie',auth).send(input).expect(400);
    await request(app.getHttpServer()).post('/api/v1/organizations/'+randomUUID()+'/branches').set('Cookie',auth).send({country:'La Paz'}).expect(404);
  });

  it('el directorio pagina y cuenta solo organizaciones principales con y sin filtros; conserva sedes anidadas',async()=>{
    const actor=await fixture(),auth=await cookie(actor);
    const first=await directory.createOrganization({name:'A principal',country:'Bolivia'},actor.id);organizationIds.push(first.id);
    const second=await directory.createOrganization({name:'B principal',country:'Bolivia'},actor.id);organizationIds.push(second.id);
    const branch=await directory.createOrganization({name:first.name,country:'Bolivia',branchOfId:first.id},actor.id);organizationIds.push(branch.id);
    const nested=await organization(actor.id,'Representación',branch.id);
    await directory.organizationStatus(second.id,{isActive:false,expectedVersion:1},actor.id);
    await directory.organizationStatus(branch.id,{isActive:false,expectedVersion:1},actor.id);
    for(const filters of [{},{country:'Bolivia'},{withCommunications:false},{country:'Bolivia',withCommunications:false},{name:'A principal'}]) {
      const response=await request(app.getHttpServer()).get('/api/v1/organizations').set('Cookie',auth).query({status:'all',page:1,pageSize:25,...filters}).expect(200);
      expect(response.body).toMatchObject({total:'name' in filters?1:2});
      expect((response.body as {items:Array<{id:string;branchOfId:string|null}>}).items.every(row=>row.branchOfId===null)).toBe(true);
    }
    for(const filters of [{},{country:'Bolivia'}]) {
      const response=await request(app.getHttpServer()).get('/api/v1/organizations').set('Cookie',auth).query({status:'all',page:2,pageSize:1,...filters}).expect(200);
      expect(response.body).toMatchObject({total:2,page:2,items:[{id:second.id}]});
    }
    const inactive=await directory.listOrganizations({status:'inactive',page:1,pageSize:25});expect(inactive.items.map(row=>row.id)).toEqual([second.id]);
    expect((await directory.branches(first.id,{status:'all',page:1,pageSize:25})).items.map(row=>row.id)).toEqual([branch.id]);
    expect((await directory.branches(branch.id,{status:'all',page:1,pageSize:25})).items.map(row=>row.id)).toEqual([nested.id]);
    expect((await directory.getOrganization(branch.id)).branchOfId).toBe(first.id);
  });

  function branchEditInput(profile:Awaited<ReturnType<OrganizationBranchesService['profile']>>) {
    return {country:profile.branch.country??'',alias:profile.branch.alias,description:profile.branch.description,officialWebsite:profile.branch.officialWebsite,expectedVersion:profile.branch.version,
      expectedContacts:profile.contacts.map(row=>({id:row.id,version:row.version,methodVersion:row.contactMethod.version})),
      contacts:profile.contacts.map(row=>({id:row.id,type:row.contactMethod.type,value:row.contactMethod.value,label:row.contactMethod.label,sourceDescription:row.sourceDescription,sourceUrl:row.sourceUrl,notes:row.notes}))};
  }
  it('el perfil de sede guarda datos y contactos juntos; retirar conserva el antecedente y el guardado vacío no cambia versión',async()=>{
    const actor=await fixture(),owner=await organization(actor.id),service=app.get(OrganizationBranchesService);
    const branch=await service.create(owner.id,{country:'Amsterdam',contactMethods:[{type:'EMAIL',value:randomUUID()+'@example.test',notes:'Contexto original'}]},actor.id);organizationIds.push(branch.id);
    const initial=await service.profile(owner.id,branch.id);contactMethodIds.push(...initial.contacts.map(row=>row.contactMethodId));
    const input=branchEditInput(initial);input.country='Rotterdam';input.description='Descripción corregida';input.contacts[0].value=randomUUID()+'@example.test';input.contacts[0].notes='Contexto corregido';
    const saved=await service.edit(owner.id,branch.id,input,actor.id),fresh=await service.profile(owner.id,branch.id);contactMethodIds.push(...fresh.contacts.map(row=>row.contactMethodId));
    expect(saved).toMatchObject({name:owner.name,country:'Rotterdam',version:2,description:'Descripción corregida'});
    expect(fresh.contacts[0]).toMatchObject({notes:'Contexto corregido',contactMethod:{value:input.contacts[0].value}});
    expect(await prisma.organizationContact.findUnique({where:{id:initial.contacts[0].id}})).toMatchObject({isActive:false,notes:'Contexto original'});
    expect((await service.edit(owner.id,branch.id,branchEditInput(fresh),actor.id)).version).toBe(2);
    const contextInput=branchEditInput(fresh);contextInput.contacts[0].sourceDescription='Fuente actualizada';contextInput.contacts[0].notes='';
    expect((await service.edit(owner.id,branch.id,contextInput,actor.id)).version).toBe(3);
    const contextual=await service.profile(owner.id,branch.id);expect(contextual.contacts[0]).toMatchObject({sourceDescription:'Fuente actualizada',notes:null,version:2});
    const remove=branchEditInput(contextual);remove.contacts=[];await service.edit(owner.id,branch.id,remove,actor.id);
    expect((await service.profile(owner.id,branch.id)).contacts).toHaveLength(0);expect(await prisma.organizationContact.count({where:{organizationId:branch.id}})).toBe(2);
  });
  it('un conflicto de medios revierte la edición de sede y evita escribir en una sede de otro referente',async()=>{
    const actor=await fixture(),owner=await organization(actor.id),other=await organization(actor.id),service=app.get(OrganizationBranchesService);
    const branch=await service.create(owner.id,{country:'Amsterdam',contactMethods:[{type:'EMAIL',value:randomUUID()+'@example.test'}]},actor.id);organizationIds.push(branch.id);
    const initial=await service.profile(owner.id,branch.id);contactMethodIds.push(...initial.contacts.map(row=>row.contactMethodId));
    const input=branchEditInput(initial);input.country='No guardar';input.expectedContacts[0].version+=1;
    const changes=await prisma.directoryChange.count();await expect(service.edit(owner.id,branch.id,input,actor.id)).rejects.toMatchObject({code:'VERSION_CONFLICT'});
    expect(await service.profile(owner.id,branch.id)).toEqual(initial);expect(await prisma.directoryChange.count()).toBe(changes);
    await expect(service.profile(other.id,branch.id)).rejects.toMatchObject({code:'ORGANIZATION_NOT_FOUND'});
    await expect(service.edit(other.id,branch.id,branchEditInput(initial),actor.id)).rejects.toMatchObject({code:'ORGANIZATION_NOT_FOUND'});
    const foreign=await service.create(other.id,{country:'Otra sede',contactMethods:[{type:'EMAIL',value:randomUUID()+'@example.test'}]},actor.id);organizationIds.push(foreign.id);
    const foreignProfile=await service.profile(other.id,foreign.id);contactMethodIds.push(...foreignProfile.contacts.map(row=>row.contactMethodId));
    const occupied=branchEditInput(initial);occupied.country='No guardar';occupied.contacts[0].value=foreignProfile.contacts[0].contactMethod.value;
    await expect(service.edit(owner.id,branch.id,occupied,actor.id)).rejects.toMatchObject({code:'CONTACT_EMAIL_EXISTS'});
    expect(await service.profile(owner.id,branch.id)).toEqual(initial);
    const foreignId=branchEditInput(initial);foreignId.contacts[0].id=foreignProfile.contacts[0].id;
    await expect(service.edit(owner.id,branch.id,foreignId,actor.id)).rejects.toMatchObject({code:'INVALID_DIRECTORY'});
    const auth=await cookie(actor);
    await request(app.getHttpServer()).get(`/api/v1/organizations/${owner.id}/branches/${branch.id}/profile`).set('Cookie',auth).expect(200);
    await request(app.getHttpServer()).put(`/api/v1/organizations/${owner.id}/branches/${branch.id}/profile`).set('Cookie',auth).send(branchEditInput(initial)).expect(200);
  });

});
