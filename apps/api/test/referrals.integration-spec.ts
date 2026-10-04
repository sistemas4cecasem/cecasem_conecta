import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/config/application';
import { validateEnvironment } from '../src/config/environment';
import { validateDatabaseUrl } from '../src/config/database-url';
import { PrismaService } from '../src/database/prisma.service';
import { Prisma, UserRole } from '../src/generated/prisma/client';
import { UsersService } from '../src/modules/users/users.service';
import { SessionsService } from '../src/modules/auth/sessions.service';
import { RelationshipProcessesService } from '../src/modules/relationships/relationship-processes.service';
import { CommunicationsService } from '../src/modules/communications/communications.service';
import { CommunicationAmendmentsService } from '../src/modules/communications/communication-amendments.service';
import { ReferralsService } from '../src/modules/referrals/referrals.service';
import { DirectoryActorPolicy } from '../src/modules/directory/directory-actor.policy';
import { DuplicateDetectionService } from '../src/modules/directory/duplicate-detection.service';
import { ConsolidationService } from '../src/modules/directory/consolidation.service';
import { AuditService } from '../src/modules/audit/audit.service';
import type { ReferralDto, ReferralPageDto } from '../src/modules/referrals/referral.dto';
const databaseUrl = validateDatabaseUrl(process.env.DATABASE_URL);
if (!new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('Derivaciones requieren base aislada _test.');
describe('Derivaciones PostgreSQL/HTTP', () => {
  let app: INestApplication<Server>, prisma: PrismaService, service: ReferralsService;
  const users: string[] = [], organizations: string[] = [], people: string[] = [], methods: string[] = [], accounts: string[] = [];
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ConfigService).useValue(new ConfigService(validateEnvironment({ NODE_ENV: 'test', DATABASE_URL: databaseUrl }))).compile();
    app = module.createNestApplication<INestApplication<Server>>(); configureApplication(app); await app.init(); prisma = app.get(PrismaService); service = app.get(ReferralsService);
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    const candidateWhere = { OR: [{ organizationAId: { in: organizations } }, { organizationBId: { in: organizations } }, { personAId: { in: people } }, { personBId: { in: people } }] };
    const candidates = await prisma.duplicateCandidate.findMany({ where: candidateWhere, select: { id: true } });
    await prisma.$transaction([
      prisma.auditEvent.deleteMany({ where: { actorUserId: { in: users } } }), prisma.referral.deleteMany({ where: { createdByUserId: { in: users } } }),
      prisma.duplicateReconciliation.deleteMany({ where: { candidateId: { in: candidates.map(row => row.id) } } }), prisma.duplicateCandidate.deleteMany({ where: candidateWhere }),
      prisma.directoryChange.deleteMany({ where: { actorUserId: { in: users } } }),
      prisma.communicationAmendment.deleteMany({ where: { authorUserId: { in: users } } }), prisma.communicationRecipient.deleteMany({ where: { communication: { registeredByUserId: { in: users } } } }),
      prisma.communication.deleteMany({ where: { registeredByUserId: { in: users } } }), prisma.relationshipProcessEvent.deleteMany({ where: { actorUserId: { in: users } } }),
      prisma.processParticipant.deleteMany({ where: { userId: { in: users } } }), prisma.relationshipProcess.deleteMany({ where: { createdByUserId: { in: users } } }),
      prisma.personContact.deleteMany({ where: { personId: { in: people } } }), prisma.organizationContact.deleteMany({ where: { organizationId: { in: organizations } } }),
      prisma.personOrganizationRelation.deleteMany({ where: { personId: { in: people } } }), prisma.contactMethod.deleteMany({ where: { id: { in: methods } } }),
      prisma.person.updateMany({ where: { id: { in: people } }, data: { duplicateOfId: null } }), prisma.person.deleteMany({ where: { id: { in: people } } }),
      prisma.organization.updateMany({ where: { id: { in: organizations } }, data: { duplicateOfId: null } }), prisma.organization.deleteMany({ where: { id: { in: organizations } } }),
      prisma.userEmailAccount.deleteMany({ where: { userId: { in: users } } }), prisma.emailAccount.deleteMany({ where: { id: { in: accounts } } }),
      prisma.userSession.deleteMany({ where: { userId: { in: users } } }), prisma.user.deleteMany({ where: { id: { in: users } } }),
    ]); users.length = organizations.length = people.length = methods.length = accounts.length = 0;
  });
  afterAll(async () => { await app.close(); });
  async function actor(role: UserRole = UserRole.RESEARCH) {
    const user = await app.get(UsersService).createIdentity({ givenNames: 'QA', familyNames: 'Derivaciones', role, email: randomUUID() + '@example.test' }); users.push(user.id);
    const token = await prisma.$transaction(tx => app.get(SessionsService).create(user.id, tx)); return { ...user, cookie: 'cecasem_session=' + token };
  }
  async function organization() { const row = await prisma.organization.create({ data: { name: 'Fundación QA ' + randomUUID() } }); organizations.push(row.id); return row; }
  async function person() { const row = await prisma.person.create({ data: { displayName: 'María QA ' + randomUUID() } }); people.push(row.id); return row; }
  async function fixture() {
    const owner = await actor(UserRole.ADMINISTRATOR), writer = await actor(), org = await organization();
    const process = await app.get(RelationshipProcessesService).create({ organizationId: org.id, purpose: 'Continuidad institucional' }, owner.id);
    const account = await app.get(UsersService).createEmailAccount({ address: randomUUID() + '@example.test', displayName: 'Cuenta QA' }); accounts.push(account.id);
    const source = await app.get(CommunicationsService).registerReceived(process.id, { sender: 'fundacion@example.test', to: [account.address], cc: [], bcc: [], subject: 'Contacto recomendado', body: 'Contacten a María de Fundación X al correo Maria@Example.org.', receivedAt: '2000-01-01T12:00:00Z' }, owner.id, randomUUID());
    return { owner, writer, org, process, source };
  }
  const body = { recommendedName: 'María', organizationNameSnapshot: 'Fundación X', mediumType: 'EMAIL' as const, mediumValue: 'Maria@Example.org' };
  function post(cookie: string, sourceId: string, payload: object = body, key = randomUUID()) { return request(app.getHttpServer()).post('/api/v1/communications/' + sourceId + '/referrals').set('Cookie', cookie).set('Idempotency-Key', key).send(payload); }
  async function invalidate(sourceId: string, actorId: string) { return app.get(CommunicationAmendmentsService).create(sourceId, 'INVALIDATION', 'Registro incorrecto', actorId, randomUUID()); }
  it.each(Object.values(UserRole))('%s crea y consulta recomendaciones de otro usuario', async role => {
    const f = await fixture(), other = await actor(role), response = await post(f.writer.cookie, f.source.id, { ...body, organizationId: f.org.id }).expect(201), row = response.body as ReferralDto;
    expect(row.person).toBeNull(); expect(row.mediumValue).toBe('Maria@Example.org');
    await request(app.getHttpServer()).get('/api/v1/referrals/' + row.id).set('Cookie', other.cookie).expect(200);
    await post(other.cookie, f.source.id, { recommendedName: 'Juan del área de proyectos' }).expect(201);
    const list = await request(app.getHttpServer()).get('/api/v1/communications/' + f.source.id + '/referrals').set('Cookie', other.cookie).expect(200);
    expect((list.body as ReferralPageDto).total).toBe(2); expect(list.headers['cache-control']).toBe('no-store'); expect(await prisma.person.count({ where: { id: { in: people } } })).toBe(0);
  });
  it('no modifica original, fingerprint, participantes, estado, versión ni actividad', async () => {
    const f = await fixture(), before = await prisma.relationshipProcess.findUniqueOrThrow({ where: { id: f.process.id } }), original = await prisma.communication.findUniqueOrThrow({ where: { id: f.source.id } });
    await post(f.writer.cookie, f.source.id).expect(201);
    expect(await prisma.relationshipProcess.findUnique({ where: { id: f.process.id } })).toEqual(before);
    expect(await prisma.communication.findUnique({ where: { id: f.source.id } })).toEqual(original);
    expect(await prisma.processParticipant.count({ where: { processId: f.process.id, userId: f.writer.id } })).toBe(0);
  });
  it('dos comandos concurrentes deduplican; cambiar payload u origen con la key da 409', async () => {
    const f = await fixture(), key = randomUUID(), [a, b] = await Promise.all([post(f.writer.cookie, f.source.id, body, key), post(f.writer.cookie, f.source.id, body, key)]);
    expect(a.status).toBe(201); expect(b.status).toBe(201); expect(b.body).toEqual(a.body);
    await post(f.writer.cookie, f.source.id, { recommendedName: 'Otro' }, key).expect(409);
    await post(f.writer.cookie, randomUUID(), body, key).expect(409);
    expect(await prisma.auditEvent.count({ where: { action: 'REFERRAL_CREATED', actorUserId: f.writer.id } })).toBe(1);
  });
  it('repetir contacto con otra key o comunicación es legítimo', async () => {
    const f = await fixture(); await post(f.writer.cookie, f.source.id).expect(201); await post(f.writer.cookie, f.source.id).expect(201);
    expect(await prisma.referral.count({ where: { sourceCommunicationId: f.source.id } })).toBe(2);
  });
  it('invalidación posterior conserva lectura y retry, pero rechaza nuevas derivaciones', async () => {
    const f = await fixture(), key = randomUUID(), response = await post(f.writer.cookie, f.source.id, body, key).expect(201);
    await invalidate(f.source.id, f.owner.id); await post(f.writer.cookie, f.source.id, body, key).expect(201); await post(f.writer.cookie, f.source.id).expect(409);
    const result = await request(app.getHttpServer()).get('/api/v1/referrals/' + (response.body as ReferralDto).id).set('Cookie', f.writer.cookie).expect(200);
    expect((result.body as ReferralDto).source.validity).toBe('INVALIDATED');
  });
  it('autenticación, sesión revocada, inactivo y capability ausente se rechazan', async () => {
    const f = await fixture(); await request(app.getHttpServer()).get('/api/v1/communications/' + f.source.id + '/referrals').expect(401);
    const identity = jest.spyOn(app.get(UsersService), 'findIdentityById').mockResolvedValue({ ...f.writer, role: 'UNKNOWN' as UserRole });
    await expect(service.list(f.source.id, { page: 1, pageSize: 25 }, f.writer.id)).rejects.toMatchObject({ code: 'FORBIDDEN' }); identity.mockRestore();
    await prisma.userSession.updateMany({ where: { userId: f.writer.id }, data: { revokedAt: new Date() } }); await post(f.writer.cookie, f.source.id).expect(401);
    await prisma.user.update({ where: { id: f.writer.id }, data: { isActive: false, deactivatedAt: new Date() } });
    await expect(service.create(f.source.id, body, f.writer.id, randomUUID())).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('origen y referencias inexistentes, UUID inválido, blancos y campos extras se rechazan', async () => {
    const f = await fixture(); await post(f.writer.cookie, randomUUID()).expect(404); await post(f.writer.cookie, 'no-uuid').expect(400);
    for (const payload of [{}, { recommendedName: '   ' }, { notes: 'Solo nota' }, { ...body, createdByUserId: f.owner.id }, { ...body, mediumValue: 'inválido' }]) await post(f.writer.cookie, f.source.id, payload).expect(400);
    for (const field of ['personId', 'organizationId', 'contactMethodId']) await post(f.writer.cookie, f.source.id, { ...body, [field]: randomUUID() }).expect(409);
    await request(app.getHttpServer()).get('/api/v1/referrals/' + randomUUID()).set('Cookie', f.writer.cookie).expect(404);
  });
  it('snapshots sobreviven a inactivación, consolidación, cambios de vínculo y medio no utilizable', async () => {
    const f = await fixture(), p = await person(), principal = await organization();
    const relation = await prisma.personOrganizationRelation.create({ data: { personId: p.id, organizationId: f.org.id, positionTitle: 'Proyectos' } });
    const method = await prisma.contactMethod.create({ data: { type: 'EMAIL', value: 'maria@example.org', normalizedValue: 'maria@example.org' } }); methods.push(method.id);
    await prisma.personContact.create({ data: { personId: p.id, contactMethodId: method.id } });
    const response = await post(f.writer.cookie, f.source.id, { ...body, personId: p.id, organizationId: f.org.id, contactMethodId: method.id, recommendedRole: 'Proyectos' }).expect(201), id = (response.body as ReferralDto).id;
    await prisma.person.update({ where: { id: p.id }, data: { displayName: 'Nombre corregido', isActive: false } });
    await prisma.organization.update({ where: { id: f.org.id }, data: { duplicateOfId: principal.id, isActive: false } });
    await prisma.contactMethod.update({ where: { id: method.id }, data: { condition: 'UNUSABLE' } });
    await prisma.personOrganizationRelation.update({ where: { id: relation.id }, data: { positionTitle: 'Otro cargo', isCurrent: false } });
    const result = await service.get(id, f.writer.id); expect(result).toMatchObject({ ...body, recommendedRole: 'Proyectos', person: { isActive: false }, organization: { currentId: principal.id }, contactMethod: { condition: 'UNUSABLE' } });
    expect(await prisma.referral.count({ where: { id } })).toBe(1);
  });
  it('admite persona inactiva con vínculo y rechaza vínculo de medio incompatible', async () => {
    const f = await fixture(), p = await person(), other = await person();
    await prisma.person.update({ where: { id: p.id }, data: { isActive: false } }); await prisma.personOrganizationRelation.create({ data: { personId: p.id, organizationId: f.org.id } });
    await post(f.writer.cookie, f.source.id, { personId: p.id }).expect(201);
    const method = await prisma.contactMethod.create({ data: { type: 'EMAIL', value: 'maria@example.org', normalizedValue: 'maria@example.org' } }); methods.push(method.id);
    await prisma.personContact.create({ data: { personId: other.id, contactMethodId: method.id } });
    await post(f.writer.cookie, f.source.id, { ...body, personId: p.id, contactMethodId: method.id }).expect(409);
  });
  it.each(['organization', 'person'] as const)('consolidación pública real de %s conserva FK histórica y resuelve principal', async kind => {
    const f = await fixture(), a = kind === 'organization' ? await organization() : await person(), b = kind === 'organization' ? await organization() : await person();
    if (kind === 'organization') { await prisma.organization.update({ where: { id: a.id }, data: { name: 'Fundación Derivación' } }); await prisma.organization.update({ where: { id: b.id }, data: { name: 'Fundacion Derivacion' } }); }
    else { await prisma.person.update({ where: { id: a.id }, data: { displayName: 'María Derivación' } }); await prisma.person.update({ where: { id: b.id }, data: { displayName: 'Maria Derivacion' } }); }
    const row = await service.create(f.source.id, { recommendedName: 'Nombre recibido original', ...(kind === 'organization' ? { organizationId: b.id } : { personId: b.id }) }, f.writer.id, randomUUID());
    const candidate = (await app.get(DuplicateDetectionService).listActor(kind, a.id, { page: 1, pageSize: 100 }, f.owner.id)).items.find(item => item.a.id === b.id || item.b.id === b.id)!;
    expect(candidate).toBeDefined(); const consolidation = app.get(ConsolidationService), preview = await consolidation.preview(candidate.id, a.id, f.owner.id);
    await consolidation.consolidate(candidate.id, { principalId: a.id, expectedCandidateVersion: candidate.version, expectedVersionA: candidate.a.version, expectedVersionB: candidate.b.version, previewToken: preview.previewToken, confirmed: true, reconcileCurrentRelations: true, contactConflictPolicy: 'KEEP_PRINCIPAL_CONTEXT' }, f.owner.id);
    const current = await service.get(row.id, f.writer.id); expect(current.recommendedName).toBe('Nombre recibido original');
    expect(kind === 'organization' ? current.organization : current.person).toMatchObject({ id: b.id, currentId: a.id });
  });
  it('fallo de auditoría revierte la derivación completa', async () => {
    const f = await fixture(); jest.spyOn(app.get(AuditService), 'recordReferral').mockRejectedValue(new Error('Fallo controlado'));
    await expect(service.create(f.source.id, body, f.writer.id, randomUUID())).rejects.toThrow(); expect(await prisma.referral.count({ where: { sourceCommunicationId: f.source.id } })).toBe(0);
  });
  it('restricciones SQL protegen FKs, mínimo, medio y snapshots inmutables', async () => {
    const f = await fixture(), data = { sourceCommunicationId: f.source.id, createdByUserId: f.writer.id, requestKey: randomUUID(), requestFingerprint: 'a'.repeat(64) };
    await expect(prisma.referral.create({ data })).rejects.toThrow(); await expect(prisma.referral.create({ data: { ...data, recommendedName: ' ' } })).rejects.toThrow();
    await expect(prisma.referral.create({ data: { ...data, mediumType: 'EMAIL' } })).rejects.toThrow();
    await expect(prisma.referral.create({ data: { ...data, recommendedName: 'Juan', personId: randomUUID() } })).rejects.toThrow();
    const row = await service.create(f.source.id, body, f.writer.id, randomUUID()); await expect(prisma.referral.update({ where: { id: row.id }, data: { recommendedName: 'Modificado' } })).rejects.toThrow();
    await expect(prisma.auditEvent.updateMany({ where: { referralId: row.id }, data: { actorUserId: f.owner.id } })).rejects.toThrow();
    await request(app.getHttpServer()).patch('/api/v1/referrals/' + row.id).set('Cookie', f.writer.cookie).send({ recommendedName: 'Otro' }).expect(404);
    await request(app.getHttpServer()).delete('/api/v1/referrals/' + row.id).set('Cookie', f.writer.cookie).expect(404);
  });
  it('paginación y timeline estable incluyen el origen sin otorgar participación', async () => {
    const f = await fixture(); for (let i = 0; i < 3; i++) await service.create(f.source.id, { recommendedName: 'Recomendado ' + i }, f.writer.id, randomUUID());
    const first = await service.list(f.source.id, { page: 1, pageSize: 2 }, f.writer.id), second = await service.list(f.source.id, { page: 2, pageSize: 2 }, f.writer.id);
    expect(first.total).toBe(3); expect(new Set([...first.items, ...second.items].map(row => row.id)).size).toBe(3);
    const ids: string[] = []; let after: string | null = null;
    do { const result = await request(app.getHttpServer()).get('/api/v1/relationship-processes/' + f.process.id + '/timeline?pageSize=1' + (after ? '&after=' + after : '')).set('Cookie', f.writer.cookie).expect(200);
      const page = result.body as { items: { id: string; kind: string }[]; nextCursor: string | null }; ids.push(...page.items.filter(item => item.kind === 'REFERRAL_CREATED').map(item => item.id)); after = page.nextCursor;
    } while (after);
    expect(new Set(ids).size).toBe(3); expect(ids).toHaveLength(3);
  });
  it('1000 derivaciones mantienen lista paginada y consultas constantes sin N+1', async () => {
    const f = await fixture(), p = await person();
    await service.create(f.source.id, { recommendedName: 'María', personId: p.id, organizationId: f.org.id }, f.writer.id, randomUUID());
    const spy = jest.spyOn(Client.prototype, 'query');
    const queryText = (value: unknown) => typeof value === 'string' ? value : value && typeof value === 'object' && 'text' in value ? String(value.text) : '';
    const count = () => spy.mock.calls.filter(([value]) => /^SELECT/i.test(queryText(value))).length;
    await service.list(f.source.id, { page: 1, pageSize: 25 }, f.writer.id); const baseline = count();
    await prisma.referral.createMany({ data: Array.from({ length: 999 }, () => ({ sourceCommunicationId: f.source.id, createdByUserId: f.writer.id, personId: p.id, organizationId: f.org.id, recommendedName: 'María', requestKey: randomUUID(), requestFingerprint: 'a'.repeat(64) })) });
    spy.mockClear(); const result = await service.list(f.source.id, { page: 1, pageSize: 25 }, f.writer.id);
    expect(result.total).toBe(1000); expect(result.items).toHaveLength(25); expect(count()).toBe(baseline);
    expect(result.items.every(row => row.person?.id === p.id && row.organization?.id === f.org.id)).toBe(true);
  });
  function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
  async function raceBeforeCreate(change: (tx: Prisma.TransactionClient) => Promise<unknown>, create: () => Promise<unknown>) {
    const entered = deferred(), release = deferred();
    const changing = prisma.$transaction(async tx => { await change(tx); entered.resolve(); await release.promise; });
    await entered.promise;
    const registering = create();
    const deadline = Date.now() + 3000;
    try {
      let blocked = false;
      while (Date.now() < deadline) {
        const [{ count }] = await prisma.$queryRaw<{ count: bigint }[]>`SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`;
        if (Number(count) > 0) { blocked = true; break; }
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      expect(blocked).toBe(true);
    } finally { release.resolve(); }
    await changing; return registering;
  }
  it('invalidación concurrente se serializa antes del registro y no inserta', async () => {
    const f = await fixture();
    const result = await raceBeforeCreate(async tx => {
      await tx.$queryRaw`SELECT id FROM "Communication" WHERE id=${f.source.id}::uuid FOR UPDATE`;
      await tx.communicationAmendment.create({ data: { communicationId: f.source.id, type: 'INVALIDATION', content: 'Inválida', authorUserId: f.owner.id, requestKey: randomUUID(), requestFingerprint: 'a'.repeat(64) } });
      await tx.communication.update({ where: { id: f.source.id }, data: { validity: 'INVALIDATED', version: 2 } });
    }, () => service.create(f.source.id, body, f.writer.id, randomUUID()).catch(error => error as unknown));
    expect(result).toMatchObject({ code: 'REFERRAL_SOURCE_INVALIDATED' }); expect(await prisma.referral.count({ where: { sourceCommunicationId: f.source.id } })).toBe(0);
  });
  it('desactivación concurrente se revalida dentro de la transacción', async () => {
    const f = await fixture(); const result = await raceBeforeCreate(tx => tx.user.update({ where: { id: f.writer.id }, data: { isActive: false, deactivatedAt: new Date() } }), () => service.create(f.source.id, body, f.writer.id, randomUUID()).catch(error => error as unknown));
    expect(result).toMatchObject({ code: 'FORBIDDEN' });
  });
  it('consolidación concurrente de persona impide nueva referencia al duplicado', async () => {
    const f = await fixture(), p = await person(), principal = await person();
    const result = await raceBeforeCreate(async tx => { await app.get(DirectoryActorPolicy).lock(tx, true); await tx.person.update({ where: { id: p.id }, data: { duplicateOfId: principal.id, isActive: false } }); }, () => service.create(f.source.id, { personId: p.id }, f.writer.id, randomUUID()).catch(error => error as unknown));
    expect(result).toMatchObject({ code: 'REFERRAL_REFERENCE_UNAVAILABLE' });
  });
  it('invalidación concurrente del medio impide vincularlo como vigente', async () => {
    const f = await fixture(), method = await prisma.contactMethod.create({ data: { type: 'EMAIL', value: 'maria@example.org', normalizedValue: 'maria@example.org' } }); methods.push(method.id);
    const result = await raceBeforeCreate(tx => tx.contactMethod.update({ where: { id: method.id }, data: { condition: 'UNUSABLE' } }), () => service.create(f.source.id, { ...body, contactMethodId: method.id }, f.writer.id, randomUUID()).catch(error => error as unknown));
    expect(result).toMatchObject({ code: 'REFERRAL_REFERENCE_UNAVAILABLE' });
  });
});
