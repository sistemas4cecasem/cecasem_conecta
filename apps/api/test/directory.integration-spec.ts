import { type INestApplication, Logger } from '@nestjs/common';
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
  const password = randomBytes(24).toString('base64url');
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
      prisma.organizationCategory.deleteMany({ where: { organizationId: { in: organizationIds } } }),
      prisma.organization.updateMany({ where: { id: { in: organizationIds } }, data: { parentId: null } }),
      prisma.organization.deleteMany({ where: { id: { in: organizationIds } } }),
      prisma.category.deleteMany({ where: { id: { in: categoryIds } } }),
      prisma.userSession.deleteMany({ where: { userId: { in: userIds } } }),
      prisma.user.deleteMany({ where: { id: { in: userIds } } }),
    ]);
    userIds.length = 0; organizationIds.length = 0; categoryIds.length = 0;
  });
  afterAll(async () => { await app.close(); });
  async function fixture(role: UserRole = UserRole.ADMINISTRATOR) {
    const user = await users.createIdentity({ givenNames: 'QA', familyNames: randomUUID(), email: randomUUID() + '@example.test', role });
    userIds.push(user.id); await prisma.user.update({ where: { id: user.id }, data: { passwordHash } }); return user;
  }
  async function organization(actor: string, name = 'Organización', parentId?: string) {
    const row = await directory.createOrganization({ name, parentId }, actor); organizationIds.push(row.id); return row;
  }
  async function category(actor: string, name: string = randomUUID()) {
    const row = await directory.createCategory({ name }, actor); categoryIds.push(row.id); return row;
  }
  async function cookie(user: { email: string }) {
    const result = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: user.email, password }).expect(200);
    return (result.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
  }
  async function categoryFilterFixtures() {
    const actor = await fixture(); const auth = await cookie(actor);
    const categories = { x: await category(actor.id, 'RF12 Educación'), y: await category(actor.id, 'RF12 Ambiente'),
      z: await category(actor.id, 'RF12 Salud'), empty: await category(actor.id, 'RF12 Sin organizaciones') };
    async function create(name: string, categoryIds: string[]) {
      const row = await directory.createOrganization({ name, categoryIds }, actor.id); organizationIds.push(row.id); return row;
    }
    const a = await create('RF12 A', [categories.x.id, categories.y.id]);
    const b = await create('RF12 B', [categories.x.id]);
    const c = await create('RF12 C', [categories.z.id]); const d = await create('RF12 D', []);
    const inactive = await directory.organizationStatus(b.id, { isActive: false, expectedVersion: b.version }, actor.id);
    return { actor, auth, categories, organizations: { a, b: inactive, c, d } };
  }
  it.each([
    { category: 'x', status: 'all', expected: ['a', 'b'] },
    { category: 'x', status: 'active', expected: ['a'] },
    { category: 'x', status: 'inactive', expected: ['b'] },
    { category: 'y', status: 'all', expected: ['a'] },
    { category: 'z', status: 'all', expected: ['c'] },
    { category: 'empty', status: 'all', expected: [] },
    { category: undefined, status: 'all', expected: ['a', 'b', 'c', 'd'] },
    { category: undefined, status: 'active', expected: ['a', 'c', 'd'] },
    { category: undefined, status: 'inactive', expected: ['b'] },
  ] as const)('RF-12: categoría $category y estado $status, total de organizaciones sin duplicados', async input => {
    const { auth, categories, organizations } = await categoryFilterFixtures();
    const response = await request(app.getHttpServer()).get('/api/v1/organizations').set('Cookie', auth)
      .query({ status: input.status, ...(input.category ? { categoryId: categories[input.category].id } : {}) }).expect(200);
    const ids = (response.body as { items: { id: string }[] }).items.map(row => row.id);
    expect(ids).toEqual(input.expected.map(key => organizations[key].id));
    expect(response.body).toMatchObject({ total: input.expected.length, page: 1, pageSize: 25 });
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('RF-12: UUID sin categoría devuelve 200 vacío, sin lookup obligatorio', async () => {
    const { auth } = await categoryFilterFixtures();
    await request(app.getHttpServer()).get('/api/v1/organizations').set('Cookie', auth)
      .query({ categoryId: randomUUID(), status: 'all' }).expect(200)
      .expect(({ body }: { body: { items: unknown[]; total: number } }) => expect(body).toMatchObject({ items: [], total: 0 }));
  });
  it('RF-12: combina nombre, categoría inactiva y estado sin modificar asociaciones', async () => {
    const { actor, auth, categories, organizations } = await categoryFilterFixtures();
    await directory.categoryStatus(categories.x.id, { isActive: false, expectedVersion: 1 }, actor.id);
    const before = await prisma.organizationCategory.count();
    const response = await request(app.getHttpServer()).get('/api/v1/organizations').set('Cookie', auth)
      .query({ categoryId: categories.x.id, status: 'all', name: 'RF12 A' }).expect(200);
    expect(response.body).toMatchObject({ items: [{ id: organizations.a.id }], total: 1 });
    expect(await prisma.organizationCategory.count()).toBe(before);
  });
  it('RF-12: pagina organizaciones por nombre/UUID estable, no filas de la relación N:N', async () => {
    const { actor, auth, categories, organizations } = await categoryFilterFixtures();
    for (const key of ['a', 'b'] as const) {
      const row = organizations[key];
      await directory.editOrganization(row.id, { name: 'RF12 Igual', categoryIds: row.categories.map(c => c.id), expectedVersion: row.version }, actor.id);
    }
    const expected = [organizations.a.id, organizations.b.id].sort(); const selected: string[] = [];
    for (const page of [1, 2, 3, 1]) {
      const response = await request(app.getHttpServer()).get('/api/v1/organizations').set('Cookie', auth)
        .query({ categoryId: categories.x.id, status: 'all', page, pageSize: 1 }).expect(200);
      expect(response.body).toMatchObject({ total: 2, page, pageSize: 1 });
      const ids = (response.body as { items: { id: string }[] }).items.map(row => row.id);
      expect(ids).toEqual(page <= 2 ? [expected[page - 1]] : []);
      if (page <= 2 && selected.length < 2) selected.push(...ids);
    }
    expect(new Set(selected).size).toBe(2);
  });
  it.each(['', 'bad', 'null', ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222']])('RF-12: categoryId inválido %j devuelve 400', async categoryId => {
    const auth = await cookie(await fixture());
    await request(app.getHttpServer()).get('/api/v1/organizations').set('Cookie', auth).query({ categoryId }).expect(400);
  });
  it.each(Object.values(UserRole))('RF-12: %s utiliza el filtro con directory.read', async role => {
    const actor = await fixture(role); const cat = await category(actor.id); const row = await directory.createOrganization({ name: 'RF12 Permisos', categoryIds: [cat.id] }, actor.id);
    organizationIds.push(row.id); const auth = await cookie(actor);
    await request(app.getHttpServer()).get('/api/v1/organizations').set('Cookie', auth).query({ categoryId: cat.id }).expect(200)
      .expect(({ body }: { body: { items: { id: string }[]; total: number } }) => expect(body).toMatchObject({ items: [{ id: row.id }], total: 1 }));
  });
  it('RF-12: sin sesión o capability rechaza antes de consultar organizaciones', async () => {
    const list = jest.spyOn(directory, 'listOrganizations');
    await request(app.getHttpServer()).get('/api/v1/organizations').query({ categoryId: randomUUID() }).expect(401);
    const actor = await fixture();
    jest.spyOn(app.get(SessionsService), 'findIdentity').mockResolvedValue({ ...actor, role: 'UNKNOWN' as UserRole });
    await request(app.getHttpServer()).get('/api/v1/organizations').query({ categoryId: randomUUID() }).set('Cookie', 'cecasem_session=fixture').expect(403);
    expect(list).not.toHaveBeenCalled();
  });
  const routes = [
    ['get', 'organizations'], ['get', 'organizations/ID'], ['get', 'organizations/ID/children'], ['get', 'organizations/ID/history'],
    ['post', 'organizations'], ['put', 'organizations/ID'], ['patch', 'organizations/ID/status'],
    ['get', 'categories'], ['post', 'categories'], ['put', 'categories/ID'], ['patch', 'categories/ID/status'], ['get', 'categories/ID/history'],
  ] as const;
  it.each(routes)('anónimo %s %s recibe 401', async (method, path) => {
    await request(app.getHttpServer())[method]('/api/v1/' + path.replace('ID', randomUUID())).expect(401);
  });
  it.each(routes)('sin capability %s %s recibe 403 antes de operar', async (method, path) => {
    const actor = await fixture();
    jest.spyOn(app.get(SessionsService), 'findIdentity').mockResolvedValue({ ...actor, role: 'UNKNOWN' as UserRole });
    await request(app.getHttpServer())[method]('/api/v1/' + path.replace('ID', randomUUID())).set('Cookie', 'cecasem_session=fixture').expect(403);
    expect(await prisma.organization.count()).toBe(0); expect(await prisma.category.count()).toBe(0);
  });
  it.each(Object.values(UserRole))('%s opera fichas/categorías; estado solo Admin', async role => {
    const actor = await fixture(role); const auth = await cookie(actor);
    const created = await request(app.getHttpServer()).post('/api/v1/organizations').set('Cookie', auth).send({ name: '  Fundación   Inicial  ' }).expect(201);
    const org = created.body as { id: string; version: number }; organizationIds.push(org.id);
    expect(created.body).toMatchObject({ name: 'Fundación Inicial', country: null, lastVerifiedAt: null, categories: [], version: 1 });
    expect(created.body).not.toHaveProperty('normalizedName');
    const cat = await request(app.getHttpServer()).post('/api/v1/categories').set('Cookie', auth).send({ name: ' Salud  Pública ' }).expect(201);
    const catRow = cat.body as { id: string }; categoryIds.push(catRow.id);
    await request(app.getHttpServer()).put('/api/v1/categories/' + catRow.id).set('Cookie', auth).send({ name: 'Salud Institucional', expectedVersion: 1 }).expect(200);
    const edited = await request(app.getHttpServer()).put('/api/v1/organizations/' + org.id).set('Cookie', auth)
      .send({ name: 'Fundación Inicial', expectedVersion: 1, country: '  Bolivia  ', categoryIds: [catRow.id] }).expect(200);
    expect(edited.body).toMatchObject({ version: 2, country: 'Bolivia', lastVerifiedAt: null });
    for (const path of ['organizations', 'organizations/' + org.id, 'organizations/' + org.id + '/children', 'organizations/' + org.id + '/history',
      'categories', 'categories/' + catRow.id + '/history']) await request(app.getHttpServer()).get('/api/v1/' + path).set('Cookie', auth).expect(200);
    for (const [path, version] of [['organizations/' + org.id, 2], ['categories/' + catRow.id, 2]] as const) {
      await request(app.getHttpServer()).patch('/api/v1/' + path + '/status').set('Cookie', auth)
        .send({ isActive: false, expectedVersion: version }).expect(role === UserRole.ADMINISTRATOR ? 200 : 403);
    }
    expect(await prisma.organizationCategory.count({ where: { organizationId: org.id } })).toBe(1);
  });
  it.each([
    {}, { name: '' }, { name: ' '.repeat(5) }, { name: 12 }, { name: 'x'.repeat(251) }, { name: 'Ficha', country: 'x'.repeat(151) },
    { name: 'Ficha', officialWebsite: 'javascript:alert(1)' }, { name: 'Ficha', isActive: false },
    { name: 'Ficha', lastVerifiedAt: new Date().toISOString() }, { name: 'Ficha', categoryIds: null },
    { name: 'Ficha', categoryIds: ['bad'] }, { name: 'Ficha', parentId: 'bad' },
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
  it('N:N, FK, pares únicos; inactivación conserva asociaciones e historial', async () => {
    const actor = await fixture(); const row = await organization(actor.id); const a = await category(actor.id); const b = await category(actor.id);
    await directory.editOrganization(row.id, { name: row.name, categoryIds: [a.id, b.id], expectedVersion: 1 }, actor.id);
    const recorded = await directory.organizationHistory(row.id, { page: 1, pageSize: 25 });
    expect(recorded.items[0].changes[0].newReferences).toEqual(expect.arrayContaining([{id:a.id,kind:"category",label:a.name},{id:b.id,kind:"category",label:b.name}]));
    await expect(prisma.organizationCategory.create({ data: { organizationId: row.id, categoryId: a.id } })).rejects.toThrow();
    await expect(prisma.organizationCategory.create({ data: { organizationId: row.id, categoryId: randomUUID() } })).rejects.toThrow();
    await expect(prisma.organization.delete({ where: { id: row.id } })).rejects.toThrow();
    await expect(prisma.user.delete({ where: { id: actor.id } })).rejects.toThrow();
    await directory.categoryStatus(a.id, { isActive: false, expectedVersion: 1 }, actor.id);
    await directory.organizationStatus(row.id, { isActive: false, expectedVersion: 2 }, actor.id);
    expect(await prisma.organizationCategory.count()).toBe(2);
    const other = await organization(actor.id, 'Otra');
    await expect(directory.editOrganization(other.id, { name: other.name, expectedVersion: 1, categoryIds: [a.id] }, actor.id)).rejects.toMatchObject({ code: 'CATEGORY_INACTIVE' });
    await directory.editOrganization(row.id, { name: 'Corregida', expectedVersion: 3, categoryIds: [a.id, b.id] }, actor.id);
    expect((await directory.getOrganization(row.id)).categories).toHaveLength(2);
  });
  it('edición agrupa valores tipados, autor y auditoría; no modifica verificación ni creación', async () => {
    const actor = await fixture(); const row = await organization(actor.id);
    const edited = await directory.editOrganization(row.id, { name: 'Nuevo nombre', country: 'Bolivia', description: 'Descripción', expectedVersion: 1 }, actor.id);
    expect(edited.lastVerifiedAt).toBeNull(); expect(edited.createdAt).toEqual(row.createdAt); expect(edited.version).toBe(2);
    const entries = await prisma.directoryChange.findMany({ where: { organizationId: row.id } });
    expect(entries).toHaveLength(3); expect(new Set(entries.map(e => e.operationId)).size).toBe(1);
    expect(entries.find(e => e.field === 'description')).toMatchObject({ previousValue: null, newValue: 'Descripción', actorUserId: actor.id });
    expect(await prisma.auditEvent.findFirst({ where: { organizationId: row.id } })).toMatchObject({
      action: AuditAction.ORGANIZATION_UPDATED, operationId: entries[0].operationId, targetUserId: null, actorUserId: actor.id });
    await directory.editOrganization(row.id, { name: edited.name, country: edited.country, description: edited.description, expectedVersion: 2 }, actor.id);
    expect(await prisma.directoryChange.count()).toBe(3); expect((await directory.getOrganization(row.id)).version).toBe(2);
  });
  it.each(['history', 'audit'])('rollback completo de edición si falla %s', async failure => {
    const actor = await fixture(); const row = await organization(actor.id); const cat = await category(actor.id);
    if (failure === 'history') jest.spyOn(history, 'record').mockRejectedValueOnce(new Error('fixture'));
    else jest.spyOn(audit, 'recordDirectory').mockRejectedValueOnce(new Error('fixture'));
    await expect(directory.editOrganization(row.id, { name: 'No confirmar', expectedVersion: 1, categoryIds: [cat.id] }, actor.id)).rejects.toThrow();
    expect(await directory.getOrganization(row.id)).toEqual(row); expect(await prisma.directoryChange.count()).toBe(0);
    expect(await prisma.auditEvent.count()).toBe(0); expect(await prisma.organizationCategory.count()).toBe(0);
  });
  it('rollback de estado y categoría si falla auditoría, actor inactivo/rol vigente protegido', async () => {
    const actor = await fixture(); const row = await organization(actor.id); const cat = await category(actor.id);
    jest.spyOn(audit, 'recordDirectory').mockRejectedValue(new Error('fixture'));
    await expect(directory.organizationStatus(row.id, { isActive: false, expectedVersion: 1 }, actor.id)).rejects.toThrow();
    await expect(directory.editCategory(cat.id, { name: 'Otro', expectedVersion: 1 }, actor.id)).rejects.toThrow();
    expect((await directory.getOrganization(row.id)).isActive).toBe(true);
    expect(await prisma.category.findUnique({ where: { id: cat.id } })).toMatchObject({ name: cat.name, version: 1 });
    await prisma.user.update({ where: { id: actor.id }, data: { role: UserRole.RESEARCH } });
    await expect(directory.organizationStatus(row.id, { isActive: false, expectedVersion: 1 }, actor.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await prisma.user.update({ where: { id: actor.id }, data: { isActive: false, deactivatedAt: new Date() } });
    await expect(directory.editOrganization(row.id, { name: 'No', expectedVersion: 1 }, actor.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('categoría normalizada única, actualización con versión y 409 HTTP', async () => {
    const actor = await fixture(); const cat = await category(actor.id, ' Educación   Ambiental ');
    const auth = await cookie(actor);
    await request(app.getHttpServer()).post('/api/v1/categories').set('Cookie', auth).send({ name: 'EDUCACIÓN ambiental' }).expect(409);
    await directory.editCategory(cat.id, { name: 'Educación y ambiente', expectedVersion: 1 }, actor.id);
    await expect(directory.editCategory(cat.id, { name: 'Sobrescribir', expectedVersion: 1 }, actor.id)).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    expect(await prisma.directoryChange.findFirst({ where: { categoryId: cat.id } })).toMatchObject({ field: 'name', previousValue: 'Educación Ambiental', newValue: 'Educación y ambiente' });
  });
  it('self/indirect cycle, matriz ausente y sedes públicas', async () => {
    const actor = await fixture(); const a = await organization(actor.id, 'A'); const b = await organization(actor.id, 'B', a.id); const c = await organization(actor.id, 'C', b.id);
    const auth = await cookie(actor);
    for (const parentId of [a.id, c.id]) await request(app.getHttpServer()).put('/api/v1/organizations/' + a.id).set('Cookie', auth)
      .send({ name: 'A', parentId, expectedVersion: 1 }).expect(409).expect(({ body }: { body: { code: string } }) => expect(body.code).toBe('INVALID_HIERARCHY'));
    await expect(directory.editOrganization(a.id, { name: 'A', parentId: randomUUID(), expectedVersion: 1 }, actor.id)).rejects.toMatchObject({ code: 'ORGANIZATION_NOT_FOUND' });
    expect((await directory.children(a.id, { page: 1, pageSize: 25, status: 'all' })).items.map(r => r.id)).toEqual([b.id]);
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
  it('matrices concurrentes A→B/B→A no forman ciclo con barrera determinista', async () => {
    const actor = await fixture(); const a = await organization(actor.id, 'A'); const b = await organization(actor.id, 'B');
    const entered = barrier(); const release = barrier(); const queued = barrier(); let calls = 0;
    const original = directory.lockHierarchy.bind(directory);
    jest.spyOn(directory, 'lockHierarchy').mockImplementation(async tx => {
      const order = ++calls; if (order === 2) queued.release();
      await original(tx); if (order === 1) { entered.release(); await release.promise; }
    });
    const first = directory.editOrganization(a.id, { name: 'A', parentId: b.id, expectedVersion: 1 }, actor.id);
    await entered.promise;
    const second = directory.editOrganization(b.id, { name: 'B', parentId: a.id, expectedVersion: 1 }, actor.id);
    await queued.promise; release.release();
    expect((await Promise.allSettled([first, second]))[1]).toMatchObject({ status: 'rejected', reason: { code: 'INVALID_HIERARCHY' } });
    expect((await directory.getOrganization(a.id)).parentId).toBe(b.id); expect((await directory.getOrganization(b.id)).parentId).toBeNull();
  });
  it('SQL protege nombres, versión, parent FK y self, historial tipado/target', async () => {
    const actor = await fixture(); const row = await organization(actor.id);
    for (const data of [{ name: '   ' }, { version: 0 }, { parentId: row.id }, { parentId: randomUUID() }]) {
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
  it.each([AuditAction.ORGANIZATION_UPDATED, AuditAction.ORGANIZATION_STATUS_CHANGED, AuditAction.CATEGORY_UPDATED, AuditAction.CATEGORY_STATUS_CHANGED])('SQL auditoría %s exige subject real, actor y operación', async action => {
    const actor = await fixture(); const row = await organization(actor.id); const cat = await category(actor.id);
    const target = action.startsWith('ORGANIZATION') ? { organizationId: row.id } : { categoryId: cat.id };
    const data = { action, ...target, actorUserId: actor.id, operationId: randomUUID() };
    await prisma.auditEvent.create({ data });
    for (const invalid of [{ ...data, actorUserId: null }, { ...data, operationId: null }, { ...data, targetUserId: actor.id },
      { ...data, previousRole: UserRole.BOARD }, { ...data, organizationId: row.id, categoryId: cat.id }]) {
      await expect(prisma.auditEvent.create({ data: invalid })).rejects.toThrow();
    }
    await expect(prisma.auditEvent.create({ data: { action: AuditAction.USER_DEACTIVATED, actorUserId: actor.id } })).rejects.toThrow();
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
});
