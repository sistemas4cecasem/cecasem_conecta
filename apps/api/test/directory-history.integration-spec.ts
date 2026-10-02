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
import { ContactCondition, ContactType, Prisma, UserRole } from '../src/generated/prisma/client';
import { UsersService } from '../src/modules/users/users.service';
import { PasswordService } from '../src/modules/auth/password.service';
import { SessionsService } from '../src/modules/auth/sessions.service';
import { DirectoryService } from '../src/modules/directory/directory.service';
import { PeopleService } from '../src/modules/directory/people.service';
import { ContactsService } from '../src/modules/directory/contacts.service';
import { DirectoryHistoryService } from '../src/modules/directory/directory-history.service';
import { AuditService } from '../src/modules/audit/audit.service';

const databaseUrl = validateDatabaseUrl(process.env.DATABASE_URL);
if (!new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('Historial requiere una base aislada _test.');
type HistoryPage = Omit<Awaited<ReturnType<DirectoryHistoryService['list']>>, 'items'> & {
  items: Array<Omit<Awaited<ReturnType<DirectoryHistoryService['list']>>['items'][number], 'createdAt'> & { createdAt: string }>;
};
const prefixes = ['organizations', 'categories', 'people', 'person-organization-relations', 'contact-methods', 'person-contacts', 'organization-contacts'];
describe('Historial de fichas PostgreSQL y HTTP', () => {
  let app: INestApplication<Server>, prisma: PrismaService, users: UsersService, directory: DirectoryService, people: PeopleService,
    contacts: ContactsService, history: DirectoryHistoryService, passwordHash: string;
  const password = randomBytes(24).toString('base64url');
  const userIds: string[] = [], organizationIds: string[] = [], personIds: string[] = [], categoryIds: string[] = [], methodIds: string[] = [];
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ConfigService)
      .useValue(new ConfigService(validateEnvironment({ NODE_ENV: 'test', DATABASE_URL: databaseUrl }))).compile();
    app = moduleRef.createNestApplication<INestApplication<Server>>(); configureApplication(app); await app.init();
    prisma = app.get(PrismaService); users = app.get(UsersService); directory = app.get(DirectoryService); people = app.get(PeopleService);
    contacts = app.get(ContactsService); history = app.get(DirectoryHistoryService); passwordHash = await app.get(PasswordService).hashNew(password);
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await prisma.$transaction([
      prisma.auditEvent.deleteMany({ where: { OR: [{ actorUserId: { in: userIds } }, { targetUserId: { in: userIds } }] } }),
      prisma.directoryChange.deleteMany({ where: { actorUserId: { in: userIds } } }),
      prisma.personContact.deleteMany({ where: { personId: { in: personIds } } }),
      prisma.organizationContact.deleteMany({ where: { organizationId: { in: organizationIds } } }),
      prisma.personOrganizationRelation.deleteMany({ where: { personId: { in: personIds } } }),
      prisma.contactMethod.deleteMany({ where: { id: { in: methodIds } } }),
      prisma.person.deleteMany({ where: { id: { in: personIds } } }),
      prisma.organizationCategory.deleteMany({ where: { organizationId: { in: organizationIds } } }),
      prisma.organization.deleteMany({ where: { id: { in: organizationIds } } }),
      prisma.category.deleteMany({ where: { id: { in: categoryIds } } }),
      prisma.userSession.deleteMany({ where: { userId: { in: userIds } } }), prisma.user.deleteMany({ where: { id: { in: userIds } } }),
    ]);
    userIds.length = organizationIds.length = personIds.length = categoryIds.length = methodIds.length = 0;
  });
  afterAll(async () => { await app.close(); });
  async function user(role: UserRole = UserRole.ADMINISTRATOR) {
    const row = await users.createIdentity({ givenNames: 'Autora', familyNames: 'QA Historial', email: randomUUID() + '@example.test', role });
    userIds.push(row.id); await prisma.user.update({ where: { id: row.id }, data: { passwordHash } }); return row;
  }
  async function cookie(actor: { email: string }) {
    const result = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: actor.email, password }).expect(200);
    return (result.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
  }
  async function organization(actor: string, name = 'Institución histórica') {
    const row = await directory.createOrganization({ name }, actor); organizationIds.push(row.id); return row;
  }
  async function person(actor: string) { const row = await people.create({ displayName: 'María histórica' }, actor); personIds.push(row.id); return row; }
  async function category(actor: string) { const row = await directory.createCategory({ name: 'Derechos Humanos' }, actor); categoryIds.push(row.id); return row; }
  async function medium(actor: string) { const row = await contacts.create({ type: ContactType.EMAIL, value: randomUUID() + '@example.test' }, actor); methodIds.push(row.id); return row; }
  async function targets(actor: string) {
    const org = await organization(actor), p = await person(actor), cat = await category(actor), m = await medium(actor);
    const relation = await people.createRelation(p.id, { organizationId: org.id, isCurrent: true, positionTitle: 'Coordinadora' }, actor);
    const pc = await contacts.associate({ personId: p.id }, m.id, { expectedMethodVersion: 1, sourceDescription: 'Fuente personal' }, actor);
    const oc = await contacts.associate({ organizationId: org.id }, m.id, { expectedMethodVersion: 2, sourceDescription: 'Fuente institucional' }, actor);
    return { org, p, cat, m, relation, pc: pc.association, oc: oc.association,
      paths: [org.id, cat.id, p.id, relation.id, m.id, pc.association.id, oc.association.id].map((id, index) => prefixes[index] + '/' + id + '/history') };
  }
  async function read(path: string, auth: string) {
    return (await request(app.getHttpServer()).get('/api/v1/' + path).set('Cookie', auth).expect(200)).body as HistoryPage;
  }
  it.each(prefixes)('anónimo en %s/history recibe 401', async prefix => {
    await request(app.getHttpServer()).get('/api/v1/' + prefix + '/' + randomUUID() + '/history').expect(401);
  });
  it.each(prefixes)('sin capability en %s/history recibe 403', async prefix => {
    const actor = await user(); jest.spyOn(app.get(SessionsService), 'findIdentity').mockResolvedValue({ ...actor, role: 'UNKNOWN' as UserRole });
    await request(app.getHttpServer()).get('/api/v1/' + prefix + '/' + randomUUID() + '/history').set('Cookie', 'cecasem_session=fixture').expect(403);
  });
  it.each(Object.values(UserRole))('%s puede leer los siete tipos con la proyección pública de autoría', async role => {
    const actor = await user(role), auth = await cookie(actor), rows = await targets(actor.id);
    for (const path of rows.paths) {
      const response = await request(app.getHttpServer()).get('/api/v1/' + path).set('Cookie', auth).expect(200);
      expect(response.headers['cache-control']).toBe('no-store');
      for (const operation of (response.body as HistoryPage).items) {
        expect(Object.keys(operation.actor).sort()).toEqual(['familyNames', 'givenNames', 'id', 'isActive']);
        expect(operation).not.toHaveProperty('referenceSnapshot'); expect(operation).not.toHaveProperty('actorUserId');
      }
    }
    if (role === UserRole.RESEARCH || role === UserRole.PLANNING) await request(app.getHttpServer()).get('/api/v1/users').set('Cookie', auth).expect(403);
  });
  it.each(prefixes)('UUID, objeto ausente y consulta inválida se validan en %s', async prefix => {
    const auth = await cookie(await user());
    await request(app.getHttpServer()).get('/api/v1/' + prefix + '/invalid/history').set('Cookie', auth).expect(400);
    await request(app.getHttpServer()).get('/api/v1/' + prefix + '/' + randomUUID() + '/history').set('Cookie', auth).expect(404);
    for (const query of ['page=0', 'pageSize=101', 'unexpected=1'])
      await request(app.getHttpServer()).get('/api/v1/' + prefix + '/' + randomUUID() + '/history?' + query).set('Cookie', auth).expect(400);
  });
  it('RF-23 conserva varios valores antes/después, fecha, autora y una operación', async () => {
    const actor = await user(), org = await organization(actor.id), auth = await cookie(actor);
    await directory.editOrganization(org.id, { name: org.name, country: 'Perú', description: 'Descripción nueva', expectedVersion: 1 }, actor.id);
    const result = await read('organizations/' + org.id + '/history?pageSize=1', auth);
    expect(result.total).toBe(1); expect(result.items).toHaveLength(1); const operation = result.items[0];
    expect(operation.actor).toMatchObject({ id: actor.id, givenNames: actor.givenNames, familyNames: actor.familyNames });
    expect(Number.isFinite(Date.parse(operation.createdAt))).toBe(true); expect(operation.objectType).toBe('ORGANIZATION');
    expect(operation.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'country', label: 'País', previousValue: null, newValue: 'Perú' }),
      expect.objectContaining({ field: 'description', label: 'Descripción', previousValue: null, newValue: 'Descripción nueva' }),
    ]));
    expect((await prisma.directoryChange.findMany({ where: { organizationId: org.id } })).every(row => row.operationId === operation.operationId)).toBe(true);
  });
  it('la paginación cuenta operaciones completas, con fecha y UUID como desempate determinista', async () => {
    const actor = await user(), org = await organization(actor.id);
    const first = '00000000-0000-4000-8000-000000000001', second = '00000000-0000-4000-8000-000000000002', newest = randomUUID();
    const data = [first, second].flatMap(operationId => ['country', 'description'].map(field => ({ organizationId: org.id, actorUserId: actor.id,
      operationId, field, previousValue: Prisma.JsonNull, newValue: field, createdAt: new Date('2025-01-01T00:00:00Z') })));
    await prisma.directoryChange.createMany({ data: [...data, { ...data[0], operationId: newest, createdAt: new Date('2025-02-01T00:00:00Z') }] });
    const ids: string[] = [];
    for (let page = 1; page <= 3; page++) {
      const result = await directory.organizationHistory(org.id, { page, pageSize: 1 });
      expect(result.total).toBe(3); expect(result.items).toHaveLength(1); ids.push(result.items[0].operationId);
      expect(result.items[0].changes).toHaveLength(page === 1 ? 1 : 2);
    }
    expect(ids).toEqual([newest, second, first]);
    expect((await directory.organizationHistory(org.id, { page: 4, pageSize: 1 }))).toMatchObject({ total: 3, items: [] });
  });
  it('renombrar categoría y matriz no reescribe etiquetas históricas; retirar categorías es semántico', async () => {
    const actor = await user(), org = await organization(actor.id), parent = await organization(actor.id, 'Matriz histórica'), cat = await category(actor.id);
    await directory.editOrganization(org.id, { name: org.name, parentId: parent.id, categoryIds: [cat.id], expectedVersion: 1 }, actor.id);
    const before = await prisma.directoryChange.findMany({ where: { organizationId: org.id }, orderBy: { field: 'asc' } });
    await directory.editCategory(cat.id, { name: 'Derechos y Ciudadanía', expectedVersion: 1 }, actor.id);
    await directory.editOrganization(parent.id, { name: 'Matriz renombrada', expectedVersion: 1 }, actor.id);
    const result = await directory.organizationHistory(org.id, { page: 1, pageSize: 25 });
    expect(result.items[0].changes.find(change => change.field === 'parentId')?.newReferences).toEqual([{ id: parent.id, kind: 'organization', label: 'Matriz histórica' }]);
    expect(result.items[0].changes.find(change => change.field === 'categoryIds')?.added).toEqual([{ id: cat.id, kind: 'category', label: 'Derechos Humanos' }]);
    expect(await prisma.directoryChange.findMany({ where: { organizationId: org.id }, orderBy: { field: 'asc' } })).toEqual(before);
    await directory.editOrganization(org.id, { name: org.name, expectedVersion: 2 }, actor.id);
    const removal = await directory.organizationHistory(org.id, { page: 1, pageSize: 25 });
    expect(removal.items[0].changes.find(change => change.field === 'categoryIds')?.removed).toEqual([{ id: cat.id, kind: 'category', label: 'Derechos y Ciudadanía' }]);
  });
  it('las relaciones iniciales al crear una ficha ya tienen etiquetas históricas', async () => {
    const actor = await user(), parent = await organization(actor.id), cat = await category(actor.id);
    const org = await directory.createOrganization({ name: 'Sede inicial', parentId: parent.id, categoryIds: [cat.id] }, actor.id); organizationIds.push(org.id);
    const result = await directory.organizationHistory(org.id, { page: 1, pageSize: 25 });
    expect(result.total).toBe(1); expect(result.items[0].changes.map(change => change.field)).toEqual(['categoryIds', 'parentId']);
  });
  it('vínculo y asociaciones conservan actores y canal observados al registrar, después de correcciones', async () => {
    const actor = await user(), rows = await targets(actor.id);
    await people.editRelation(rows.relation.id, { isCurrent: true, positionTitle: 'Directora', expectedVersion: 1 }, actor.id);
    await contacts.editContext('person', rows.pc.id, { sourceDescription: 'Documento nuevo', expectedVersion: 1 }, actor.id);
    await people.edit(rows.p.id, { displayName: 'Persona renombrada', expectedVersion: 1 }, actor.id);
    await directory.editOrganization(rows.org.id, { name: 'Organización renombrada', expectedVersion: 1 }, actor.id);
    await contacts.correct(rows.m.id, { value: randomUUID() + '@example.test', confirmShared: true, expectedVersion: 3 }, actor.id);
    const relation = await people.relationHistory(rows.relation.id, { page: 1, pageSize: 25 });
    expect(relation.items[0].relatedReferences.map(ref => ref.label)).toEqual(['María histórica', 'Institución histórica']);
    expect(relation.items[0].changes).toContainEqual(expect.objectContaining({ field: 'positionTitle', previousValue: 'Coordinadora', newValue: 'Directora' }));
    const association = await contacts.associationHistory('person', rows.pc.id, { page: 1, pageSize: 25 });
    expect(association.items[0].relatedReferences.map(ref => ref.label)).toEqual(['María histórica', rows.m.value]);
  });
  it('historia previa sin snapshot conserva datos, pero jamás inventa etiquetas después de renombrar', async () => {
    const actor = await user(), org = await organization(actor.id), cat = await category(actor.id);
    await prisma.directoryChange.create({ data: { organizationId: org.id, actorUserId: actor.id, operationId: randomUUID(), field: 'categoryIds', previousValue: [], newValue: [cat.id] } });
    await directory.editCategory(cat.id, { name: 'Nombre actual', expectedVersion: 1 }, actor.id);
    const result = await directory.organizationHistory(org.id, { page: 1, pageSize: 25 });
    expect(result.items[0]).toMatchObject({ contextRecorded: false, relatedReferences: [] });
    expect(result.items[0].changes[0]).toMatchObject({ newValue: [cat.id], newReferences: [{ id: cat.id, kind: 'category', label: null }] });
  });
  it('RF-24 conserva autora desactivada, FK y entradas; lector sin users.read puede identificarlas', async () => {
    const author = await user(UserRole.BOARD), administrator = await user(), reader = await user(UserRole.RESEARCH), org = await organization(author.id);
    await directory.editOrganization(org.id, { name: org.name, country: 'Bolivia', expectedVersion: 1 }, author.id);
    const before = await prisma.directoryChange.findMany({ where: { organizationId: org.id } });
    const administratorCookie = await cookie(administrator), authorCookie = await cookie(author), readerCookie = await cookie(reader);
    await request(app.getHttpServer()).post('/api/v1/users/' + author.id + '/deactivate').set('Cookie', administratorCookie).expect(204);
    const result = await read('organizations/' + org.id + '/history', readerCookie);
    expect(result.items[0].actor).toEqual({ id: author.id, givenNames: author.givenNames, familyNames: author.familyNames, isActive: false });
    expect(await prisma.directoryChange.findMany({ where: { organizationId: org.id } })).toEqual(before);
    await request(app.getHttpServer()).get('/api/v1/users').set('Cookie', readerCookie).expect(403);
    await request(app.getHttpServer()).get('/api/v1/organizations/' + org.id + '/history').set('Cookie', authorCookie).expect(401);
    await expect(prisma.user.delete({ where: { id: author.id } })).rejects.toThrow();
    expect((await users.findIdentityById(author.id))?.isActive).toBe(false);
    await expect(prisma.directoryChange.create({ data: { organizationId: org.id, actorUserId: randomUUID(), operationId: randomUUID(), field: 'country', previousValue: Prisma.JsonNull, newValue: 'Perú' } })).rejects.toThrow();
  });
  it('estado lógico no oculta historial de los siete tipos', async () => {
    const actor = await user(), rows = await targets(actor.id), auth = await cookie(actor);
    await directory.organizationStatus(rows.org.id, { isActive: false, expectedVersion: 1 }, actor.id);
    await directory.categoryStatus(rows.cat.id, { isActive: false, expectedVersion: 1 }, actor.id);
    await people.status(rows.p.id, { isActive: false, expectedVersion: 1 }, actor.id);
    await people.endRelation(rows.relation.id, { expectedVersion: 1 }, actor.id);
    await contacts.condition(rows.m.id, { condition: ContactCondition.UNUSABLE, expectedVersion: 3 }, actor.id);
    await contacts.end('person', rows.pc.id, { expectedVersion: 1 }, actor.id); await contacts.end('organization', rows.oc.id, { expectedVersion: 1 }, actor.id);
    for (const path of rows.paths) expect((await read(path, auth)).total).toBeGreaterThan(0);
  });
  it('no-op coherente para fichas, vínculos, canales y asociaciones no fabrica historial', async () => {
    const actor = await user(), rows = await targets(actor.id), count = await prisma.directoryChange.count();
    await directory.editOrganization(rows.org.id, { name: rows.org.name, expectedVersion: 1 }, actor.id);
    await directory.editCategory(rows.cat.id, { name: rows.cat.name, expectedVersion: 1 }, actor.id);
    await people.edit(rows.p.id, { displayName: rows.p.displayName, expectedVersion: 1 }, actor.id);
    await people.editRelation(rows.relation.id, { isCurrent: true, positionTitle: 'Coordinadora', expectedVersion: 1 }, actor.id);
    await contacts.correct(rows.m.id, { value: rows.m.value, expectedVersion: 3, confirmShared: true }, actor.id);
    await contacts.editContext('person', rows.pc.id, { sourceDescription: 'Fuente personal', expectedVersion: 1 }, actor.id);
    await contacts.associate({ personId: rows.p.id }, rows.m.id, { expectedMethodVersion: 1, sourceDescription: 'No reemplazar' }, actor.id);
    expect(await prisma.directoryChange.count()).toBe(count);
  });
  it('sustitución agrupa altas/finalización en una operación, sin repetir historial del destino existente', async () => {
    const actor = await user(), rows = await targets(actor.id), next = await medium(actor.id);
    const result = await contacts.replace('person', rows.pc.id, { contactMethodId: next.id, expectedMethodVersion: 1, expectedVersion: 1, confirmed: true, sourceDescription: 'Canal nuevo' }, actor.id);
    const oldHistory = await contacts.associationHistory('person', rows.pc.id, { page: 1, pageSize: 25 });
    const newHistory = await contacts.associationHistory('person', result.association.id, { page: 1, pageSize: 25 });
    expect(oldHistory.items[0].operationId).toBe(newHistory.items[0].operationId);
    expect(oldHistory.items[0].replacement).toEqual({ previous: { id: rows.m.id, kind: 'contactMethod', label: rows.m.value }, next: { id: next.id, kind: 'contactMethod', label: next.value } });
    const destination = await contacts.associate({ organizationId: rows.org.id }, next.id, { expectedMethodVersion: (await contacts.get(next.id)).version }, actor.id);
    const destinationBefore = await contacts.associationHistory('organization', destination.association.id, { page: 1, pageSize: 25 });
    const reused = await contacts.replace('organization', rows.oc.id, { contactMethodId: next.id, expectedMethodVersion: (await contacts.get(next.id)).version, expectedVersion: 1, confirmed: true }, actor.id);
    expect(reused.association.id).toBe(destination.association.id);
    expect(await contacts.associationHistory('organization', destination.association.id, { page: 1, pageSize: 25 })).toEqual(destinationBefore);
    expect((await contacts.associationHistory('organization', rows.oc.id, { page: 1, pageSize: 25 })).items[0].replacement?.next.label).toBe(next.value);
    expect((await contacts.associationHistory('person', result.association.id, { page: 1, pageSize: 25 })).total).toBe(newHistory.total);
  });
  it.each(['organization', 'relation', 'shared', 'association', 'replacement'])('rollback conserva ficha y snapshots si falla auditoría después de %s', async kind => {
    const actor = await user(), rows = await targets(actor.id), next = await medium(actor.id);
    const before = await prisma.directoryChange.findMany({ where: { actorUserId: actor.id }, orderBy: { id: 'asc' } });
    jest.spyOn(app.get(AuditService), 'recordDirectory').mockRejectedValueOnce(new Error('fixture'));
    const action = kind === 'organization' ? directory.editOrganization(rows.org.id, { name: 'No confirmar', expectedVersion: 1 }, actor.id)
      : kind === 'relation' ? people.editRelation(rows.relation.id, { isCurrent: true, positionTitle: 'No confirmar', expectedVersion: 1 }, actor.id)
      : kind === 'shared' ? contacts.correct(rows.m.id, { value: randomUUID() + '@example.test', confirmShared: true, expectedVersion: 3 }, actor.id)
      : kind === 'association' ? contacts.editContext('person', rows.pc.id, { notes: 'No confirmar', expectedVersion: 1 }, actor.id)
      : contacts.replace('person', rows.pc.id, { contactMethodId: next.id, expectedMethodVersion: 1, expectedVersion: 1, confirmed: true }, actor.id);
    await expect(action).rejects.toThrow(); expect(await prisma.directoryChange.findMany({ where: { actorUserId: actor.id }, orderBy: { id: 'asc' } })).toEqual(before);
    expect((await directory.getOrganization(rows.org.id)).name).toBe(rows.org.name); expect((await people.getRelation(rows.relation.id)).positionTitle).toBe('Coordinadora');
    expect((await contacts.get(rows.m.id)).value).toBe(rows.m.value); expect((await contacts.getAssociation('person', rows.pc.id)).isActive).toBe(true);
    expect((await contacts.listMethod(next.id, 'person', { page: 1, pageSize: 25 })).total).toBe(0);
  });
  it('fallo de historial revierte altas de vínculo y relaciones iniciales de organización', async () => {
    const actor = await user(), p = await person(actor.id), org = await organization(actor.id);
    jest.spyOn(history, 'record').mockRejectedValueOnce(new Error('fixture'));
    await expect(people.createRelation(p.id, { organizationId: org.id, isCurrent: true }, actor.id)).rejects.toThrow();
    expect(await prisma.personOrganizationRelation.count({ where: { personId: p.id } })).toBe(0);
    jest.spyOn(history, 'record').mockRejectedValueOnce(new Error('fixture'));
    await expect(directory.createOrganization({ name: 'Sede sin confirmar', parentId: org.id }, actor.id)).rejects.toThrow();
    expect(await prisma.organization.count({ where: { name: 'Sede sin confirmar' } })).toBe(0);
  });
  it('constraint rechaza snapshots mal formados y los endpoints no permiten editar/borrar historial', async () => {
    const actor = await user(), rows = await targets(actor.id), auth = await cookie(actor);
    await expect(prisma.directoryChange.create({ data: { organizationId: rows.org.id, actorUserId: actor.id, operationId: randomUUID(), field: 'country', previousValue: Prisma.JsonNull, newValue: 'Perú', referenceSnapshot: { previous: 'invalid', next: [], related: [] } } })).rejects.toThrow();
    for (const path of rows.paths) {
      await request(app.getHttpServer()).put('/api/v1/' + path).set('Cookie', auth).send({}).expect(404);
      await request(app.getHttpServer()).delete('/api/v1/' + path).set('Cookie', auth).expect(404);
    }
  });
});
