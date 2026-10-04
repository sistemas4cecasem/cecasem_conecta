import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/config/application';
import { validateEnvironment } from '../src/config/environment';
import { validateDatabaseUrl } from '../src/config/database-url';
import { PrismaService } from '../src/database/prisma.service';
import { UserRole } from '../src/generated/prisma/client';
import { UsersService } from '../src/modules/users/users.service';
import { SessionsService } from '../src/modules/auth/sessions.service';
import { DirectoryService } from '../src/modules/directory/directory.service';
import { PeopleService } from '../src/modules/directory/people.service';
import { CommunicationsService } from '../src/modules/communications/communications.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { ProcessParticipationService } from '../src/modules/relationships/process-participation.service';
import type { CommunicationDto } from '../src/modules/communications/communication.dto';


import { RelationshipProcessesService } from '../src/modules/relationships/relationship-processes.service';
import { ContactRestrictionsService } from '../src/modules/relationships/contact-restrictions.service';



const databaseUrl = validateDatabaseUrl(process.env.DATABASE_URL);
if (!new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('Contexto requiere una base aislada _test.');

describe('Comunicaciones recibidas PostgreSQL/HTTP', () => {
  let app: INestApplication<Server>, prisma: PrismaService, users: UsersService, processes: RelationshipProcessesService;
  const userIds: string[] = [], orgIds: string[] = [], personIds: string[] = [], accountIds: string[] = [];
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ConfigService)
      .useValue(new ConfigService(validateEnvironment({ NODE_ENV: 'test', DATABASE_URL: databaseUrl }))).compile();
    app = module.createNestApplication<INestApplication<Server>>(); configureApplication(app); await app.init();
    prisma = app.get(PrismaService); users = app.get(UsersService); processes = app.get(RelationshipProcessesService);
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await prisma.$transaction([
      prisma.auditEvent.deleteMany({ where: { actorUserId: { in: userIds } } }),
      prisma.communicationRecipient.deleteMany({ where: { communication: { registeredByUserId: { in: userIds } } } }),
      prisma.communication.deleteMany({ where: { registeredByUserId: { in: userIds } } }),
      prisma.relationshipProcessEvent.deleteMany({ where: { process: { createdByUserId: { in: userIds } } } }),
      prisma.processParticipant.deleteMany({ where: { process: { createdByUserId: { in: userIds } } } }),
      prisma.contactRestriction.deleteMany({ where: { registeredByUserId: { in: userIds } } }),
      prisma.relationshipProcess.deleteMany({ where: { createdByUserId: { in: userIds } } }),
      prisma.contactIntent.deleteMany({ where: { authorUserId: { in: userIds } } }),
      prisma.directoryChange.deleteMany({ where: { actorUserId: { in: userIds } } }),
      prisma.personOrganizationRelation.deleteMany({ where: { personId: { in: personIds } } }),
      prisma.person.updateMany({ where: { id: { in: personIds } }, data: { duplicateOfId: null } }),
      prisma.person.deleteMany({ where: { id: { in: personIds } } }),
      prisma.organization.updateMany({ where: { id: { in: orgIds } }, data: { duplicateOfId: null } }),
      prisma.organization.deleteMany({ where: { id: { in: orgIds } } }),
      prisma.userSession.deleteMany({ where: { userId: { in: userIds } } }),
      prisma.userEmailAccount.deleteMany({ where: { userId: { in: userIds } } }),
      prisma.emailAccount.deleteMany({ where: { id: { in: accountIds } } }),
      prisma.user.deleteMany({ where: { id: { in: userIds } } }),
    ]); userIds.length = orgIds.length = personIds.length = accountIds.length = 0;
  });
  afterAll(async () => { await app.close(); });
  async function actor(role: UserRole = UserRole.ADMINISTRATOR) {
    const row = await users.createIdentity({ givenNames: 'QA', familyNames: 'Procesos', role, email: randomUUID() + '@example.test' }); userIds.push(row.id);
    const token = await prisma.$transaction(tx => app.get(SessionsService).create(row.id, tx));
    return { ...row, cookie: 'cecasem_session=' + token };
  }
  async function target(authorId: string, kind: 'organization' | 'person' = 'organization') {
    if (kind === 'organization') { const row = await app.get(DirectoryService).createOrganization({ name: 'Actor QA' }, authorId); orgIds.push(row.id); return { organizationId: row.id }; }
    const row = await app.get(PeopleService).create({ displayName: 'Persona independiente QA' }, authorId); personIds.push(row.id); return { personId: row.id };
  }
  const communications = () => app.get(CommunicationsService);
  const restrictions = () => app.get(ContactRestrictionsService);
  async function fixture(role: UserRole = UserRole.RESEARCH, kind: 'organization' | 'person' = 'organization') {
    const owner = await actor(), writer = await actor(role), goal = await target(owner.id, kind);
    const process = await processes.create({ ...goal, purpose: 'Cooperación institucional' }, owner.id);
    const account = await users.createEmailAccount({ address: randomUUID() + '@example.test', displayName: 'Buzón institucional' }); accountIds.push(account.id);
    await users.assignEmailAccount(owner.id, account.id);
    const input = { sender: 'Fundacion@Example.test', to: [account.address, 'Otra@example.test'], cc: ['Copia@example.test'], bcc: ['Privada@example.test'], subject: '  Propuesta  original ', body: '  Estimada persona\r\n\r\n<script>literal</script>\nFirma https://example.test  ', receivedAt: '2000-01-01T12:00:00-04:00' };
    return { owner, writer, goal, process, account, input };
  }
  function post(cookie: string, id: string, input: object, key = randomUUID()) { return request(app.getHttpServer()).post('/api/v1/relationship-processes/' + id + '/communications/received').set('Cookie', cookie).set('Idempotency-Key', key).send(input); }
  function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
  async function waitingLock(advisory = false) {
    let waiting = false;
    for (let attempt = 0; attempt < 100 && !waiting; attempt++) {
      const rows = await prisma.$queryRaw<{ waiting: boolean }[]>`SELECT EXISTS (SELECT 1 FROM pg_locks WHERE NOT granted AND (${advisory}=false OR classid=1128612693)) AS waiting`; waiting = rows[0].waiting;
    }
    expect(waiting).toBe(true);
  }
  it.each(Object.values(UserRole))('%s registra sin buzón asignado y pasa a participante', async role => {
    const f = await fixture(role), before = await prisma.relationshipProcess.findUniqueOrThrow({ where: { id: f.process.id } });
    expect(await users.assignedEmailAccounts(f.writer.id)).toEqual([]);
    const row = (await post(f.writer.cookie, f.process.id, f.input).expect(201)).body as CommunicationDto;
    expect(row).toMatchObject({ direction: 'RECEIVED', sender: f.input.sender, emailAccount: null, sentAt: null, receivedAt: '2000-01-01T16:00:00.000Z', occurredAt: '2000-01-01T16:00:00.000Z', subject: f.input.subject, bodyOriginal: f.input.body, registeredBy: { id: f.writer.id } });
    expect(row.recipients[0]).toMatchObject({ addressOriginal: f.account.address, emailAccount: { id: f.account.id, displayName: f.account.displayName } });
    expect(row.recipients.map(item => item.type)).toEqual(['TO', 'TO', 'CC', 'BCC']);
    expect(await prisma.processParticipant.findUnique({ where: { processId_userId: { processId: f.process.id, userId: f.writer.id } } })).toMatchObject({ origin: 'RECEIVED_COMMUNICATION' });
    const after = await prisma.relationshipProcess.findUniqueOrThrow({ where: { id: f.process.id } }); expect(after.state).toBe(before.state); expect(after.version).toBe(before.version + 1); expect(after.lastActivityAt.toISOString()).toBe(row.createdAt);
    const audit = await prisma.auditEvent.findMany({ where: { communicationId: row.id } }); expect(audit).toHaveLength(1); expect(audit[0]).toMatchObject({ action: 'RECEIVED_COMMUNICATION_REGISTERED', actorUserId: f.writer.id, processId: f.process.id }); expect(JSON.stringify(audit)).not.toContain(f.input.body);
    await request(app.getHttpServer()).get('/api/v1/communications/' + row.id).set('Cookie', f.owner.cookie).expect(200);
    expect(await prisma.contactMethod.count({ where: { value: f.input.sender } })).toBe(0);
  });
  it('respuesta tardía conserva estado, resultado, cierre y eventos; reapertura explícita posterior', async () => {
    const f = await fixture(); await processes.close(f.process.id, { expectedVersion: 1, result: 'REJECTED', observation: 'Cierre histórico' }, f.owner.id);
    const before = await prisma.relationshipProcess.findUniqueOrThrow({ where: { id: f.process.id } }), events = await prisma.relationshipProcessEvent.findMany({ where: { processId: f.process.id } });
    const row = await communications().registerReceived(f.process.id, f.input, f.writer.id, randomUUID());
    const after = await processes.get(f.process.id, f.writer.id); expect(after).toMatchObject({ state: 'CLOSED', currentResult: 'REJECTED', closureObservation: 'Cierre histórico', closedAt: before.closedAt!.toISOString(), canReopen: true });
    expect(await prisma.relationshipProcessEvent.findMany({ where: { processId: f.process.id } })).toEqual(events);
    expect(+new Date(after.lastActivityAt)).toBeGreaterThanOrEqual(+before.lastActivityAt);
    await processes.reopen(f.process.id, { expectedVersion: after.version, state: 'IN_PROGRESS', reason: 'Respuesta del mismo acercamiento' }, f.writer.id);
    expect((await processes.get(f.process.id, f.writer.id)).state).toBe('IN_PROGRESS'); expect(await communications().get(row.id, f.owner.id)).toEqual(row);
  });
  it.each(['organization', 'person'] as const)('restricción de %s permite recibida y continúa bloqueando enviada', async kind => {
    const f = await fixture(UserRole.RESEARCH, kind), restriction = await restrictions().create({ ...f.goal, reason: 'Solicitud de no contacto' }, f.owner.id);
    await communications().registerReceived(f.process.id, f.input, f.writer.id, randomUUID()); expect((await restrictions().get(restriction.id, f.owner.id)).state).toBe('ACTIVE');
    await users.assignEmailAccount(f.writer.id, f.account.id);
    const { sender: _sender, receivedAt, ...common } = f.input; void _sender;
    await expect(communications().registerSent(f.process.id, { ...common, emailAccountId: f.account.id, sentAt: receivedAt }, f.writer.id, randomUUID())).rejects.toThrow('CONTACT_RESTRICTED');
  });
  it.each([{ sender: 'bad' }, { sender: ' externo@example.test ' }, { sender: 'a'.repeat(255) }, { to: [] }, { cc: null }, { bcc: ['bad'] }, { receivedAt: '2999-01-01T00:00:00Z' }, { receivedAt: '2020-02-30T00:00:00Z' }, { receivedAt: '2020-01-01T00:00:00' }, { body: ' ' }, { subject: ' ' }, { direction: 'SENT' }, { emailAccountId: randomUUID() }, { registeredByUserId: randomUUID() }, { processId: randomUUID() }])('rechaza dato inválido o asignación masiva %j', async patch => { const f = await fixture(); await post(f.writer.cookie, f.process.id, { ...f.input, ...patch }).expect(400); expect(await prisma.communication.count({ where: { processId: f.process.id } })).toBe(0); });
  it('sesión/clave obligatorias, proceso obligatorio y permisos actuales', async () => {
    const f = await fixture(); await post('', f.process.id, f.input).expect(401); await post(f.writer.cookie, randomUUID(), f.input).expect(404);
    await request(app.getHttpServer()).post('/api/v1/relationship-processes/' + f.process.id + '/communications/received').set('Cookie', f.writer.cookie).send(f.input).expect(400);
    await prisma.user.update({ where: { id: f.writer.id }, data: { isActive: false, deactivatedAt: new Date() } }); await expect(communications().registerReceived(f.process.id, f.input, f.writer.id, randomUUID())).rejects.toThrow('FORBIDDEN');
  });
  it('reintentos y dos hechos idénticos reales conservan una primera participación', async () => {
    const f = await fixture(), key = randomUUID(); const rows = await Promise.all([post(f.writer.cookie, f.process.id, f.input, key), post(f.writer.cookie, f.process.id, f.input, key)]); expect(rows.map(row => row.status)).toEqual([201, 201]); expect((rows[0].body as CommunicationDto).id).toBe((rows[1].body as CommunicationDto).id);
    const participant = await prisma.processParticipant.findUniqueOrThrow({ where: { processId_userId: { processId: f.process.id, userId: f.writer.id } } });
    expect((await post(f.writer.cookie, f.process.id, { ...f.input, body: 'Otro' }, key).expect(409)).body as unknown).toMatchObject({ code: 'REQUEST_CONFLICT' });
    const concurrent = await Promise.all([post(f.writer.cookie, f.process.id, f.input), post(f.writer.cookie, f.process.id, f.input)]); expect(concurrent.map(row => row.status)).toEqual([201, 201]); expect(await prisma.communication.count({ where: { processId: f.process.id } })).toBe(3);
    expect(await prisma.processParticipant.findUniqueOrThrow({ where: { processId_userId: { processId: f.process.id, userId: f.writer.id } } })).toEqual(participant);
  });
  it('misma clave no cruza dirección SENT/RECEIVED ni proceso', async () => {
    const f = await fixture(), key = randomUUID(); await communications().registerReceived(f.process.id, f.input, f.writer.id, key); await users.assignEmailAccount(f.writer.id, f.account.id);
    const { sender: _sender, receivedAt, ...common } = f.input; void _sender;
    await expect(communications().registerSent(f.process.id, { ...common, emailAccountId: f.account.id, sentAt: receivedAt }, f.writer.id, key)).rejects.toThrow('REQUEST_CONFLICT');
    const other = await processes.create({ ...f.goal, purpose: 'Otro acercamiento' }, f.owner.id); await expect(communications().registerReceived(other.id, f.input, f.writer.id, key)).rejects.toThrow('REQUEST_CONFLICT');
  });
  it('historia conserva remitente/contacto, destinatario/buzón y registrador inactivo', async () => {
    const f = await fixture(), address = randomUUID() + '@example.test', contact = await prisma.contactMethod.create({ data: { type: 'EMAIL', value: address, normalizedValue: address } });
    try {
      const row = await communications().registerReceived(f.process.id, { ...f.input, sender: address }, f.writer.id, randomUUID()); const other = randomUUID() + '@example.test';
      await prisma.contactMethod.update({ where: { id: contact.id }, data: { value: other, normalizedValue: other } }); await prisma.emailAccount.update({ where: { id: f.account.id }, data: { address: randomUUID() + '@example.test', displayName: 'Renombrado', isActive: false } });
      await users.withLockedCredentials(f.owner.id, async (_current, tx) => { await users.setMailboxLocked(f.owner.id, f.account.id, false, tx); });
      await prisma.user.update({ where: { id: f.writer.id }, data: { isActive: false, deactivatedAt: new Date() } });
      expect(await communications().get(row.id, f.owner.id)).toEqual({ ...row, registeredBy: { ...row.registeredBy, isActive: false } });
    } finally { await prisma.contactMethod.delete({ where: { id: contact.id } }); }
  });
  it.each(['audit', 'participation', 'activity'])('fallo en %s revierte todo incluso en proceso cerrado', async stage => {
    const f = await fixture(); await processes.close(f.process.id, { expectedVersion: 1, result: 'REJECTED' }, f.owner.id); const before = await prisma.relationshipProcess.findUniqueOrThrow({ where: { id: f.process.id } });
    if (stage === 'audit') jest.spyOn(app.get(AuditService), 'recordReceivedCommunication').mockRejectedValue(new Error('QA rollback')); else if (stage === 'participation') jest.spyOn(app.get(ProcessParticipationService), 'ensureParticipant').mockRejectedValue(new Error('QA rollback')); else jest.spyOn(processes, 'recordCommunicationActivity').mockRejectedValue(new Error('QA rollback'));
    await expect(communications().registerReceived(f.process.id, f.input, f.writer.id, randomUUID())).rejects.toThrow('QA rollback'); expect(await prisma.communication.count({ where: { processId: f.process.id } })).toBe(0); expect(await prisma.processParticipant.count({ where: { userId: f.writer.id } })).toBe(0); expect(await prisma.relationshipProcess.findUniqueOrThrow({ where: { id: f.process.id } })).toEqual(before);
  });
  it.each(['patch', 'put', 'delete'] as const)('%s no permite reescribir históricos', async method => { const f = await fixture(), row = await communications().registerReceived(f.process.id, f.input, f.writer.id, randomUUID()); await request(app.getHttpServer())[method]('/api/v1/communications/' + row.id).set('Cookie', f.owner.cookie).send({ sender: 'otro@example.test' }).expect(404); expect(await communications().get(row.id, f.owner.id)).toEqual(row); });
  it('listado mixto usa fecha real y proyección de antecedentes incluye ambas direcciones/direcciones involucradas', async () => {
    const f = await fixture(), received = await communications().registerReceived(f.process.id, f.input, f.writer.id, randomUUID());
    const sent = await communications().registerSent(f.process.id, { emailAccountId: f.account.id, to: [f.input.sender], cc: [], bcc: [], subject: 'Salida previa', body: 'Original', sentAt: '1999-01-01T00:00:00Z' }, f.owner.id, randomUUID());
    const list = await communications().list(f.process.id, { page: 1, pageSize: 25 }, f.owner.id); expect(list.items.map(row => row.id)).toEqual([received.id, sent.id]);
    const before = await prisma.relationshipProcess.findUniqueOrThrow({ where: { id: f.process.id } });
    await prisma.$transaction(async tx => { const projection = await communications().historyForProcess(f.process.id, tx); expect(projection).toMatchObject({ exists: true, total: 2, lastOccurredAt: received.receivedAt }); expect(projection.items[0].recipients[0].addressOriginal).toBe(f.account.address); expect((await communications().recentByInvolvedAddress(f.input.sender, tx)).map(row => row.id)).toEqual([received.id, sent.id]); });
    expect(await prisma.relationshipProcess.findUniqueOrThrow({ where: { id: f.process.id } })).toEqual(before);
  });
  it('buzón desactivado y destinatario desconocido nunca impiden documentar recepción', async () => { const f = await fixture(); await prisma.emailAccount.update({ where: { id: f.account.id }, data: { isActive: false } }); const row = await communications().registerReceived(f.process.id, { ...f.input, sender: 'İ@Example.test', to: [f.account.address, 'Desconocida@Example.test'] }, f.writer.id, randomUUID()); expect(row.recipients[1].emailAccount).toBeNull(); expect(row.sender).toBe('İ@Example.test'); });
  it.each(['close', 'reopen'])('%s primero y recibida después conservan ambos hechos', async operation => {
    const f = await fixture(); if (operation === 'reopen') await processes.close(f.process.id, { expectedVersion: 1, result: 'REJECTED' }, f.owner.id);
    const gate = deferred(), ready = deferred(), original = app.get(AuditService).recordProcess.bind(app.get(AuditService));
    const paused = async (...args: Parameters<AuditService['recordProcess']>) => { const result = await original(...args); ready.resolve(); await gate.promise; return result; }; jest.spyOn(app.get(AuditService), 'recordProcess').mockImplementation(paused as unknown as AuditService['recordProcess']);
    const changing = operation === 'close' ? processes.close(f.process.id, { expectedVersion: 1, result: 'REJECTED' }, f.owner.id) : processes.reopen(f.process.id, { expectedVersion: 2, state: 'IN_PROGRESS', reason: 'Respuesta tardía' }, f.owner.id); await ready.promise;
    const receiving = communications().registerReceived(f.process.id, f.input, f.writer.id, randomUUID()); try { await waitingLock(); } finally { gate.resolve(); } await changing; const row = await receiving; expect((await processes.get(f.process.id, f.owner.id)).state).toBe(operation === 'close' ? 'CLOSED' : 'IN_PROGRESS'); expect(await communications().get(row.id, f.owner.id)).toEqual(row);
  });
  it.each(['close', 'reopen'])('recibida primero protege versión y %s se confirma explícitamente tras actualizar', async operation => {
    const f = await fixture(); if (operation === 'reopen') await processes.close(f.process.id, { expectedVersion: 1, result: 'REJECTED' }, f.owner.id);
    const gate = deferred(), ready = deferred(), original = app.get(AuditService).recordReceivedCommunication.bind(app.get(AuditService)); jest.spyOn(app.get(AuditService), 'recordReceivedCommunication').mockImplementation(async (...args) => { const result = await original(...args); ready.resolve(); await gate.promise; return result; });
    const receiving = communications().registerReceived(f.process.id, f.input, f.writer.id, randomUUID()); await ready.promise;
    const change = (version: number) => operation === 'close' ? processes.close(f.process.id, { expectedVersion: version, result: 'REJECTED' }, f.owner.id) : processes.reopen(f.process.id, { expectedVersion: version, state: 'IN_PROGRESS', reason: 'Mismo acercamiento' }, f.owner.id);
    const changing = change(operation === 'close' ? 1 : 2).then(() => 'UNEXPECTED', (error: Error) => error.message); try { await waitingLock(); } finally { gate.resolve(); } const row = await receiving; expect(await changing).toBe('VERSION_CONFLICT'); await change(operation === 'close' ? 2 : 3); expect(await communications().get(row.id, f.owner.id)).toEqual(row);
  });
  it('desactivación primero se revalida después de esperar el lock', async () => {
    const f = await fixture(), gate = deferred(), ready = deferred(); const deactivating = users.withLockedCredentials(f.writer.id, async (_current, tx) => { await users.deactivateLocked(f.writer.id, tx); ready.resolve(); await gate.promise; }); await ready.promise;
    const receiving = communications().registerReceived(f.process.id, f.input, f.writer.id, randomUUID()).then(() => 'UNEXPECTED', (error: Error) => error.message); try { await waitingLock(); } finally { gate.resolve(); } await deactivating; expect(await receiving).toBe('FORBIDDEN'); expect(await prisma.communication.count({ where: { processId: f.process.id } })).toBe(0);
  });
});
