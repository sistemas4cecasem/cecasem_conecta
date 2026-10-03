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
import { DirectoryService } from '../src/modules/directory/directory.service';
import { PeopleService } from '../src/modules/directory/people.service';
import { ContactsService } from '../src/modules/directory/contacts.service';
import { DuplicateDetectionService } from '../src/modules/directory/duplicate-detection.service';
import { ConsolidationService } from '../src/modules/directory/consolidation.service';
import { VerificationService } from '../src/modules/directory/verification.service';
import { AuditService } from '../src/modules/audit/audit.service';
import type { DuplicateDecisionDto } from '../src/modules/directory/duplicates.dto';

const databaseUrl = validateDatabaseUrl(process.env.DATABASE_URL);
if (!new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('Duplicados requiere una base aislada _test.');
const page = { page: 1, pageSize: 100 };
type Candidate = Awaited<ReturnType<DuplicateDetectionService['listActor']>>['items'][number];
function decision(candidate: Candidate): DuplicateDecisionDto {
  return { expectedCandidateVersion: candidate.version, expectedVersionA: candidate.examinedVersionA, expectedVersionB: candidate.examinedVersionB };
}
describe('Candidatos y consolidación PostgreSQL/HTTP', () => {
  let app: INestApplication<Server>, prisma: PrismaService, users: UsersService, directory: DirectoryService, people: PeopleService,
    contacts: ContactsService, detection: DuplicateDetectionService, consolidation: ConsolidationService, verification: VerificationService, passwordHash: string;
  const password = randomBytes(24).toString('base64url');
  const userIds: string[] = [], organizationIds: string[] = [], personIds: string[] = [], categoryIds: string[] = [], methodIds: string[] = [];
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ConfigService)
      .useValue(new ConfigService(validateEnvironment({ NODE_ENV: 'test', DATABASE_URL: databaseUrl }))).compile();
    app = moduleRef.createNestApplication<INestApplication<Server>>(); configureApplication(app); await app.init();
    prisma = app.get(PrismaService); users = app.get(UsersService); directory = app.get(DirectoryService); people = app.get(PeopleService);
    contacts = app.get(ContactsService); detection = app.get(DuplicateDetectionService); consolidation = app.get(ConsolidationService);
    verification = app.get(VerificationService); passwordHash = await app.get(PasswordService).hashNew(password);
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    const actorPair = { OR: [{ organizationAId: { in: organizationIds } }, { personAId: { in: personIds } }] };
    const candidates = await prisma.duplicateCandidate.findMany({ where: actorPair, select: { id: true } });
    await prisma.$transaction([
      prisma.duplicateReconciliation.deleteMany({ where: { candidateId: { in: candidates.map(row => row.id) } } }),
      prisma.verification.deleteMany({ where: { actorUserId: { in: userIds } } }),
      prisma.auditEvent.deleteMany({ where: { actorUserId: { in: userIds } } }),
      prisma.duplicateCandidate.deleteMany({ where: actorPair }),
      prisma.directoryChange.deleteMany({ where: { actorUserId: { in: userIds } } }),
      prisma.personContact.deleteMany({ where: { personId: { in: personIds } } }),
      prisma.organizationContact.deleteMany({ where: { organizationId: { in: organizationIds } } }),
      prisma.personOrganizationRelation.deleteMany({ where: { OR: [{ personId: { in: personIds } }, { organizationId: { in: organizationIds } }] } }),
      prisma.contactMethod.deleteMany({ where: { id: { in: methodIds } } }),
      prisma.person.updateMany({ where: { id: { in: personIds } }, data: { duplicateOfId: null } }),
      prisma.person.deleteMany({ where: { id: { in: personIds } } }),
      prisma.organizationCategory.deleteMany({ where: { organizationId: { in: organizationIds } } }),
      prisma.organization.updateMany({ where: { id: { in: organizationIds } }, data: { duplicateOfId: null, parentId: null } }),
      prisma.organization.deleteMany({ where: { id: { in: organizationIds } } }),
      prisma.category.deleteMany({ where: { id: { in: categoryIds } } }),
      prisma.userSession.deleteMany({ where: { userId: { in: userIds } } }), prisma.user.deleteMany({ where: { id: { in: userIds } } }),
    ]);
    userIds.length = organizationIds.length = personIds.length = categoryIds.length = methodIds.length = 0;
  });
  afterAll(async () => { await app.close(); });
  async function user(role: UserRole = UserRole.ADMINISTRATOR) {
    const row = await users.createIdentity({ givenNames: 'Autora', familyNames: 'QA Duplicados', email: randomUUID() + '@example.test', role });
    userIds.push(row.id); await prisma.user.update({ where: { id: row.id }, data: { passwordHash } }); return row;
  }
  async function cookie(actor: { email: string }) {
    const result = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: actor.email, password }).expect(200);
    return (result.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
  }
  async function organization(actor: string, name = 'Fundación Esperanza', extra: { parentId?: string; categoryIds?: string[] } = {}) {
    const row = await directory.createOrganization({ name, ...extra }, actor); organizationIds.push(row.id); return row;
  }
  async function person(actor: string, displayName = 'María Fernanda Pérez') {
    const row = await people.create({ displayName }, actor); personIds.push(row.id); return row;
  }
  async function medium(actor: string) {
    const row = await contacts.create({ type: ContactType.EMAIL, value: randomUUID() + '@example.test' }, actor); methodIds.push(row.id); return row;
  }
  async function orgPair(actor: string) {
    const a = await organization(actor), b = await organization(actor, 'Fundacion Esperanza');
    const candidate = (await detection.listActor('organization', a.id, page, actor)).items.find(item => [item.a.id, item.b.id].includes(b.id))!;
    return { a, b, candidate };
  }
  async function personPair(actor: string) {
    const a = await person(actor), b = await person(actor, 'Maria F. Perez');
    const candidate = (await detection.listActor('person', a.id, page, actor)).items.find(item => [item.a.id, item.b.id].includes(b.id))!;
    return { a, b, candidate };
  }
  async function proposal(candidate: Candidate, principalId: string, actor: string) {
    const preview = await consolidation.preview(candidate.id, principalId, actor);
    return { ...decision(candidate), principalId, previewToken: preview.previewToken, confirmed: true,
      reconcileCurrentRelations: true, contactConflictPolicy: 'KEEP_PRINCIPAL_CONTEXT' as const };
  }
  it.each(Object.values(UserRole))('%s consulta y descarta sin modificar fichas ni verificaciones', async role => {
    const actor = await user(role), { a, b, candidate } = await orgPair(actor.id), session = await cookie(actor);
    await verification.verify('organization', a.id, { expectedVersion: 1 }, actor.id);
    const original = await prisma.organization.findMany({ where: { id: { in: [a.id, b.id] } }, orderBy: { id: 'asc' } });
    await request(app.getHttpServer()).get('/api/v1/organizations/' + a.id + '/duplicate-candidates').set('Cookie', session).expect(200);
    await request(app.getHttpServer()).post('/api/v1/duplicate-candidates/' + candidate.id + '/dismiss').set('Cookie', session).send(decision(candidate)).expect(201);
    expect(await prisma.organization.findMany({ where: { id: { in: [a.id, b.id] } }, orderBy: { id: 'asc' } })).toEqual(original);
    expect(await prisma.verification.count({ where: { organizationId: a.id } })).toBe(1);
    const refreshed = await detection.listActor('organization', a.id, page, actor.id);
    expect(refreshed.items).toHaveLength(1); expect(refreshed.items[0]).toMatchObject({ state: 'NOT_DUPLICATE', resolvedBy: { id: actor.id } });
  });
  it.each([UserRole.BOARD, UserRole.RESEARCH, UserRole.PLANNING])('%s recibe 403 en preview y consolidación', async role => {
    const actor = await user(role), { a, candidate } = await orgPair(actor.id), session = await cookie(actor);
    await request(app.getHttpServer()).get('/api/v1/duplicate-candidates/' + candidate.id + '/consolidation-preview?principalId=' + a.id).set('Cookie', session).expect(403);
    await request(app.getHttpServer()).post('/api/v1/duplicate-candidates/' + candidate.id + '/consolidate').set('Cookie', session).send({}).expect(403);
  });
  it('401 sin sesión en todas las rutas nuevas', async () => {
    const id = randomUUID();
    for (const path of ['duplicate-candidates', 'organizations/' + id + '/duplicate-candidates', 'people/' + id + '/duplicate-candidates',
      'duplicate-candidates/' + id + '/consolidation-preview?principalId=' + id]) await request(app.getHttpServer()).get('/api/v1/' + path).expect(401);
    for (const action of ['dismiss', 'consolidate']) await request(app.getHttpServer()).post('/api/v1/duplicate-candidates/' + id + '/' + action).send({}).expect(401);
  });
  it('candidato inexistente devuelve 404 público sin internals', async () => {
    const actor = await user(), session = await cookie(actor);
    const result = await request(app.getHttpServer()).post('/api/v1/duplicate-candidates/' + randomUUID() + '/dismiss').set('Cookie', session)
      .send({ expectedCandidateVersion: 1, expectedVersionA: 1, expectedVersionB: 1 }).expect(404);
    expect(result.body).toMatchObject({ code: 'DUPLICATE_CANDIDATE_NOT_FOUND' }); expect(JSON.stringify(result.body)).not.toMatch(/Prisma|stack|password|tokenHash/);
  });
  it('DTO estricto exige versiones, principal, token y confirmaciones', async () => {
    const actor = await user(), { a, candidate } = await orgPair(actor.id), session = await cookie(actor);
    const body = await proposal(candidate, a.id, actor.id);
    for (const field of ['principalId', 'previewToken', 'expectedVersionA', 'expectedVersionB', 'expectedCandidateVersion', 'confirmed', 'reconcileCurrentRelations', 'contactConflictPolicy']) {
      const invalid = { ...body } as Record<string, unknown>; delete invalid[field];
      await request(app.getHttpServer()).post('/api/v1/duplicate-candidates/' + candidate.id + '/consolidate').set('Cookie', session).send(invalid).expect(400);
    }
    await request(app.getHttpServer()).post('/api/v1/duplicate-candidates/' + candidate.id + '/dismiss').set('Cookie', session).send({ ...decision(candidate), unexpected: true }).expect(400);
  });
  it('pareja única concurrente en ambos sentidos', async () => {
    const actor = await user(), a = await organization(actor.id), b = await organization(actor.id, 'Fundacion Esperanza');
    await Promise.all([detection.listActor('organization', a.id, page, actor.id), detection.listActor('organization', b.id, page, actor.id)]);
    expect(await prisma.duplicateCandidate.count()).toBe(1);
  });
  it('FK, mismo actor, pareja invertida y pareja repetida rechazados por PostgreSQL', async () => {
    const actor = await user(), { candidate } = await orgPair(actor.id);
    const row = await prisma.duplicateCandidate.findUniqueOrThrow({ where: { id: candidate.id } });
    const base = { ...row, id: randomUUID() };
    await expect(prisma.duplicateCandidate.create({ data: { ...base, organizationAId: randomUUID() } })).rejects.toThrow();
    await expect(prisma.duplicateCandidate.create({ data: { ...base, organizationBId: row.organizationAId } })).rejects.toThrow();
    await expect(prisma.duplicateCandidate.create({ data: { ...base, organizationAId: row.organizationBId, organizationBId: row.organizationAId } })).rejects.toThrow();
    await expect(prisma.duplicateCandidate.create({ data: base })).rejects.toThrow();
    expect(await prisma.duplicateCandidate.count()).toBe(1);
  });
  it('dos descartes concurrentes son idempotentes y conservan la primera resolución', async () => {
    const actor = await user(), pair = await orgPair(actor.id), input = decision(pair.candidate);
    const results = await Promise.all([detection.dismiss(pair.candidate.id, input, actor.id), detection.dismiss(pair.candidate.id, input, actor.id)]);
    expect(results[0]).toEqual(results[1]); expect(results[0].version).toBe(2);
  });
  it('descartado no reaparece por cambios de estado o descripción', async () => {
    const actor = await user(), { a, candidate } = await orgPair(actor.id);
    await detection.dismiss(candidate.id, decision(candidate), actor.id);
    const edited = await directory.editOrganization(a.id, { name: a.name, description: 'Contexto nuevo', expectedVersion: 1 }, actor.id);
    await directory.organizationStatus(a.id, { isActive: false, expectedVersion: edited.version }, actor.id);
    expect((await detection.listActor('organization', a.id, page, actor.id)).items).toHaveLength(1);
  });
  it('nueva información relevante genera otra evaluación conservando la decisión anterior', async () => {
    const actor = await user(), { a, candidate } = await orgPair(actor.id);
    await detection.dismiss(candidate.id, decision(candidate), actor.id);
    await directory.editOrganization(a.id, { name: a.name, alias: 'FE', expectedVersion: 1 }, actor.id);
    const rows = (await detection.listActor('organization', a.id, page, actor.id)).items;
    expect(rows).toHaveLength(2); expect(rows.filter(row => row.state === 'NOT_DUPLICATE')).toHaveLength(1);
    expect(rows.find(row => row.state === 'PENDING')).toMatchObject({ stale: false });
  });
  it('candidato stale no se resuelve; su condición se informa en listado pendiente', async () => {
    const actor = await user(), { a, candidate } = await orgPair(actor.id);
    await directory.editOrganization(a.id, { name: 'Fundación Esperanza Bolivia', expectedVersion: 1 }, actor.id);
    expect((await detection.listPending(page)).items[0].stale).toBe(true);
    await expect(detection.dismiss(candidate.id, decision(candidate), actor.id)).rejects.toMatchObject({ code: 'DUPLICATE_CANDIDATE_STALE' });
    await expect(consolidation.preview(candidate.id, a.id, actor.id)).rejects.toMatchObject({ code: 'DUPLICATE_CANDIDATE_STALE' });
  });
  it('recálculo pending de mismos nombres actualiza versiones y rechaza una vista previa anterior', async () => {
    const actor = await user(), { a, candidate } = await orgPair(actor.id), input = await proposal(candidate, a.id, actor.id);
    await directory.editOrganization(a.id, { name: a.name, description: 'Cambio informativo', expectedVersion: 1 }, actor.id);
    const current = (await detection.listActor('organization', a.id, page, actor.id)).items[0];
    expect(current.id).toBe(candidate.id); expect(current.version).toBe(2); expect(current.stale).toBe(false);
    await expect(consolidation.consolidate(candidate.id, input, actor.id)).rejects.toMatchObject({ code: 'CONSOLIDATION_VERSION_CONFLICT' });
  });
  it('no se selecciona principal fuera de la pareja ni sin confirmación', async () => {
    const actor = await user(), { a, candidate } = await orgPair(actor.id);
    await expect(consolidation.preview(candidate.id, randomUUID(), actor.id)).rejects.toMatchObject({ code: 'INVALID_CONSOLIDATION_TARGET' });
    const input = await proposal(candidate, a.id, actor.id);
    await expect(consolidation.consolidate(candidate.id, { ...input, confirmed: false }, actor.id)).rejects.toMatchObject({ code: 'CONSOLIDATION_CONFIRMATION_REQUIRED' });
  });
  it('consolidación institucional conserva categorías originales, contactos, vínculos y verificaciones', async () => {
    const actor = await user(), { a, b, candidate } = await orgPair(actor.id), p = await person(actor.id), m = await medium(actor.id);
    const category = await directory.createCategory({ name: 'Categoría ' + randomUUID() }, actor.id); categoryIds.push(category.id);
    // Preparar clasificación antes de reevaluar: las versiones examinadas se actualizan explícitamente.
    await directory.editOrganization(b.id, { name: b.name, categoryIds: [category.id], expectedVersion: 1 }, actor.id);
    const pc = await contacts.associate({ organizationId: b.id }, m.id, { expectedMethodVersion: 1, sourceDescription: 'Evidencia institucional' }, actor.id);
    const relation = await people.createRelation(p.id, { organizationId: b.id, positionTitle: 'Coordinadora', isCurrent: true, startDate: '2020-01-01' }, actor.id);
    await verification.verify('organization', b.id, { expectedVersion: 2 }, actor.id);
    await verification.verify('organizationContact', pc.association.id, { expectedVersion: 1, expectedContactValueVersion: 1 }, actor.id);
    await verification.verify('relation', relation.id, { expectedVersion: 1 }, actor.id);
    const current = (await detection.listActor('organization', a.id, page, actor.id)).items.find(row => row.id === candidate.id)!;
    const input = await proposal(current, a.id, actor.id), session = await cookie(actor);
    await request(app.getHttpServer()).post('/api/v1/duplicate-candidates/' + candidate.id + '/consolidate').set('Cookie', session).send(input).expect(201);
    expect(await prisma.organization.findUniqueOrThrow({ where: { id: b.id } })).toMatchObject({ duplicateOfId: a.id, name: b.name, isActive: true });
    expect(await prisma.organizationCategory.count({ where: { categoryId: category.id } })).toBe(2);
    expect(await prisma.personOrganizationRelation.findUniqueOrThrow({ where: { id: relation.id } })).toMatchObject({ organizationId: b.id, isCurrent: true });
    const primaryContact = await prisma.organizationContact.findFirstOrThrow({ where: { organizationId: a.id } });
    expect(primaryContact).toMatchObject({ contactMethodId: m.id, lastVerifiedAt: null, sourceDescription: 'Evidencia institucional' });
    const primaryRelation = await prisma.personOrganizationRelation.findFirstOrThrow({ where: { organizationId: a.id } });
    expect(primaryRelation).toMatchObject({ positionTitle: 'Coordinadora', lastVerifiedAt: null, startDate: new Date('2020-01-01') });
    expect((await contacts.listActor({ organizationId: a.id }, page)).items[0].consolidationOrigins[0]).toMatchObject({
      source: { id: pc.association.id, path: 'organizations/' + b.id }, outcome: 'CREATED', resolvedBy: { id: actor.id },
    });
    expect((await people.relationsOfOrganization(a.id, { ...page, status: 'all' })).items[0].consolidationOrigins[0]).toMatchObject({
      source: { id: relation.id, path: 'people/' + p.id }, outcome: 'CREATED', resolvedBy: { id: actor.id },
    });
    expect(await prisma.verification.count({ where: { organizationId: b.id } })).toBe(1);
    expect((await verification.status('organization', a.id)).verificationStatus).toBe('NEVER_VERIFIED');
    expect(await prisma.duplicateReconciliation.count({ where: { candidateId: candidate.id } })).toBe(2);
    expect(await prisma.auditEvent.findFirstOrThrow({ where: { action: 'DUPLICATE_CONSOLIDATED' } })).toMatchObject({ principalOrganizationId: a.id, duplicateOrganizationId: b.id, duplicateCandidateId: candidate.id });
    const history = await directory.organizationHistory(b.id, page); expect(history.items[0].changes[0]).toMatchObject({ field: 'duplicateOfOrganizationId' });
    expect(history.items[0].replacement?.next.label).toBe(a.name);
    await request(app.getHttpServer()).get('/api/v1/organizations/' + b.id).set('Cookie', session).expect(200);
  });
  it('CHECK de auditoría de consolidación exige candidato y objetivos tipados sin mezclar familias', async () => {
    const actor = await user(), { a, b, candidate } = await orgPair(actor.id), p = await person(actor.id);
    await consolidation.consolidate(candidate.id, await proposal(candidate, a.id, actor.id), actor.id);
    const event = await prisma.auditEvent.findFirstOrThrow({ where: { action: 'DUPLICATE_CONSOLIDATED' } });
    for (const change of [
      { duplicateCandidateId: null }, { operationId: null }, { actorUserId: null },
      { duplicateOrganizationId: a.id }, { principalOrganizationId: null },
      { principalPersonId: p.id }, { targetUserId: actor.id }, { organizationId: b.id },
      { previousPersonalVerificationMonths: 6 }, { duplicateOrganizationId: randomUUID() },
    ]) await expect(prisma.auditEvent.create({ data: { ...event, id: randomUUID(), ...change } })).rejects.toThrow();
    expect(await prisma.auditEvent.count({ where: { action: 'DUPLICATE_CONSOLIDATED' } })).toBe(1);
  });
  it('principal verificado requiere revisión propia; no recibe verificación del duplicado', async () => {
    const actor = await user(), { a, b, candidate } = await personPair(actor.id);
    await verification.verify('person', a.id, { expectedVersion: 1 }, actor.id); await verification.verify('person', b.id, { expectedVersion: 1 }, actor.id);
    const before = await prisma.verification.findMany({ orderBy: { id: 'asc' } });
    await consolidation.consolidate(candidate.id, await proposal(candidate, a.id, actor.id), actor.id);
    expect(await prisma.verification.findMany({ orderBy: { id: 'asc' } })).toEqual(before);
    expect(await verification.status('person', a.id)).toMatchObject({ verificationStatus: 'REVIEW_DUE', changedSinceVerification: true });
  });
  it('contextos discrepantes conservan fuente del principal y evidencia original, sin duplicar asociación', async () => {
    const actor = await user(), { a, b, candidate } = await personPair(actor.id), m = await medium(actor.id);
    const main = await contacts.associate({ personId: a.id }, m.id, { expectedMethodVersion: 1, notes: 'Principal' }, actor.id);
    const old = await contacts.associate({ personId: b.id }, m.id, { expectedMethodVersion: 2, notes: 'Evidencia duplicada' }, actor.id);
    await contacts.end('person', main.association.id, { expectedVersion: 1 }, actor.id);
    const preview = await consolidation.preview(candidate.id, a.id, actor.id);
    expect(preview.contacts[0]).toMatchObject({ contextConflict: true, reactivate: true });
    await consolidation.consolidate(candidate.id, await proposal(candidate, a.id, actor.id), actor.id);
    expect(await prisma.personContact.findUniqueOrThrow({ where: { id: main.association.id } })).toMatchObject({ notes: 'Principal', isActive: true, lastVerifiedAt: null });
    expect(await prisma.personContact.findUniqueOrThrow({ where: { id: old.association.id } })).toMatchObject({ notes: 'Evidencia duplicada', personId: b.id });
    expect(await prisma.personContact.count({ where: { personId: a.id } })).toBe(1);
  });
  it('vínculos equivalentes reutilizados, episodios distintos conservados y anteriores intactos', async () => {
    const actor = await user(), { a, b, candidate } = await personPair(actor.id), org = await organization(actor.id);
    const main = await people.createRelation(a.id, { organizationId: org.id, positionTitle: 'Directora', isCurrent: true }, actor.id);
    const same = await people.createRelation(b.id, { organizationId: org.id, positionTitle: 'Directora', isCurrent: true }, actor.id);
    const different = await people.createRelation(b.id, { organizationId: org.id, positionTitle: 'Asesora', isCurrent: true, startDate: '2021-01-01' }, actor.id);
    const historical = await people.createRelation(b.id, { organizationId: org.id, positionTitle: 'Consultora', isCurrent: false, endDate: '2020-01-01' }, actor.id);
    await consolidation.consolidate(candidate.id, await proposal(candidate, a.id, actor.id), actor.id);
    expect(await prisma.personOrganizationRelation.count({ where: { personId: a.id } })).toBe(2);
    const traces = await prisma.duplicateReconciliation.findMany({ where: { candidateId: candidate.id } });
    expect(traces).toEqual(expect.arrayContaining([expect.objectContaining({ sourceRelationId: same.id, targetRelationId: main.id, outcome: 'REUSED' }),
      expect.objectContaining({ sourceRelationId: different.id, outcome: 'CREATED' })]));
    expect(await prisma.personOrganizationRelation.findUniqueOrThrow({ where: { id: historical.id } })).toMatchObject({ personId: b.id, positionTitle: 'Consultora' });
  });
  it('cambio de contacto posterior a preview provoca 409 aunque las fichas sigan en versión 1', async () => {
    const actor = await user(), { a, b, candidate } = await personPair(actor.id), m = await medium(actor.id);
    const association = await contacts.associate({ personId: b.id }, m.id, { expectedMethodVersion: 1 }, actor.id);
    const input = await proposal(candidate, a.id, actor.id);
    await contacts.editContext('person', association.association.id, { expectedVersion: 1, notes: 'Cambio posterior' }, actor.id);
    await expect(consolidation.consolidate(candidate.id, input, actor.id)).rejects.toMatchObject({ code: 'CONSOLIDATION_VERSION_CONFLICT' });
    expect((await people.get(a.id)).version).toBe(1);
  });
  it('cambio de vínculo posterior a preview provoca 409', async () => {
    const actor = await user(), { a, b, candidate } = await personPair(actor.id), org = await organization(actor.id);
    const relation = await people.createRelation(b.id, { organizationId: org.id, isCurrent: true }, actor.id), input = await proposal(candidate, a.id, actor.id);
    await people.editRelation(relation.id, { expectedVersion: 1, isCurrent: true, positionTitle: 'Cambio posterior' }, actor.id);
    await expect(consolidation.consolidate(candidate.id, input, actor.id)).rejects.toMatchObject({ code: 'CONSOLIDATION_VERSION_CONFLICT' });
  });
  it('rollback de auditoría revierte ficha, reconciliaciones, historial y candidato', async () => {
    const actor = await user(), { a, b, candidate } = await personPair(actor.id), m = await medium(actor.id);
    await contacts.associate({ personId: b.id }, m.id, { expectedMethodVersion: 1 }, actor.id);
    const before = { changes: await prisma.directoryChange.count(), audit: await prisma.auditEvent.count() }, input = await proposal(candidate, a.id, actor.id);
    jest.spyOn(app.get(AuditService), 'recordConsolidation').mockRejectedValueOnce(new Error('Fallo QA controlado'));
    await expect(consolidation.consolidate(candidate.id, input, actor.id)).rejects.toThrow('Fallo QA controlado');
    expect(await people.get(b.id)).toMatchObject({ duplicateOfId: null, version: 1 });
    expect(await prisma.personContact.count({ where: { personId: a.id } })).toBe(0);
    expect(await prisma.duplicateReconciliation.count()).toBe(0); expect(await prisma.directoryChange.count()).toBe(before.changes);
    expect(await prisma.auditEvent.count()).toBe(before.audit); expect(await prisma.duplicateCandidate.findUniqueOrThrow({ where: { id: candidate.id } })).toMatchObject({ state: 'PENDING', version: 1 });
  });
  it('dos administradores consolidando en sentidos opuestos dejan una única decisión válida', async () => {
    const actor = await user(), other = await user(), { a, b, candidate } = await personPair(actor.id);
    const first = await proposal(candidate, a.id, actor.id), second = await proposal(candidate, b.id, other.id);
    const results = await Promise.allSettled([consolidation.consolidate(candidate.id, first, actor.id), consolidation.consolidate(candidate.id, second, other.id)]);
    expect(results.filter(row => row.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(row => row.status === 'rejected')).toHaveLength(1);
    expect(await prisma.auditEvent.count({ where: { action: 'DUPLICATE_CONSOLIDATED' } })).toBe(1);
    expect(await prisma.person.count({ where: { duplicateOfId: { not: null } } })).toBe(1);
  });
  it.each(['office-to-parent', 'parent-to-office', 'duplicate-with-children'] as const)('jerarquía segura: %s', async scenario => {
    const actor = await user();
    const a = await organization(actor.id), b = await organization(actor.id, 'Fundacion Esperanza', scenario === 'duplicate-with-children' ? {} : { parentId: a.id });
    if (scenario === 'duplicate-with-children') await organization(actor.id, 'Sede legítima', { parentId: b.id });
    const candidate = (await detection.listActor('organization', a.id, page, actor.id)).items.find(row => [row.a.id, row.b.id].includes(b.id))!;
    const principalId = scenario === 'parent-to-office' ? b.id : a.id;
    const preview = await consolidation.preview(candidate.id, principalId, actor.id);
    expect(preview.blockers).toContain('CONSOLIDATION_HIERARCHY_CONFLICT');
    await expect(consolidation.consolidate(candidate.id, await proposal(candidate, principalId, actor.id), actor.id)).rejects.toMatchObject({ code: 'CONSOLIDATION_HIERARCHY_CONFLICT' });
    expect(await prisma.organization.count({ where: { duplicateOfId: { not: null } } })).toBe(0);
  });
  it('rechaza consolidar hacia principal ya consolidado y evita cadenas', async () => {
    const actor = await user(), { a, b, candidate } = await personPair(actor.id), c = await person(actor.id, 'Maria Fernanda Perez Bolivia');
    const other = (await detection.listActor('person', a.id, page, actor.id)).items.find(row => [row.a.id, row.b.id].includes(c.id))!;
    await consolidation.consolidate(candidate.id, await proposal(candidate, a.id, actor.id), actor.id);
    await expect(consolidation.preview(candidate.id, b.id, actor.id)).rejects.toMatchObject({ code: 'ACTOR_ALREADY_CONSOLIDATED' });
    const refreshed = (await detection.listActor('person', c.id, page, actor.id)).items.find(row => row.id === other.id)!;
    const preview = await consolidation.preview(refreshed.id, c.id, actor.id);
    expect(preview.blockers).toContain('INVALID_CONSOLIDATION_TARGET');
    await expect(consolidation.consolidate(refreshed.id, await proposal(refreshed, c.id, actor.id), actor.id)).rejects.toMatchObject({ code: 'INVALID_CONSOLIDATION_TARGET' });
  });
  it('ficha consolidada no acepta edición, estado, contactos, vínculos ni verificación; lectura e historia continúan', async () => {
    const actor = await user(), { a, b, candidate } = await personPair(actor.id), org = await organization(actor.id), m = await medium(actor.id);
    await consolidation.consolidate(candidate.id, await proposal(candidate, a.id, actor.id), actor.id);
    for (const work of [() => people.edit(b.id, { displayName: 'Cambio', expectedVersion: 2 }, actor.id),
      () => people.status(b.id, { isActive: false, expectedVersion: 2 }, actor.id),
      () => contacts.associate({ personId: b.id }, m.id, { expectedMethodVersion: 1 }, actor.id),
      () => people.createRelation(b.id, { organizationId: org.id, isCurrent: true }, actor.id),
      () => verification.verify('person', b.id, { expectedVersion: 2 }, actor.id)]) {
      await expect(work()).rejects.toMatchObject({ code: 'ACTOR_ALREADY_CONSOLIDATED', details: { principalId: a.id, principalPath: 'people/' + a.id } });
    }
    expect(await people.get(b.id)).toMatchObject({ id: b.id, duplicateOfId: a.id });
    expect((await people.personHistory(b.id, page)).total).toBe(1);
  });
  it('RF-26: correo exacto, reutilización explícita y carreras siguen separados de candidatos', async () => {
    const actor = await user(), { a, b, candidate } = await orgPair(actor.id), value = randomUUID() + '@example.test';
    const races = await Promise.allSettled([contacts.create({ type: ContactType.EMAIL, value }, actor.id), contacts.create({ type: ContactType.EMAIL, value: ' ' + value.toUpperCase() + ' ' }, actor.id)]);
    const created = races.find(row => row.status === 'fulfilled'); if (created?.status !== 'fulfilled') throw new Error('Debe crear un único medio');
    methodIds.push(created.value.id);
    expect(races.filter(row => row.status === 'fulfilled')).toHaveLength(1);
    expect(races.find(row => row.status === 'rejected')).toMatchObject({ status: 'rejected', reason: { code: 'CONTACT_EMAIL_EXISTS' } });
    const lookup = await contacts.exactEmail(' ' + value.toUpperCase() + ' '); expect(lookup.contact?.id).toBe(created.value.id);
    const existing = await contacts.associate({ organizationId: b.id }, created.value.id, { expectedMethodVersion: 1, notes: 'Contexto original' }, actor.id);
    await detection.dismiss(candidate.id, decision(candidate), actor.id);
    await contacts.associate({ organizationId: a.id }, created.value.id, { expectedMethodVersion: 2, notes: 'Contexto principal' }, actor.id);
    const repeated = await contacts.associate({ organizationId: b.id }, created.value.id, { expectedMethodVersion: 1, notes: 'No sobrescribir' }, actor.id);
    expect(repeated).toMatchObject({ outcome: 'existing', association: { id: existing.association.id, notes: 'Contexto original' } });
    expect(await prisma.contactMethod.count({ where: { normalizedValue: value } })).toBe(1);
    expect((await detection.listActor('organization', a.id, page, actor.id)).items[0].state).toBe('NOT_DUPLICATE');
  });
});
