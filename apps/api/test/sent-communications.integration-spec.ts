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

describe('Comunicaciones enviadas PostgreSQL/HTTP', () => {
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
    await users.assignEmailAccount(writer.id, account.id);
    const input = { emailAccountId: account.id, to: ['Nueva@Example.test', 'Otra@example.test'], cc: ['Copia@example.test'], bcc: ['Privada@example.test'], subject: '  Propuesta  original ', body: '  Estimada persona\r\n\r\n<script>literal</script>\nFirma https://example.test  ', sentAt: '2000-01-01T12:00:00-04:00' };
    return { owner, writer, goal, process, account, input };
  }
  function post(cookie: string, id: string, input: object, key = randomUUID()) { return request(app.getHttpServer()).post('/api/v1/relationship-processes/' + id + '/communications/sent').set('Cookie', cookie).set('Idempotency-Key', key).send(input); }
  function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
  async function waitingLock(advisory = false) {
    let waiting = false;
    for (let attempt = 0; attempt < 100 && !waiting; attempt++) {
      const rows = await prisma.$queryRaw<{ waiting: boolean }[]>`SELECT EXISTS (SELECT 1 FROM pg_locks WHERE NOT granted AND (${advisory}=false OR classid=1128612693)) AS waiting`; waiting = rows[0].waiting;
    }
    expect(waiting).toBe(true);
  }
  it.each(Object.values(UserRole))('%s registra en proceso ajeno y pasa a participante formal', async role => {
    const f = await fixture(role), before = await prisma.relationshipProcess.findUniqueOrThrow({ where: { id: f.process.id } });
    const row = (await post(f.writer.cookie, f.process.id, f.input).expect(201)).body as CommunicationDto;
    expect(row).toMatchObject({ processId: f.process.id, direction: 'SENT', validity: 'VALID', version: 1, sender: f.account.address, bodyOriginal: f.input.body, subject: f.input.subject, sentAt: '2000-01-01T16:00:00.000Z', registeredBy: { id: f.writer.id } });
    expect(row.recipients.map(item => [item.type, item.addressOriginal, item.normalizedAddress, item.position])).toEqual([['TO', 'Nueva@Example.test', 'nueva@example.test', 0], ['TO', 'Otra@example.test', 'otra@example.test', 1], ['CC', 'Copia@example.test', 'copia@example.test', 0], ['BCC', 'Privada@example.test', 'privada@example.test', 0]]);
    const after = await prisma.relationshipProcess.findUniqueOrThrow({ where: { id: f.process.id } }); expect(after.state).toBe(before.state); expect(after.version).toBe(before.version + 1); expect(+after.lastActivityAt).toBeGreaterThanOrEqual(+before.lastActivityAt); expect(after.lastActivityAt.toISOString()).toBe(row.createdAt);
    expect(await prisma.processParticipant.findUnique({ where: { processId_userId: { processId: f.process.id, userId: f.writer.id } } })).toMatchObject({ origin: 'SENT_COMMUNICATION' });
    const audits = await prisma.auditEvent.findMany({ where: { communicationId: row.id } });
    expect(audits).toHaveLength(1); expect(audits[0]).toMatchObject({ action: 'SENT_COMMUNICATION_REGISTERED', actorUserId: f.writer.id, communicationId: row.id }); expect(audits[0].operationId).toMatch(/^[0-9a-f-]{36}$/);
    const read = (await request(app.getHttpServer()).get('/api/v1/communications/' + row.id).set('Cookie', f.owner.cookie).expect(200)).body as CommunicationDto; expect(read).toEqual(row); expect(JSON.stringify(read)).not.toMatch(/requestFingerprint|requestKey|passwordHash/);
    expect(await prisma.contactMethod.count({ where: { value: 'Nueva@Example.test' } })).toBe(0);
  });
  it('buzones operativos solo activos asignados y sin campos administrativos', async () => {
    const f = await fixture(), other = await users.createEmailAccount({ address: randomUUID() + '@example.test', displayName: 'Ajeno' }); accountIds.push(other.id);
    const url = '/api/v1/me/email-accounts'; const own = await request(app.getHttpServer()).get(url).set('Cookie', f.writer.cookie).expect(200);
    expect(own.body as unknown).toEqual([{ id: f.account.id, address: f.account.address, displayName: f.account.displayName }]); expect((await request(app.getHttpServer()).get(url).set('Cookie', f.owner.cookie).expect(200)).body as unknown).toEqual([]);
    await post(f.writer.cookie, f.process.id, { ...f.input, emailAccountId: other.id }).expect(409);
    await prisma.emailAccount.update({ where: { id: f.account.id }, data: { isActive: false } }); expect((await request(app.getHttpServer()).get(url).set('Cookie', f.writer.cookie).expect(200)).body as unknown).toEqual([]); expect((await post(f.writer.cookie, f.process.id, f.input).expect(409)).body as unknown).toMatchObject({ code: 'MAILBOX_UNAVAILABLE' });
  });
  it.each([{ to: [] }, { to: ['bad'] }, { cc: null }, { bcc: ['bad'] }, { sentAt: '2999-01-01T00:00:00Z' }, { sentAt: '2020-02-30T00:00:00Z' }, { sentAt: '2020-01-01T00:00:00' }, { subject: ' ' }, { body: ' ' }, { sender: 'fake@example.test' }, { registeredByUserId: randomUUID() }, { createdAt: '2000-01-01' }, { validity: 'VALID' }])('DTO rechaza datos inválidos o asignación masiva %j', async patch => {
    const f = await fixture(); await post(f.writer.cookie, f.process.id, { ...f.input, ...patch }).expect(400); expect(await prisma.communication.count({ where: { processId: f.process.id } })).toBe(0);
  });
  it('admite cuerpo sobre 100 KB, destinatarios externos repetidos y opcionales omitidos', async () => {
    const f = await fixture(), { cc: _cc, bcc: _bcc, ...input } = f.input; void _cc; void _bcc;
    const row = (await post(f.writer.cookie, f.process.id, { ...input, to: ['Nueva@Example.test', 'Nueva@Example.test'], body: 'Texto\n'.repeat(20000) }).expect(201)).body as CommunicationDto;
    expect(row.bodyOriginal).toBe('Texto\n'.repeat(20000)); expect(row.recipients).toHaveLength(2);
  });
  it('sesión y clave de reintento obligatorias; proceso inexistente devuelve 404', async () => {
    const f = await fixture(); await post('', f.process.id, f.input).expect(401);
    await request(app.getHttpServer()).post('/api/v1/relationship-processes/' + f.process.id + '/communications/sent').set('Cookie', f.writer.cookie).send(f.input).expect(400);
    await post(f.writer.cookie, randomUUID(), f.input).expect(404);
    await request(app.getHttpServer()).get('/api/v1/communications/' + randomUUID()).set('Cookie', f.writer.cookie).expect(404);
  });
  it('proceso cerrado exige reapertura explícita; el envío nunca cambia el estado', async () => {
    const f = await fixture(); await processes.close(f.process.id, { expectedVersion: 1, result: 'REJECTED' }, f.owner.id);
    expect((await post(f.writer.cookie, f.process.id, f.input).expect(409)).body).toMatchObject({ code: 'PROCESS_CLOSED' });
    await processes.reopen(f.process.id, { expectedVersion: 2, state: 'IN_PROGRESS', reason: 'Continuar cooperación' }, f.owner.id);
    await post(f.writer.cookie, f.process.id, f.input).expect(201); expect((await processes.get(f.process.id, f.owner.id)).state).toBe('IN_PROGRESS');
  });
  it.each(['organization', 'person'] as const)('restricción explícita de %s bloquea incluso administrador, levantar permite registro', async kind => {
    const f = await fixture(UserRole.ADMINISTRATOR, kind), restriction = await restrictions().create({ ...f.goal, reason: 'No contactar' }, f.owner.id);
    expect((await post(f.writer.cookie, f.process.id, f.input).expect(409)).body).toMatchObject({ code: 'CONTACT_RESTRICTED' });
    expect(await prisma.processParticipant.count({ where: { userId: f.writer.id } })).toBe(0);
    await restrictions().lift(restriction.id, { expectedVersion: 1, reason: 'Permiso expreso' }, f.owner.id); await post(f.writer.cookie, f.process.id, f.input).expect(201);
  });
  it('reintentos concurrentes comparten registro; una clave diferente permite mensajes idénticos reales', async () => {
    const f = await fixture(), key = randomUUID(); const rows = await Promise.all([post(f.writer.cookie, f.process.id, f.input, key), post(f.writer.cookie, f.process.id, f.input, key)]);
    expect(rows.map(row => row.status)).toEqual([201, 201]); expect((rows[0].body as CommunicationDto).id).toBe((rows[1].body as CommunicationDto).id);
    expect(await prisma.communication.count({ where: { processId: f.process.id } })).toBe(1); expect(await prisma.auditEvent.count({ where: { communicationId: (rows[0].body as CommunicationDto).id } })).toBe(1);
    expect((await post(f.writer.cookie, f.process.id, { ...f.input, body: 'Otro texto' }, key).expect(409)).body).toMatchObject({ code: 'REQUEST_CONFLICT' });
    await post(f.writer.cookie, f.process.id, f.input).expect(201); expect(await prisma.communication.count({ where: { processId: f.process.id } })).toBe(2);
    const participant = await prisma.processParticipant.findUniqueOrThrow({ where: { processId_userId: { processId: f.process.id, userId: f.writer.id } } });
    await post(f.writer.cookie, f.process.id, f.input).expect(201); expect(await prisma.processParticipant.findUniqueOrThrow({ where: { processId_userId: { processId: f.process.id, userId: f.writer.id } } })).toEqual(participant);
  });
  it('snapshots permanecen tras cambiar buzón, retirar asignación y desactivar registrador; lectura pura', async () => {
    const f = await fixture(), row = await communications().registerSent(f.process.id, f.input, f.writer.id, randomUUID());
    await prisma.emailAccount.update({ where: { id: f.account.id }, data: { address: randomUUID() + '@example.test', displayName: 'Nuevo nombre', isActive: false } });
    await users.withLockedCredentials(f.writer.id, async (_current, tx) => { await users.setMailboxLocked(f.writer.id, f.account.id, false, tx); await users.deactivateLocked(f.writer.id, tx); });
    const before = await prisma.relationshipProcess.findUniqueOrThrow({ where: { id: f.process.id } }), audit = await prisma.auditEvent.count({ where: { actorUserId: { in: userIds } } });
    const read = await communications().get(row.id, f.owner.id); expect(read).toEqual({ ...row, registeredBy: { ...row.registeredBy, isActive: false } });
    expect(await prisma.relationshipProcess.findUniqueOrThrow({ where: { id: f.process.id } })).toEqual(before); expect(await prisma.auditEvent.count({ where: { actorUserId: { in: userIds } } })).toBe(audit);
    await expect(communications().registerSent(f.process.id, f.input, f.writer.id, randomUUID())).rejects.toThrow('FORBIDDEN');
  });
  it('replay confirmado no vuelve a actuar aunque proceso esté cerrado y buzón retirado', async () => {
    const f = await fixture(), key = randomUUID(), row = await communications().registerSent(f.process.id, f.input, f.writer.id, key);
    await processes.close(f.process.id, { expectedVersion: 2, result: 'REJECTED' }, f.owner.id);
    await users.withLockedCredentials(f.writer.id, async (_current, tx) => { await users.setMailboxLocked(f.writer.id, f.account.id, false, tx); });
    expect(await communications().registerSent(f.process.id, f.input, f.writer.id, key)).toEqual(row); expect(await prisma.communication.count({ where: { processId: f.process.id } })).toBe(1);
  });
  it.each(['audit', 'participation', 'activity'])('fallo de %s revierte comunicación, destinatarios, participante y actividad', async stage => {
    const f = await fixture(), before = await prisma.relationshipProcess.findUniqueOrThrow({ where: { id: f.process.id } });
    if (stage === 'audit') jest.spyOn(app.get(AuditService), 'recordSentCommunication').mockRejectedValue(new Error('QA rollback'));
    else if (stage === 'participation') jest.spyOn(app.get(ProcessParticipationService), 'ensureParticipant').mockRejectedValue(new Error('QA rollback'));
    else jest.spyOn(processes, 'recordCommunicationActivity').mockRejectedValue(new Error('QA rollback'));
    await expect(communications().registerSent(f.process.id, f.input, f.writer.id, randomUUID())).rejects.toThrow('QA rollback');
    expect(await prisma.communication.count({ where: { processId: f.process.id } })).toBe(0); expect(await prisma.communicationRecipient.count({ where: { communication: { processId: f.process.id } } })).toBe(0); expect(await prisma.processParticipant.count({ where: { userId: f.writer.id } })).toBe(0); expect(await prisma.relationshipProcess.findUniqueOrThrow({ where: { id: f.process.id } })).toEqual(before);
  });
  it.each(['patch', 'put', 'delete'] as const)('%s no permite editar ni eliminar históricos', async method => {
    const f = await fixture(), row = await communications().registerSent(f.process.id, f.input, f.writer.id, randomUUID());
    await request(app.getHttpServer())[method]('/api/v1/communications/' + row.id).set('Cookie', f.owner.cookie).send({ body: 'Cambio' }).expect(404); expect(await communications().get(row.id, f.owner.id)).toEqual(row);
  });
  it('listado paginado y contratos mínimos por proceso/email normalizado conservan orden real', async () => {
    const f = await fixture(), ids: string[] = [];
    for (let i = 0; i < 6; i++) ids.unshift((await communications().registerSent(f.process.id, { ...f.input, sentAt: `2000-01-0${i + 1}T12:00:00Z` }, f.writer.id, randomUUID())).id);
    const page = await request(app.getHttpServer()).get('/api/v1/relationship-processes/' + f.process.id + '/communications?page=2&pageSize=2').set('Cookie', f.owner.cookie).expect(200);
    expect(page.body as unknown).toMatchObject({ total: 6, page: 2, pageSize: 2 }); expect((page.body as { items: { id: string }[] }).items.map(row => row.id)).toEqual(ids.slice(2, 4));
    await prisma.$transaction(async tx => { expect(await communications().countForProcess(f.process.id, tx)).toBe(6); expect((await communications().recentForProcess(f.process.id, tx)).map(row => row.id)).toEqual(ids.slice(0, 5)); expect((await communications().recentByRecipientAddress(' NUEVA@example.test ', tx)).map(row => row.id)).toEqual(ids.slice(0, 5)); });
  });
  it('restricción primero mantiene lock hasta commit y bloquea el registro completo', async () => {
    const f = await fixture(), gate = deferred(), ready = deferred(), original = restrictions().getActiveRestriction.bind(restrictions()); let first = true;
    jest.spyOn(restrictions(), 'getActiveRestriction').mockImplementation(async (goal, tx) => { const row = await original(goal, tx); if (first) { first = false; ready.resolve(); await gate.promise; } return row; });
    const adding = restrictions().create({ ...f.goal, reason: 'Expreso' }, f.owner.id); await ready.promise;
    const registering = communications().registerSent(f.process.id, f.input, f.writer.id, randomUUID()).then(() => 'UNEXPECTED', (error: Error) => error.message);
    try { await waitingLock(true); } finally { gate.resolve(); } await adding; expect(await registering).toBe('CONTACT_RESTRICTED'); expect(await prisma.communication.count({ where: { processId: f.process.id } })).toBe(0);
  });
  it('registro primero confirma y restricción posterior conserva el histórico', async () => {
    const f = await fixture(), gate = deferred(), ready = deferred(), original = app.get(AuditService).recordSentCommunication.bind(app.get(AuditService));
    jest.spyOn(app.get(AuditService), 'recordSentCommunication').mockImplementation(async (...args) => { const row = await original(...args); ready.resolve(); await gate.promise; return row; });
    const registering = communications().registerSent(f.process.id, f.input, f.writer.id, randomUUID()); await ready.promise;
    const adding = restrictions().create({ ...f.goal, reason: 'Posterior' }, f.owner.id);
    try { await waitingLock(true); } finally { gate.resolve(); } const row = await registering; await adding; expect(await communications().get(row.id, f.owner.id)).toEqual(row);
  });
  it.each(['mailbox', 'assignment', 'user'])('%s cambia antes: el registro espera y revalida después del commit', async change => {
    const f = await fixture(), gate = deferred(), ready = deferred();
    const changing = prisma.$transaction(async tx => {
      if (change === 'mailbox') await tx.emailAccount.update({ where: { id: f.account.id }, data: { isActive: false } });
      else if (change === 'assignment') await tx.userEmailAccount.update({ where: { userId_emailAccountId: { userId: f.writer.id, emailAccountId: f.account.id } }, data: { removedAt: new Date() } });
      else await tx.user.update({ where: { id: f.writer.id }, data: { isActive: false, deactivatedAt: new Date() } });
      ready.resolve(); await gate.promise;
    }); await ready.promise;
    const registering = communications().registerSent(f.process.id, f.input, f.writer.id, randomUUID()).then(() => 'UNEXPECTED', (error: Error) => error.message);
    try { await waitingLock(); } finally { gate.resolve(); } await changing; expect(await registering).toBe(change === 'user' ? 'FORBIDDEN' : 'MAILBOX_UNAVAILABLE'); expect(await prisma.communication.count({ where: { processId: f.process.id } })).toBe(0);
  });
  it('cierre formal primero bloquea registro después de confirmar', async () => {
    const f = await fixture(), gate = deferred(), ready = deferred(), original = app.get(AuditService).recordProcess.bind(app.get(AuditService));
    // El consumidor solo espera la operación; el doble omite las relaciones del PrismaPromise.
    const paused = async (...args: Parameters<AuditService['recordProcess']>) => { const row = await original(...args); ready.resolve(); await gate.promise; return row; };
    jest.spyOn(app.get(AuditService), 'recordProcess').mockImplementation(paused as unknown as AuditService['recordProcess']);
    const closing = processes.close(f.process.id, { expectedVersion: 1, result: 'REJECTED' }, f.owner.id); await ready.promise;
    const registering = communications().registerSent(f.process.id, f.input, f.writer.id, randomUUID()).then(() => 'UNEXPECTED', (error: Error) => error.message);
    try { await waitingLock(); } finally { gate.resolve(); } await closing; expect(await registering).toBe('PROCESS_CLOSED');
  });
  it('registro primero evita cierre con versión anterior y conserva origen del creador', async () => {
    const f = await fixture(), gate = deferred(), ready = deferred(), original = app.get(AuditService).recordSentCommunication.bind(app.get(AuditService));
    await users.assignEmailAccount(f.owner.id, f.account.id);
    const before = await prisma.processParticipant.findUniqueOrThrow({ where: { processId_userId: { processId: f.process.id, userId: f.owner.id } } });
    jest.spyOn(app.get(AuditService), 'recordSentCommunication').mockImplementation(async (...args) => { const row = await original(...args); ready.resolve(); await gate.promise; return row; });
    const registering = communications().registerSent(f.process.id, f.input, f.owner.id, randomUUID()); await ready.promise;
    const closing = processes.close(f.process.id, { expectedVersion: 1, result: 'REJECTED' }, f.owner.id).then(() => 'UNEXPECTED', (error: Error) => error.message);
    try { await waitingLock(); } finally { gate.resolve(); } await registering; expect(await closing).toBe('VERSION_CONFLICT');
    expect(await prisma.processParticipant.findUniqueOrThrow({ where: { processId_userId: { processId: f.process.id, userId: f.owner.id } } })).toEqual(before);
  });
  it('cambiar un contacto maestro no reescribe sus destinatarios históricos', async () => {
    const f = await fixture(), address = randomUUID() + '@example.test';
    const contact = await prisma.contactMethod.create({ data: { type: 'EMAIL', value: address, normalizedValue: address } });
    try {
      const row = await communications().registerSent(f.process.id, { ...f.input, to: [address] }, f.writer.id, randomUUID());
      const newAddress = randomUUID() + '@example.test'; await prisma.contactMethod.update({ where: { id: contact.id }, data: { value: newAddress, normalizedValue: newAddress } });
      expect((await communications().get(row.id, f.owner.id)).recipients[0].addressOriginal).toBe(address);
    } finally { await prisma.contactMethod.delete({ where: { id: contact.id } }); }
  });
  it.each(['IN_PROGRESS', 'WAITING_RESPONSE', 'NEGOTIATION'] as const)('registro mantiene %s y actividad nunca retrocede', async state => {
    const f = await fixture(); if (state === 'NEGOTIATION') await processes.changeState(f.process.id, { expectedVersion: 1, state: 'IN_PROGRESS' }, f.owner.id);
    await processes.changeState(f.process.id, { expectedVersion: state === 'NEGOTIATION' ? 2 : 1, state }, f.owner.id);
    const later = new Date(Date.now() + 60000); await prisma.relationshipProcess.update({ where: { id: f.process.id }, data: { lastActivityAt: later, updatedAt: later } });
    await communications().registerSent(f.process.id, f.input, f.writer.id, randomUUID()); const process = await prisma.relationshipProcess.findUniqueOrThrow({ where: { id: f.process.id } }); expect(process.state).toBe(state); expect(process.lastActivityAt).toEqual(later);
  });
  it('constraints impiden desanclar historia, falsear snapshots y mezclar auditoría', async () => {
    const f = await fixture(), row = await communications().registerSent(f.process.id, f.input, f.writer.id, randomUUID());
    await expect(prisma.emailAccount.delete({ where: { id: f.account.id } })).rejects.toThrow();
    await expect(prisma.relationshipProcess.delete({ where: { id: f.process.id } })).rejects.toThrow();
    await expect(prisma.communication.update({ where: { id: row.id }, data: { senderSnapshot: 'otro@example.test' } })).rejects.toThrow();
    await expect(prisma.communication.update({ where: { id: row.id }, data: { sentAt: new Date('2999-01-01') } })).rejects.toThrow();
    await expect(prisma.communicationRecipient.create({ data: { communicationId: row.id, type: 'TO', position: 0, addressOriginal: 'a@example.test', normalizedAddress: 'a@example.test' } })).rejects.toThrow();
    await expect(prisma.communicationRecipient.create({ data: { communicationId: row.id, type: 'TO', position: 100, addressOriginal: 'a@example.test', normalizedAddress: 'a@example.test' } })).rejects.toThrow();
    await expect(prisma.auditEvent.create({ data: { action: 'SENT_COMMUNICATION_REGISTERED', actorUserId: f.writer.id, operationId: randomUUID(), organizationId: f.goal.organizationId } })).rejects.toThrow();
    expect(await communications().get(row.id, f.owner.id)).toEqual(row);
  });
  it('normalización Unicode usa PostgreSQL y no altera original ni búsqueda', async () => {
    const f = await fixture(), row = await communications().registerSent(f.process.id, { ...f.input, to: ['İ@Example.test', 'ΟΣ@Example.test'] }, f.writer.id, randomUUID());
    expect(row.recipients.slice(0, 2).map(recipient => recipient.addressOriginal)).toEqual(['İ@Example.test', 'ΟΣ@Example.test']);
    await prisma.$transaction(async tx => { for (const address of ['İ@Example.test', 'ΟΣ@Example.test']) expect((await communications().recentByRecipientAddress(address, tx)).map(item => item.id)).toContain(row.id); });
  });
});
