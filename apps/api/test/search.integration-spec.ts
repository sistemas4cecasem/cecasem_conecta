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
import { ContactType, UserRole } from '../src/generated/prisma/client';
import { UsersService } from '../src/modules/users/users.service';
import { PasswordService } from '../src/modules/auth/password.service';
import { SessionsService } from '../src/modules/auth/sessions.service';
import { DirectoryService } from '../src/modules/directory/directory.service';
import { DirectorySearchService } from '../src/modules/directory/directory-search.service';
import { PeopleService } from '../src/modules/directory/people.service';
import { ContactsService } from '../src/modules/directory/contacts.service';
import { DuplicateDetectionService } from '../src/modules/directory/duplicate-detection.service';
import { ConsolidationService } from '../src/modules/directory/consolidation.service';
import type { SearchQueryDto } from '../src/modules/search/search.dto';
import type { SearchService } from '../src/modules/search/search.service';
import { RelationshipProcessesService } from '../src/modules/relationships/relationship-processes.service';
import { RelationshipSearchService } from '../src/modules/relationships/relationship-search.service';
import { CommunicationsService } from '../src/modules/communications/communications.service';
import { CommunicationAmendmentsService } from '../src/modules/communications/communication-amendments.service';
import { CommunicationSearchService } from '../src/modules/communications/communication-search.service';
import * as authorization from '../src/modules/auth/authorization/role-permissions';
import { Client } from 'pg';
type SearchResponse = Awaited<ReturnType<SearchService['search']>>;

const databaseUrl = validateDatabaseUrl(process.env.DATABASE_URL);
if (!new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('Búsqueda requiere una base aislada _test.');
describe('Búsqueda del directorio PostgreSQL/HTTP', () => {
  let app: INestApplication<Server>, prisma: PrismaService, users: UsersService, directory: DirectoryService,
    people: PeopleService, contacts: ContactsService, queries: DirectorySearchService, hash: string;
  const password = randomBytes(24).toString('base64url');
  const userIds: string[] = [], orgIds: string[] = [], personIds: string[] = [], methodIds: string[] = [], accountIds: string[] = [];
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ConfigService)
      .useValue(new ConfigService(validateEnvironment({ NODE_ENV: 'test', DATABASE_URL: databaseUrl }))).compile();
    app = module.createNestApplication<INestApplication<Server>>(); configureApplication(app); await app.init();
    prisma = app.get(PrismaService); users = app.get(UsersService); directory = app.get(DirectoryService); people = app.get(PeopleService);
    contacts = app.get(ContactsService); queries = app.get(DirectorySearchService); hash = await app.get(PasswordService).hashNew(password);
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    const pairs = { OR: [{ organizationAId: { in: orgIds } }, { organizationBId: { in: orgIds } }, { personAId: { in: personIds } }, { personBId: { in: personIds } }] };
    const candidates = await prisma.duplicateCandidate.findMany({ where: pairs, select: { id: true } });
    await prisma.$transaction([
      prisma.duplicateReconciliation.deleteMany({ where: { candidateId: { in: candidates.map(row => row.id) } } }),
      prisma.verification.deleteMany({ where: { actorUserId: { in: userIds } } }),
      prisma.auditEvent.deleteMany({ where: { actorUserId: { in: userIds } } }),
      prisma.communicationAmendment.deleteMany({ where: { communication: { registeredByUserId: { in: userIds } } } }),
      prisma.communicationRecipient.deleteMany({ where: { communication: { registeredByUserId: { in: userIds } } } }),
      prisma.communication.deleteMany({ where: { registeredByUserId: { in: userIds } } }),
      prisma.relationshipProcessEvent.deleteMany({ where: { process: { createdByUserId: { in: userIds } } } }),
      prisma.processParticipant.deleteMany({ where: { process: { createdByUserId: { in: userIds } } } }),
      prisma.relationshipProcess.deleteMany({ where: { createdByUserId: { in: userIds } } }),
      prisma.directoryChange.deleteMany({ where: { actorUserId: { in: userIds } } }),
      prisma.duplicateCandidate.deleteMany({ where: pairs }),
      prisma.personContact.deleteMany({ where: { personId: { in: personIds } } }),
      prisma.organizationContact.deleteMany({ where: { organizationId: { in: orgIds } } }),
      prisma.personOrganizationRelation.deleteMany({ where: { personId: { in: personIds } } }),
      prisma.contactMethod.deleteMany({ where: { id: { in: methodIds } } }),
      prisma.person.updateMany({ where: { id: { in: personIds } }, data: { duplicateOfId: null } }),
      prisma.person.deleteMany({ where: { id: { in: personIds } } }),
      prisma.organization.updateMany({ where: { id: { in: orgIds } }, data: { duplicateOfId: null, parentId: null } }),
      prisma.organization.deleteMany({ where: { id: { in: orgIds } } }),
      prisma.userSession.deleteMany({ where: { userId: { in: userIds } } }),
      prisma.userEmailAccount.deleteMany({ where: { userId: { in: userIds } } }),
      prisma.emailAccount.deleteMany({ where: { id: { in: accountIds } } }),
      prisma.user.deleteMany({ where: { id: { in: userIds } } }),
    ]); userIds.length = orgIds.length = personIds.length = methodIds.length = accountIds.length = 0;
  });
  afterAll(async () => { await app.close(); });
  async function user(role: UserRole = UserRole.ADMINISTRATOR) {
    const row = await users.createIdentity({ givenNames: 'QA', familyNames: 'Búsqueda', role, email: randomUUID() + '@example.test' });
    userIds.push(row.id); await prisma.user.update({ where: { id: row.id }, data: { passwordHash: hash } });
    const response = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: row.email, password }).expect(200);
    return { ...row, cookie: (response.headers['set-cookie'] as unknown as string[])[0].split(';')[0] };
  }
  async function org(actor: string, name = 'Fundación Esperanza', alias?: string, parentId?: string) {
    const row = await directory.createOrganization({ name, alias, parentId }, actor); orgIds.push(row.id); return row;
  }
  async function person(actor: string, displayName = 'María Fernanda Pérez', givenNames?: string, familyNames?: string) {
    const row = await people.create({ displayName, givenNames, familyNames }, actor); personIds.push(row.id); return row;
  }
  async function email(actor: string) {
    const row = await contacts.create({ type: ContactType.EMAIL, value: 'qa.' + randomUUID() + '@example.test' }, actor); methodIds.push(row.id); return row;
  }
  function query(q: string, overrides: Partial<SearchQueryDto> = {}): SearchQueryDto { return { q, page: 1, pageSize: 25, includeInactive: false, ...overrides }; }
  function http(cookie: string, values: object) { return request(app.getHttpServer()).get('/api/v1/search').set('Cookie', cookie).query(values); }
  async function process(actorId: string, purpose = 'Cooperación búsqueda global', personal = false) {
    const target = personal ? { personId: (await person(actorId)).id } : { organizationId: (await org(actorId)).id };
    return app.get(RelationshipProcessesService).create({ ...target, purpose }, actorId);
  }
  async function incoming(processId: string, actorId: string, address = 'Historico+Red@Example.test', date = '2025-01-01T12:00:00.000Z', cc: string[] = []) {
    return app.get(CommunicationsService).registerReceived(processId, { sender: address, to: ['cecasem@example.test'], cc, bcc: [],
      subject: 'Antecedente búsqueda', body: 'Original privado que no debe salir en búsqueda', receivedAt: date }, actorId, randomUUID());
  }
  it('requiere sesión', async () => { await request(app.getHttpServer()).get('/api/v1/search?q=esperanza').expect(401); });
  it('rechaza identidad sin directory.read antes de consultar datos', async () => {
    const actor = await user();
    jest.spyOn(app.get(SessionsService), 'findIdentity').mockResolvedValue({ ...actor, role: 'UNKNOWN' } as never);
    await http(actor.cookie, { q: 'esperanza' }).expect(403);
  });
  it.each(Object.values(UserRole))('%s puede buscar sin ampliar permisos administrativos', async role => {
    const actor = await user(role); const row = await org(actor.id);
    const response = await http(actor.cookie, { q: 'esperanza' }).expect(200);
    const body = response.body as SearchResponse;
    expect(response.headers['cache-control']).toBe('no-store'); expect(body.organizations.items[0].id).toBe(row.id);
    if (role !== UserRole.ADMINISTRATOR) {
      await request(app.getHttpServer()).put('/api/v1/settings/verification').set('Cookie', actor.cookie).send({}).expect(403);
      await request(app.getHttpServer()).post('/api/v1/duplicate-candidates/' + randomUUID() + '/consolidate').set('Cookie', actor.cookie).send({}).expect(403);
    }
  });
  it.each([{}, { q: '' }, { q: 'a' }, { q: '--' }, { q: 'a@' }, { q: 'x'.repeat(255) }, { q: ['maria', 'perez'] },
    { q: 'maria', page: 0 }, { q: 'maria', page: 1.5 }, { q: 'maria', pageSize: 51 }, { q: 'maria', includeInactive: 'yes' }, { q: 'maria', unknown: 'x' }])('rechaza consulta inválida %j', async values => {
    const actor = await user(); await http(actor.cookie, values).expect(400);
  });
  it('encuentra nombres, prefijos y siglas sin distinguir acentos/mayúsculas', async () => {
    const actor = await user(), row = await org(actor.id, 'Fundación Esperanza', 'FE Bolivia');
    for (const q of ['FUNDACION ESPERANZA', 'fundacion', 'ESPERANZA', 'fe bolivia']) {
      const response = await http(actor.cookie, { q }).expect(200); expect((response.body as SearchResponse).organizations.items.map(item => item.id)).toContain(row.id);
    }
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: row.id } })).name).toBe('Fundación Esperanza');
  });
  it('busca tokens personales separados en presentación y nombres/apellidos', async () => {
    const actor = await user(), a = await person(actor.id), b = await person(actor.id, 'M. F. Pérez', 'María Fernanda', 'Pérez');
    for (const q of ['maria perez', 'MARÍA PÉREZ']) expect((await queries.searchPeople(query(q))).items.map(row => row.id)).toEqual(expect.arrayContaining([a.id, b.id]));
    expect((await queries.searchPeople(query('María Fernanda Pérez'))).items.map(row => row.id)).toEqual(expect.arrayContaining([a.id, b.id]));
  });
  it('prioriza exacto, prefijo y parcial con desempate estable y sin duplicados entre páginas', async () => {
    const actor = await user();
    const partial = await org(actor.id, 'Fundación Esperanza'), prefix = await org(actor.id, 'Esperanza Bolivia'), exact = await org(actor.id, 'Esperanza');
    const other = await org(actor.id, 'Esperanza Bolivia');
    const first = await queries.searchOrganizations(query('esperanza', { pageSize: 2 }));
    const second = await queries.searchOrganizations(query('esperanza', { page: 2, pageSize: 2 }));
    expect(first.items[0].id).toBe(exact.id); expect(second.items[1].id).toBe(partial.id); expect(first.total).toBe(4);
    expect([...first.items, ...second.items].map(row => row.id)).toEqual([exact.id, ...[prefix.id, other.id].sort(), partial.id]);
    expect(await queries.searchOrganizations(query('esperanza', { pageSize: 2 }))).toEqual(first);
    expect(await queries.searchOrganizations(query('esperanza', { page: 99 }))).toMatchObject({ items: [], total: 4, page: 99 });
  });
  it('muestra inactivos solo por opción explícita y no los elimina', async () => {
    const actor = await user(), organization = await org(actor.id), individual = await person(actor.id);
    await directory.organizationStatus(organization.id, { expectedVersion: 1, isActive: false }, actor.id);
    await people.status(individual.id, { expectedVersion: 1, isActive: false }, actor.id);
    expect((await queries.searchOrganizations(query('esperanza'))).total).toBe(0); expect((await queries.searchPeople(query('maria'))).total).toBe(0);
    expect((await queries.searchOrganizations(query('esperanza', { includeInactive: true }))).items[0].isActive).toBe(false);
    expect((await queries.searchPeople(query('maria', { includeInactive: true }))).items[0].isActive).toBe(false);
  });
  it('distingue sede y matriz sin convertirlas en alias', async () => {
    const actor = await user(), matrix = await org(actor.id), office = await org(actor.id, 'Fundación Esperanza — Oficina Bolivia', undefined, matrix.id);
    const result = await queries.searchOrganizations(query('esperanza'));
    expect(result.total).toBe(2); expect(result.items.find(row => row.id === office.id)?.parent).toMatchObject({ id: matrix.id, name: matrix.name });
  });
  it('resume vínculos vigentes con límite y no mezcla episodios históricos', async () => {
    const actor = await user(), individual = await person(actor.id), organization = await org(actor.id);
    for (let index = 0; index < 5; index++) await people.createRelation(individual.id, { organizationId: organization.id, isCurrent: index < 4, positionTitle: 'Coordinación ' + index }, actor.id);
    const row = (await queries.searchPeople(query('maria'))).items[0]; expect(row.currentRelationsTotal).toBe(4); expect(row.currentRelations).toHaveLength(3);
    expect(row.currentRelations.every(relation => relation.positionTitle !== 'Coordinación 4')).toBe(true);
  });
  it('encuentra EMAIL exacto normalizado incluso UNUSABLE y asociaciones históricas', async () => {
    const actor = await user(), organization = await org(actor.id), individual = await person(actor.id), method = await email(actor.id);
    const association = await contacts.associate({ personId: individual.id }, method.id, { expectedMethodVersion: method.version }, actor.id);
    await contacts.associate({ organizationId: organization.id }, method.id, { expectedMethodVersion: 2 }, actor.id);
    await contacts.end('person', association.association.id, { expectedVersion: 1 }, actor.id);
    await contacts.condition(method.id, { expectedVersion: 3, condition: 'UNUSABLE' }, actor.id);
    const response = await http(actor.cookie, { q: '  ' + method.value.toUpperCase() + '  ' }).expect(200);
    const body = response.body as SearchResponse;
    expect(body.email).toMatchObject({ id: method.id, value: method.value, condition: 'UNUSABLE', people: { total: 1, items: [{ isActive: false, person: { id: individual.id } }] }, organizations: { total: 1 } });
    expect(body.organizations.total).toBe(0); expect(body.people.total).toBe(0);
    expect(await queries.findEmailWithContext(query(method.value.replace('@', '2@')))).toBeNull();
  });
  it('limita asociaciones y conserva totales para continuar en la ficha paginada del medio', async () => {
    const actor = await user(), method = await email(actor.id);
    for (let index = 0; index < 12; index++) { const row = await person(actor.id, 'Persona contexto ' + index); await contacts.associate({ personId: row.id }, method.id, { expectedMethodVersion: index + 1 }, actor.id); }
    const result = await queries.findEmailWithContext(query(method.value)); expect(result?.people).toMatchObject({ total: 12, limit: 10 }); expect(result?.people.items).toHaveLength(10);
  });
  it('orienta coincidencia exacta de una consolidada al principal y solo incluye parciales históricas por opción', async () => {
    const actor = await user(), principal = await person(actor.id), duplicate = await person(actor.id, 'Maria F. Perez');
    const candidate = (await app.get(DuplicateDetectionService).listActor('person', principal.id, { page: 1, pageSize: 100 }, actor.id)).items[0];
    const consolidation = app.get(ConsolidationService), preview = await consolidation.preview(candidate.id, principal.id, actor.id);
    await consolidation.consolidate(candidate.id, { expectedCandidateVersion: candidate.version, expectedVersionA: candidate.examinedVersionA,
      expectedVersionB: candidate.examinedVersionB, principalId: principal.id, previewToken: preview.previewToken,
      confirmed: true, reconcileCurrentRelations: true, contactConflictPolicy: 'KEEP_PRINCIPAL_CONTEXT' }, actor.id);
    const result = await queries.searchPeople(query('Maria F. Perez'));
    expect(result.items.find(row => row.id === duplicate.id)?.duplicateOf).toMatchObject({ id: principal.id, displayName: principal.displayName });
    expect((await queries.searchPeople(query('maria'))).items.map(row => row.id)).toEqual([principal.id]);
    expect((await queries.searchPeople(query('maria', { includeInactive: true }))).items.map(row => row.id)).toEqual([principal.id, duplicate.id]);
  });
  it('no recalcula duplicados ni escribe historial, auditoría o verificaciones al buscar', async () => {
    const actor = await user(); await org(actor.id); await person(actor.id);
    const counts = async () => Promise.all([prisma.duplicateCandidate.count(), prisma.directoryChange.count(), prisma.auditEvent.count(), prisma.verification.count()]);
    const before = await counts(); await http(actor.cookie, { q: 'esperanza' }).expect(200); await http(actor.cookie, { q: 'maria' }).expect(200); expect(await counts()).toEqual(before);
  });
  it('expone solamente campos públicos con límites de página', async () => {
    const actor = await user(); await org(actor.id); await person(actor.id);
    const response = await http(actor.cookie, { q: 'esperanza', pageSize: 1 }).expect(200);
    expect(Object.keys((response.body as SearchResponse).organizations.items[0]).sort()).toEqual(['alias', 'country', 'duplicateOf', 'id', 'isActive', 'name', 'parent', 'type']);
    const payload = JSON.stringify(response.body); for (const field of ['normalizedValue', 'passwordHash', 'previewToken', 'version', 'actorUserId', '_count']) expect(payload).not.toContain(field);
  });
  it('parametriza signos y fragmentos SQL sin ampliar resultados', async () => {
    const actor = await user(); await org(actor.id);
    expect((await queries.searchOrganizations(query("esperanza%' OR 1=1 --"))).total).toBe(0);
  });
  it('pagina en PostgreSQL 500 coincidencias y solo proyecta las 50 seleccionadas', async () => {
    const marker = 'qaescala' + randomUUID().replaceAll('-', '');
    const rows = Array.from({ length: 500 }, (_, index) => ({ id: randomUUID(), name: marker + ' ' + String(index).padStart(3, '0') }));
    orgIds.push(...rows.map(row => row.id)); await prisma.organization.createMany({ data: rows });
    const started = performance.now(), result = await queries.searchOrganizations(query(marker, { pageSize: 50, page: 3 }));
    console.info('QA búsqueda 500 coincidencias:', JSON.stringify({ milliseconds: Math.round(performance.now() - started), returned: result.items.length, total: result.total }));
    expect(result.total).toBe(500); expect(result.items).toHaveLength(50); expect(result.items[0].name).toBe(marker + ' 100'); expect(result.items.at(-1)?.name).toBe(marker + ' 149');
  });
  it('mantiene el índice parcial de EMAIL y los índices de asociaciones sin extensión adicional', async () => {
    const indices = await prisma.$queryRaw<{ indexdef: string }[]>`SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND indexname='ContactMethod_email_unique'`;
    expect(indices[0].indexdef).toContain('UNIQUE'); expect(indices[0].indexdef).toContain('normalizedValue'); expect(indices[0].indexdef).toContain('EMAIL');
    const extensions = await prisma.$queryRaw<{ extname: string }[]>`SELECT extname FROM pg_extension WHERE extname IN ('unaccent','pg_trgm')`; expect(extensions).toEqual([]);
  });
  it.each(Object.values(UserRole))('%s encuentra procesos y correo histórico sin ContactMethod', async role => {
    const owner = await user(), reader = await user(role), row = await process(owner.id), communication = await incoming(row.id, owner.id);
    const result = (await http(reader.cookie, { q: 'cooperacion busqueda' }).expect(200)).body as SearchResponse;
    expect(result.processes?.items).toEqual([{ type: 'PROCESS', id: row.id, purpose: row.purpose, state: row.state, target: row.target }]);
    const response = await http(reader.cookie, { q: ' HISTORICO+RED@EXAMPLE.TEST ' }).expect(200);
    expect(response.headers['cache-control']).toBe('no-store'); const body = response.body as SearchResponse;
    expect(body.email).toBeNull(); expect(body.emailHistory).toMatchObject({ total: 1, address: 'historico+red@example.test',
      lastValidContact: { id: communication.id, matchedAddress: 'Historico+Red@Example.test', occurredAt: '2025-01-01T12:00:00.000Z',
        direction: 'RECEIVED', registeredBy: { id: owner.id, displayName: 'QA Búsqueda' }, process: { id: row.id, state: row.state, target: row.target } } });
    const payload = JSON.stringify(body); for (const privateField of ['bodyOriginal', 'requestFingerprint', 'passwordHash', 'normalizedAddress', 'Original privado']) expect(payload).not.toContain(privateField);
  });
  it('un correo del directorio sin comunicación no acredita contacto', async () => {
    const owner = await user(), method = await email(owner.id);
    const result = (await http(owner.cookie, { q: method.value }).expect(200)).body as SearchResponse;
    expect(result.email?.id).toBe(method.id); expect(result.emailHistory).toMatchObject({ items: [], total: 0, lastValidContact: null });
  });
  it('conserva invalidados, selecciona contacto válido por fecha real y no por registro o actividad', async () => {
    const owner = await user(), registrar = await user(UserRole.RESEARCH), row = await process(owner.id);
    const valid = await incoming(row.id, owner.id, 'Historico+Red@Example.test', '2025-03-01T12:00:00.000Z');
    await incoming(row.id, registrar.id, 'Historico+Red@Example.test', '2024-01-01T12:00:00.000Z');
    const invalid = await incoming(row.id, registrar.id, 'Historico+Red@Example.test', '2025-04-01T12:00:00.000Z');
    await app.get(CommunicationAmendmentsService).create(invalid.id, 'INVALIDATION', 'Registro equivocado para QA', owner.id, randomUUID());
    await app.get(RelationshipProcessesService).close(row.id, { expectedVersion: (await app.get(RelationshipProcessesService).get(row.id, owner.id)).version, result: 'ACHIEVED' }, owner.id);
    const before = await prisma.communication.findUniqueOrThrow({ where: { id: valid.id } });
    const body = (await http(owner.cookie, { q: 'historico+red@example.test', pageSize: 1, page: 2 }).expect(200)).body as SearchResponse;
    expect(body.emailHistory?.total).toBe(3); expect(body.emailHistory?.items).toHaveLength(1);
    expect(body.emailHistory?.lastValidContact).toMatchObject({ id: valid.id, occurredAt: '2025-03-01T12:00:00.000Z', registeredBy: { id: owner.id }, process: { state: 'CLOSED' } });
    const first = (await http(owner.cookie, { q: 'historico+red@example.test', pageSize: 1 }).expect(200)).body as SearchResponse;
    expect(first.emailHistory?.items[0]).toMatchObject({ id: invalid.id, validity: 'INVALIDATED', registeredBy: { id: registrar.id } });
    expect(await prisma.communication.findUniqueOrThrow({ where: { id: valid.id } })).toEqual(before);
  });
  it('solo invalidados siguen visibles sin último contacto válido', async () => {
    const owner = await user(), row = await process(owner.id, 'Proceso personal', true), event = await incoming(row.id, owner.id);
    await app.get(CommunicationAmendmentsService).create(event.id, 'INVALIDATION', 'Antecedente inválido QA', owner.id, randomUUID());
    const history = (await http(owner.cookie, { q: 'historico+red@example.test' }).expect(200)).body as SearchResponse;
    expect(history.emailHistory).toMatchObject({ total: 1, lastValidContact: null, items: [{ validity: 'INVALIDATED', process: { target: { kind: 'PERSON' } } }] });
  });
  it('busca destinatarios To/CC/BCC, deduplica coincidencias y conserva sufijos', async () => {
    const owner = await user(), row = await process(owner.id);
    await app.get(CommunicationsService).registerReceived(row.id, { sender: 'ExternO@Example.test', to: ['to@example.test'], cc: ['cc@example.test'],
      bcc: ['BCC+Tag@Example.test', 'ExternO@Example.test'], subject: 'Original', body: 'Cuerpo privado', receivedAt: '2025-01-01T12:00:00.000Z' }, owner.id, randomUUID());
    for (const address of ['externo@example.test', 'to@example.test', 'cc@example.test', 'bcc+tag@example.test']) {
      const result = (await http(owner.cookie, { q: address }).expect(200)).body as SearchResponse;
      expect(result.emailHistory?.total).toBe(1); expect(result.emailHistory?.items).toHaveLength(1);
    }
    expect(((await http(owner.cookie, { q: 'bcc@example.test' }).expect(200)).body as SearchResponse).emailHistory?.total).toBe(0);
  });
  it('salida real y registrador desactivado conservan antecedente histórico', async () => {
    const owner = await user(), reader = await user(UserRole.PLANNING), row = await process(owner.id);
    const account = await users.createEmailAccount({ address: 'cecasem.' + randomUUID() + '@example.test', displayName: 'Buzón QA' }); accountIds.push(account.id);
    await users.assignEmailAccount(owner.id, account.id);
    const sent = await app.get(CommunicationsService).registerSent(row.id, { emailAccountId: account.id, to: ['Historico+Red@Example.test'], cc: [], bcc: [],
      subject: 'Salida histórica', body: 'Cuerpo original', sentAt: '2025-02-01T12:00:00.000Z' }, owner.id, randomUUID());
    await prisma.user.update({ where: { id: owner.id }, data: { isActive: false, deactivatedAt: new Date() } });
    const result = (await http(reader.cookie, { q: 'historico+red@example.test' }).expect(200)).body as SearchResponse;
    expect(result.emailHistory?.lastValidContact).toMatchObject({ id: sent.id, direction: 'SENT', occurredAt: '2025-02-01T12:00:00.000Z', registeredBy: { id: owner.id, isActive: false } });
    await http(owner.cookie, { q: 'historico+red@example.test' }).expect(401);
  });
  it('procesos mantienen ranking normalizado, desempate y páginas sin duplicar cerrados', async () => {
    const owner = await user(), rows = [];
    for (const purpose of ['Cooperación', 'Cooperación exterior', 'Nueva cooperación']) rows.push(await process(owner.id, purpose));
    const first = (await http(owner.cookie, { q: 'cooperacion', pageSize: 2 }).expect(200)).body as SearchResponse;
    const second = (await http(owner.cookie, { q: 'cooperacion', pageSize: 2, page: 2 }).expect(200)).body as SearchResponse;
    expect(first.processes?.total).toBe(3); expect([...first.processes!.items, ...second.processes!.items].map(item => item.id)).toEqual(rows.map(row => row.id));
    expect(((await http(owner.cookie, { q: "cooperacion%' OR 1=1 --" }).expect(200)).body as SearchResponse).processes?.total).toBe(0);
  });
  it.each([['directory.read'], ['directory.read', 'relationships.process.read']])('no permite bypass con permisos restringidos %j', async (...permissions) => {
    const owner = await user(), row = await process(owner.id); await incoming(row.id, owner.id);
    jest.spyOn(authorization, 'hasPermission').mockImplementation((_role, permission) => permissions.includes(permission));
    const body = (await http(owner.cookie, { q: 'historico+red@example.test' }).expect(200)).body as SearchResponse;
    expect(body.emailHistory).toBeNull();
    if (!permissions.includes('relationships.process.read')) expect(body.processes).toBeNull();
    await expect(app.get(CommunicationSearchService).history({ address: 'historico+red@example.test', page: 1, pageSize: 25 }, owner.id)).rejects.toThrow();
  });
  it('proyecta procesos y antecedentes por lotes con cantidad constante de SELECT', async () => {
    const owner = await user(); const firstProcess = await process(owner.id, 'Carga búsqueda global'); await incoming(firstProcess.id, owner.id);
    const calls = jest.spyOn(Client.prototype, 'query');
    const queryText = (query: unknown) => typeof query === 'string' ? query : query && typeof query === 'object' && 'text' in query ? String(query.text) : '';
    const count = () => calls.mock.calls.filter(([query]) => /SELECT/i.test(queryText(query))).length;
    const read = async () => {
      await app.get(RelationshipSearchService).search({ name: 'carga busqueda', page: 1, pageSize: 50 }, owner.id);
      await app.get(CommunicationSearchService).history({ address: 'historico+red@example.test', page: 1, pageSize: 50 }, owner.id);
    };
    await read(); const baseline = count();
    for (let index = 0; index < 10; index++) { const row = await process(owner.id, 'Carga búsqueda global ' + index); await incoming(row.id, owner.id); }
    calls.mockClear(); await read(); expect(count()).toBe(baseline); expect(baseline).toBeLessThan(25);
    const body = (await http(owner.cookie, { q: 'historico+red@example.test', pageSize: 3 }).expect(200)).body as SearchResponse;
    expect(body.emailHistory?.total).toBe(11); expect(body.emailHistory?.items).toHaveLength(3);
  });
});
