import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import request from 'supertest';
import { Client } from 'pg';
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
import { DirectoryTargetService } from '../src/modules/directory/directory-target.service';
import { ContactsService } from '../src/modules/directory/contacts.service';
import { CommunicationsService } from '../src/modules/communications/communications.service';

import { ContactIntentsService } from '../src/modules/relationships/contact-intents.service';
import { RelationshipProcessesService } from '../src/modules/relationships/relationship-processes.service';
import { ContactRestrictionsService } from '../src/modules/relationships/contact-restrictions.service';
import type { RelationshipContextDto } from '../src/modules/relationships/relationship-context.dto';
import { RelationshipContextService } from '../src/modules/relationships/relationship-context.service';

const databaseUrl = validateDatabaseUrl(process.env.DATABASE_URL);
if (!new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('Contexto requiere una base aislada _test.');

describe('Contexto institucional PostgreSQL/HTTP', () => {
  let app: INestApplication<Server>, prisma: PrismaService, users: UsersService, processes: RelationshipProcessesService;
  const userIds: string[] = [], orgIds: string[] = [], personIds: string[] = [], accountIds: string[] = [], methodIds: string[] = [];
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
      prisma.organizationContact.deleteMany({ where: { organizationId: { in: orgIds } } }),
      prisma.contactMethod.deleteMany({ where: { id: { in: methodIds } } }),
      prisma.personOrganizationRelation.deleteMany({ where: { personId: { in: personIds } } }),
      prisma.person.updateMany({ where: { id: { in: personIds } }, data: { duplicateOfId: null } }),
      prisma.person.deleteMany({ where: { id: { in: personIds } } }),
      prisma.organization.updateMany({ where: { id: { in: orgIds } }, data: { duplicateOfId: null } }),
      prisma.organization.deleteMany({ where: { id: { in: orgIds } } }),
      prisma.userSession.deleteMany({ where: { userId: { in: userIds } } }),
      prisma.userEmailAccount.deleteMany({ where: { userId: { in: userIds } } }),
      prisma.emailAccount.deleteMany({ where: { id: { in: accountIds } } }),
      prisma.user.deleteMany({ where: { id: { in: userIds } } }),
    ]); userIds.length = orgIds.length = personIds.length = accountIds.length = methodIds.length = 0;
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
  const intents = () => app.get(ContactIntentsService);
  const restrictions = () => app.get(ContactRestrictionsService);
  function get(cookie: string, query: object) { return request(app.getHttpServer()).get('/api/v1/relationship-context').set('Cookie', cookie).query(query); }
  async function read(owner: Awaited<ReturnType<typeof actor>>, goal: { organizationId?: string; personId?: string }): Promise<RelationshipContextDto> {
    return (await get(owner.cookie, goal).expect(200)).body as RelationshipContextDto;
  }
  const communications = () => app.get(CommunicationsService);
  async function incoming(processId: string, actorId: string, receivedAt = '2000-01-02T12:00:00.000Z', to = ['CECASEM@Example.test']) {
    return communications().registerReceived(processId, { sender: 'Actor@Example.test', to, cc: [], bcc: [], subject: 'Respuesta original', body: 'Cuerpo privado que no pertenece al contexto', receivedAt }, actorId, randomUUID());
  }
  async function outgoing(processId: string, actorId: string, sentAt = '2000-01-01T12:00:00.000Z', to = ['Old@Example.test']) {
    const account = await users.createEmailAccount({ address: randomUUID() + '@example.test', displayName: 'Buzón QA' }); accountIds.push(account.id);
    await users.assignEmailAccount(actorId, account.id);
    return communications().registerSent(processId, { emailAccountId: account.id, to, cc: [], bcc: [], subject: 'Propuesta original', body: 'Original privado enviado', sentAt }, actorId, randomUUID());
  }
  it.each(Object.values(UserRole))('%s consulta organización sin antecedentes', async role => {
    const owner = await actor(role), goal = await target(owner.id), row = await read(owner, goal);
    expect(row).toMatchObject({ target: { kind: 'ORGANIZATION', id: goal.organizationId }, contactAllowed: true, restriction: null,
      activeIntents: { items: [], total: 0 }, activeProcesses: { items: [], total: 0 }, recentClosedProcesses: { items: [], total: 0 },
      relatedOrganizationContext: { items: [], total: 0 }, hasRelationshipHistory: false, hasRegisteredCommunicationHistory: false });
    expect(row.communicationSummary).toEqual({ total: 0, lastOccurredAt: null, lastDirection: null }); expect(row.recentCommunications).toEqual([]);
    expect(Object.keys(row).sort()).toEqual(['activeIntents', 'activeProcesses', 'communicationSummary', 'contactAllowed', 'hasRegisteredCommunicationHistory', 'hasRelationshipHistory', 'recentClosedProcesses', 'recentCommunications', 'relatedOrganizationContext', 'restriction', 'target']);
  });
  it('persona independiente muestra su propia gestión', async () => {
    const owner = await actor(), goal = await target(owner.id, 'person'), process = await processes.create({ ...goal, purpose: 'Objetivo personal' }, owner.id), row = await read(owner, goal);
    expect(row).toMatchObject({ target: { kind: 'PERSON', id: goal.personId }, activeProcesses: { items: [{ id: process.id, target: process.target }], total: 1 }, relatedOrganizationContext: { total: 0 } });
  });
  it.each([{}, { organizationId: randomUUID(), personId: randomUUID() }, { personId: 'bad' }, { organizationId: 'bad' }, { organizationId: randomUUID(), pageSize: 1000 }])('query inválida %j', async query => {
    const owner = await actor(); await get(owner.cookie, query).expect(400);
  });
  it.each(['organizationId', 'personId'])('%s inexistente', async field => {
    const owner = await actor(); expect((await get(owner.cookie, { [field]: randomUUID() }).expect(404)).body).toMatchObject({ code: 'CONTEXT_TARGET_NOT_FOUND' });
  });
  it('sesión obligatoria y permisos de lectura; rol actual revalidado', async () => {
    const owner = await actor(), goal = await target(owner.id), stale = await users.findIdentityById(owner.id);
    await request(app.getHttpServer()).get('/api/v1/relationship-context').query(goal).expect(401);
    jest.spyOn(app.get(SessionsService), 'findIdentity').mockResolvedValue({ ...stale!, role: 'UNKNOWN' } as never); await get(owner.cookie, goal).expect(403);
    jest.restoreAllMocks(); await prisma.user.update({ where: { id: owner.id }, data: { isActive: false, deactivatedAt: new Date() } });
    jest.spyOn(app.get(SessionsService), 'findIdentity').mockResolvedValue(stale);
    await get(owner.cookie, goal).expect(403);
    await expect(app.get(RelationshipContextService).get(goal, owner.id)).rejects.toThrow('FORBIDDEN');
  });
  it('cuatro estados activos, paralelos permitidos y sin exposición de actuaciones', async () => {
    const owner = await actor(), goal = await target(owner.id);
    for (const state of ['PREPARATION', 'IN_PROGRESS', 'WAITING_RESPONSE', 'NEGOTIATION'] as const) {
      let process = await processes.create({ ...goal, purpose: state }, owner.id);
      if (state === 'NEGOTIATION') process = await processes.changeState(process.id, { expectedVersion: process.version, state: 'IN_PROGRESS' }, owner.id);
      if (state !== 'PREPARATION') await processes.changeState(process.id, { expectedVersion: process.version, state }, owner.id);
    }
    const row = await read(owner, goal);
    expect(row.activeProcesses.total).toBe(4); expect(row.activeProcesses.items.map(item => item.state).sort()).toEqual(['IN_PROGRESS', 'NEGOTIATION', 'PREPARATION', 'WAITING_RESPONSE']);
    expect(row.contactAllowed).toBe(true); expect(row.hasRelationshipHistory).toBe(true);
    expect(Object.keys(row.activeProcesses.items[0]).sort()).toEqual(['closedAt', 'createdAt', 'createdBy', 'id', 'lastActivityAt', 'purpose', 'result', 'state', 'target']);
    await processes.create({ ...goal, purpose: 'Otro objetivo válido' }, owner.id);
    await intents().create({ ...goal, purpose: 'Nueva intención válida' }, owner.id);
  });
  it.each(['active', 'closed', 'intent'])('%s conserva conteo total y límite/orden deterministas', async kind => {
    const owner = await actor(), goal = await target(owner.id), expected: string[] = [];
    for (let index = 0; index < 7; index++) {
      const at = new Date(Date.now() - (8 - index) * 86400000), start = new Date(+at - 3600000);
      if (kind === 'intent') {
        const row = await intents().create({ ...goal, purpose: 'Intención ' + index }, owner.id); expected.unshift(row.id);
        await prisma.contactIntent.update({ where: { id: row.id }, data: { createdAt: start, updatedAt: at, lastActivityAt: at } });
      } else {
        const row = await processes.create({ ...goal, purpose: 'Proceso ' + index }, owner.id); expected.unshift(row.id);
        if (kind === 'closed') await processes.close(row.id, { expectedVersion: 1, result: 'REJECTED' }, owner.id);
        await prisma.relationshipProcess.update({ where: { id: row.id }, data: { createdAt: start, updatedAt: at, lastActivityAt: at, ...(kind === 'closed' ? { closedAt: at } : {}) } });
      }
    }
    const row = await read(owner, goal), group = kind === 'intent' ? row.activeIntents : kind === 'closed' ? row.recentClosedProcesses : row.activeProcesses;
    expect(group.total).toBe(7); expect(group.items.map(item => item.id)).toEqual(expected.slice(0, 5));
    if (kind === 'closed') expect(row.recentClosedProcesses.items[0]).toMatchObject({ result: 'REJECTED', state: 'CLOSED', target: row.target });
  });
  it('intenciones canceladas y convertidas no aparecen activas ni duplican procesos', async () => {
    const owner = await actor(), goal = await target(owner.id), active = await intents().create({ ...goal, purpose: 'En preparación' }, owner.id);
    const cancelled = await intents().create({ ...goal, purpose: 'Cancelada' }, owner.id); await intents().cancel(cancelled.id, 1, owner.id);
    const converted = await intents().create({ ...goal, purpose: 'Convertida' }, owner.id); const result = await intents().convert(converted.id, 1, owner.id);
    const row = await read(owner, goal);
    expect(row.activeIntents).toMatchObject({ total: 1, items: [{ id: active.id, author: active.author }] });
    expect(row.activeProcesses).toMatchObject({ total: 1, items: [{ id: result.process.id }] });
  });
  it('intención histórica sola es historia de gestión, sin afirmar comunicación', async () => {
    const owner = await actor(), goal = await target(owner.id), intent = await intents().create({ ...goal, purpose: 'Cancelada' }, owner.id); await intents().cancel(intent.id, 1, owner.id);
    expect(await read(owner, goal)).toMatchObject({ hasRelationshipHistory: true, hasRegisteredCommunicationHistory: false, activeIntents: { total: 0 }, activeProcesses: { total: 0 } });
  });
  it('restricción se obtiene por interfaz pública; levantar elimina el bloqueo informado', async () => {
    const owner = await actor(), goal = await target(owner.id), restriction = await restrictions().create({ ...goal, reason: 'Solicitud expresa' }, owner.id), spy = jest.spyOn(restrictions(), 'getActiveRestriction');
    expect(await read(owner, goal)).toMatchObject({ contactAllowed: false, restriction: { id: restriction.id, reason: restriction.reason }, hasRegisteredCommunicationHistory: false });
    expect(spy).toHaveBeenCalledWith(goal, expect.anything());
    await restrictions().lift(restriction.id, { expectedVersion: 1, reason: 'Decisión autorizada' }, owner.id);
    expect(await read(owner, goal)).toMatchObject({ contactAllowed: true, restriction: null });
  });
  it('persona vinculada conserva contexto directo y agrega organización sin duplicar', async () => {
    const owner = await actor(), person = await target(owner.id, 'person'), org = await target(owner.id), old = await target(owner.id);
    const own = await processes.create({ ...person, purpose: 'Objetivo personal previo' }, owner.id), institutional = await processes.create({ ...org, purpose: 'Objetivo institucional' }, owner.id);
    await processes.create({ ...old, purpose: 'Vínculo finalizado' }, owner.id);
    await app.get(PeopleService).createRelation(person.personId!, { organizationId: org.organizationId!, isCurrent: true, positionTitle: 'Dirección' }, owner.id);
    await app.get(PeopleService).createRelation(person.personId!, { organizationId: org.organizationId!, isCurrent: true, positionTitle: 'Coordinación' }, owner.id);
    await app.get(PeopleService).createRelation(person.personId!, { organizationId: old.organizationId!, isCurrent: false }, owner.id);
    const row = await read(owner, person);
    expect(row.activeProcesses).toMatchObject({ total: 1, items: [{ id: own.id }] });
    expect(row.relatedOrganizationContext).toMatchObject({ total: 1, items: [{ target: { id: org.organizationId }, activeProcesses: { total: 1, items: [{ id: institutional.id }] } }] });
    expect([row, ...row.relatedOrganizationContext.items].flatMap(item => item.activeProcesses.items.map(process => process.id))).toEqual([own.id, institutional.id]);
    expect(row.hasRegisteredCommunicationHistory).toBe(false);
  });
  it('persona sin proceso propio informa gestión de organización y no propaga su restricción', async () => {
    const owner = await actor(), person = await target(owner.id, 'person'), org = await target(owner.id), process = await processes.create({ ...org, purpose: 'Gestión con otra persona de la organización' }, owner.id);
    await app.get(PeopleService).createRelation(person.personId!, { organizationId: org.organizationId!, isCurrent: true }, owner.id);
    await restrictions().create({ ...org, reason: 'Solo organización' }, owner.id);
    const row = await read(owner, person);
    expect(row).toMatchObject({ activeProcesses: { total: 0 }, contactAllowed: true, restriction: null, hasRelationshipHistory: false,
      relatedOrganizationContext: { items: [{ contactAllowed: false, activeProcesses: { items: [{ id: process.id }] }, hasRelationshipHistory: true }] } });
    await request(app.getHttpServer()).post('/api/v1/relationship-processes').set('Cookie', owner.cookie).send({ ...person, purpose: 'No se vuelve independiente por consultar' }).expect(409);
  });
  it('organizaciones relacionadas acotadas y distintas, incluidas fichas inactivas', async () => {
    const owner = await actor(), person = await target(owner.id, 'person');
    for (let index = 0; index < 6; index++) {
      const org = await target(owner.id); await prisma.organization.update({ where: { id: org.organizationId }, data: { name: 'Organización ' + index, isActive: index !== 0 } });
      await app.get(PeopleService).createRelation(person.personId!, { organizationId: org.organizationId!, isCurrent: true }, owner.id);
    }
    const row = await read(owner, person);
    expect(row.relatedOrganizationContext.total).toBe(6); expect(row.relatedOrganizationContext.items).toHaveLength(5);
    expect(row.relatedOrganizationContext.items.map(item => item.target.label)).toEqual(['Organización 0', 'Organización 1', 'Organización 2', 'Organización 3', 'Organización 4']);
    expect(row.relatedOrganizationContext.items[0].target.isActive).toBe(false);
  });
  it('lectura pura: no locks de escritura, participantes, actividad, versiones, eventos ni auditoría', async () => {
    const owner = await actor(), observer = await actor(UserRole.PLANNING), goal = await target(owner.id), process = await processes.create({ ...goal, purpose: 'Histórico institucional' }, owner.id), intent = await intents().create({ ...goal, purpose: 'Preparación' }, owner.id);
    await incoming(process.id, owner.id);
    const before = await prisma.relationshipProcess.findUniqueOrThrow({ where: { id: process.id } }), beforeIntent = await prisma.contactIntent.findUniqueOrThrow({ where: { id: intent.id } });
    const participants = await prisma.processParticipant.count({ where: { processId: process.id } });
    const events = await prisma.relationshipProcessEvent.count({ where: { processId: process.id } }), audit = await prisma.auditEvent.count({ where: { actorUserId: { in: userIds } } });
    const lock = jest.spyOn(app.get(DirectoryTargetService), 'requireUsable'), restrictionLock = jest.spyOn(restrictions(), 'assertContactAllowed');
    await read(observer, goal); await read(observer, goal);
    expect(lock).not.toHaveBeenCalled(); expect(restrictionLock).not.toHaveBeenCalled();
    expect(await prisma.relationshipProcess.findUniqueOrThrow({ where: { id: process.id } })).toEqual(before);
    expect(await prisma.contactIntent.findUniqueOrThrow({ where: { id: intent.id } })).toEqual(beforeIntent);
    expect(await prisma.processParticipant.count({ where: { processId: process.id, userId: observer.id } })).toBe(0);
    expect(await prisma.processParticipant.count({ where: { processId: process.id } })).toBe(participants);
    expect(await prisma.relationshipProcessEvent.count({ where: { processId: process.id } })).toBe(events);
    expect(await prisma.auditEvent.count({ where: { actorUserId: { in: userIds } } })).toBe(audit);
  });
  it('snapshot sin restricción nunca evita la revalidación autoritativa posterior', async () => {
    const owner = await actor(), goal = await target(owner.id);
    expect((await read(owner, goal)).contactAllowed).toBe(true);
    await restrictions().create({ ...goal, reason: 'Solicitud posterior' }, owner.id);
    for (const path of ['contact-intents', 'relationship-processes']) {
      expect((await request(app.getHttpServer()).post('/api/v1/' + path).set('Cookie', owner.cookie).send({ ...goal, purpose: 'Borrador previo' }).expect(409)).body as unknown).toMatchObject({ code: 'CONTACT_RESTRICTED' });
    }
  });
  it.each(['SENT', 'RECEIVED'] as const)('%s muestra snapshots, proceso y fecha real sin cuerpo; cuatro roles leen lo mismo', async direction => {
    const owner = await actor(), goal = await target(owner.id), process = await processes.create({ ...goal, purpose: 'Objetivo concreto' }, owner.id);
    const communication = direction === 'SENT' ? await outgoing(process.id, owner.id) : await incoming(process.id, owner.id);
    for (const role of Object.values(UserRole)) {
      const reader = role === owner.role ? owner : await actor(role), row = await read(reader, goal);
      expect(row).toMatchObject({ hasRegisteredCommunicationHistory: true, contactAllowed: true,
        communicationSummary: { total: 1, lastOccurredAt: communication.occurredAt, lastDirection: direction },
        recentCommunications: [{ id: communication.id, processId: process.id, process: { id: process.id, purpose: process.purpose }, direction, sender: communication.sender, subject: communication.subject,
          occurredAt: communication.occurredAt, recipients: [{ type: 'TO', addressOriginal: communication.recipients[0].addressOriginal }], recipientTotal: 1 }] });
      expect(JSON.stringify(row)).not.toContain('bodyOriginal'); expect(JSON.stringify(row)).not.toContain(communication.bodyOriginal);
    }
  });
  it('mixtas: registro retrospectivo, desempate por ID, total y cinco recientes entre múltiples procesos', async () => {
    const owner = await actor(), goal = await target(owner.id), first = await processes.create({ ...goal, purpose: 'Primer proceso' }, owner.id), second = await processes.create({ ...goal, purpose: 'Segundo proceso' }, owner.id);
    const sent = await outgoing(first.id, owner.id, '2000-01-06T12:00:00.000Z');
    const received = [];
    for (let index = 1; index <= 6; index++) received.push(await incoming(second.id, owner.id, '2000-01-0' + index + 'T12:00:00.000Z'));
    const retrospective = await incoming(first.id, owner.id, '1999-01-01T12:00:00.000Z');
    const expected = [sent, ...received].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.id.localeCompare(a.id));
    const row = await read(owner, goal);
    expect(row.communicationSummary).toEqual({ total: 8, lastOccurredAt: expected[0].occurredAt, lastDirection: expected[0].direction });
    expect(row.recentCommunications.map(item => item.id)).toEqual(expected.slice(0, 5).map(item => item.id));
    expect(row.recentCommunications.some(item => item.id === retrospective.id)).toBe(false);
    const current = await processes.get(first.id, owner.id); await processes.close(first.id, { expectedVersion: current.version, result: 'REJECTED' }, owner.id);
    expect((await read(owner, goal)).communicationSummary.total).toBe(8);
  });
  it.each(['organization', 'person'] as const)('%s: actor exacto excluye matriz/sucursal y otras personas', async kind => {
    const owner = await actor(), goal = await target(owner.id, kind), other = await target(owner.id, kind);
    if (kind === 'organization') await prisma.organization.update({ where: { id: other.organizationId }, data: { parentId: goal.organizationId } });
    const own = await processes.create({ ...goal, purpose: 'Directo' }, owner.id), unrelated = await processes.create({ ...other, purpose: 'Otro actor' }, owner.id);
    const communication = await incoming(own.id, owner.id); await incoming(unrelated.id, owner.id);
    const row = await read(owner, goal); expect(row.communicationSummary.total).toBe(1); expect(row.recentCommunications.map(item => item.id)).toEqual([communication.id]);
  });
  it.each([false, true])('persona vinculada: historia institucional separada, directas=%s, sin duplicaciones', async withDirect => {
    const owner = await actor(), person = await target(owner.id, 'person'), org = await target(owner.id);
    const own = await processes.create({ ...person, purpose: 'Personal antes del vínculo' }, owner.id), institutional = await processes.create({ ...org, purpose: 'Otra persona de la institución' }, owner.id);
    const direct = withDirect ? await incoming(own.id, owner.id) : null, organization = await outgoing(institutional.id, owner.id);
    await app.get(PeopleService).createRelation(person.personId!, { organizationId: org.organizationId!, isCurrent: true, positionTitle: 'Dirección' }, owner.id);
    await app.get(PeopleService).createRelation(person.personId!, { organizationId: org.organizationId!, isCurrent: true, positionTitle: 'Coordinación' }, owner.id);
    const row = await read(owner, person), related = row.relatedOrganizationContext.items;
    expect(row.hasRegisteredCommunicationHistory).toBe(withDirect); expect(row.communicationSummary.total).toBe(withDirect ? 1 : 0);
    expect(related).toHaveLength(1); expect(related[0].communicationSummary.total).toBe(1);
    expect(related[0].recentCommunications.map(item => item.id)).toEqual([organization.id]);
    expect([row, ...related].flatMap(item => item.recentCommunications.map(mail => mail.id))).toEqual(direct ? [direct.id, organization.id] : [organization.id]);
  });
  it('recibida posterior conserva restricción activa y levantarla conserva historial', async () => {
    const owner = await actor(), goal = await target(owner.id), process = await processes.create({ ...goal, purpose: 'Cooperación' }, owner.id);
    await outgoing(process.id, owner.id);
    const restriction = await restrictions().create({ ...goal, reason: 'No contactar' }, owner.id);
    const receivedAt = new Date().toISOString(), received = await incoming(process.id, owner.id, receivedAt);
    const row = await read(owner, goal); expect(row).toMatchObject({ contactAllowed: false, restriction: { id: restriction.id }, hasRegisteredCommunicationHistory: true,
      communicationSummary: { total: 2, lastOccurredAt: received.occurredAt, lastDirection: 'RECEIVED' } });
    await restrictions().lift(restriction.id, { expectedVersion: 1, reason: 'Autorización expresa' }, owner.id);
    expect(await read(owner, goal)).toMatchObject({ contactAllowed: true, restriction: null, communicationSummary: row.communicationSummary, recentCommunications: row.recentCommunications });
  });
  it('ContactMethod no es comunicación y su corrección no reconstruye destinatarios históricos', async () => {
    const owner = await actor(), goal = await target(owner.id), contacts = app.get(ContactsService), address = randomUUID() + '@example.test';
    const association = await contacts.createAndAssociate(goal, { type: 'EMAIL', value: address }, owner.id); methodIds.push(association.association.contactMethodId);
    await intents().create({ ...goal, purpose: 'Solo planeado' }, owner.id);
    const process = await processes.create({ ...goal, purpose: 'Aún sin comunicación' }, owner.id);
    expect(await read(owner, goal)).toMatchObject({ hasRegisteredCommunicationHistory: false, communicationSummary: { total: 0 }, recentCommunications: [] });
    const communication = await outgoing(process.id, owner.id, undefined, [address]);
    await contacts.correct(methodIds[0], { value: randomUUID() + '@example.test', expectedVersion: association.association.contactMethod.version, confirmShared: false }, owner.id);
    expect((await read(owner, goal)).recentCommunications[0].recipients[0].addressOriginal).toBe(address);
    const byAddress = await prisma.$transaction(tx => communications().recentByInvolvedAddress('  ' + address.toUpperCase() + '  ', tx));
    expect(byAddress.map(item => item.id)).toEqual([communication.id]);
  });
  it('1000 comunicaciones: cinco resúmenes, diez destinatarios y cantidad constante de consultas públicas', async () => {
    const owner = await actor(), goal = await target(owner.id), processIds: string[] = [];
    for (let index = 0; index < 10; index++) processIds.push((await processes.create({ ...goal, purpose: 'Proceso ' + index }, owner.id)).id);
    const seed = await incoming(processIds[0], owner.id, undefined, Array.from({ length: 20 }, (_, index) => 'Destinatario' + index + '@example.test'));
    const queries = jest.spyOn(Client.prototype, 'query');
    const queryText = (query: unknown) => typeof query === 'string' ? query : query && typeof query === 'object' && 'text' in query ? String(query.text) : '';
    const communicationQueryCount = () => queries.mock.calls.filter(([query]) => {
      const text = queryText(query);
      return /SELECT/i.test(text) && /"Communication(?:Recipient)?"/.test(text);
    }).length;
    await read(owner, goal); const baselineQueryCount = communicationQueryCount(); queries.mockClear();
    await prisma.communication.createMany({ data: Array.from({ length: 999 }, (_, index) => ({ processId: processIds[index % 10], direction: 'RECEIVED' as const,
      senderSnapshot: 'Actor@Example.test', senderNormalizedAddress: 'actor@example.test', subject: 'Carga ' + index, bodyOriginal: 'Cuerpo que no se debe proyectar',
      receivedAt: new Date('1999-01-01T12:00:00.000Z'), occurredAt: new Date('1999-01-01T12:00:00.000Z'), registeredByUserId: owner.id, requestKey: randomUUID(), requestFingerprint: '0'.repeat(64) })) });
    const history = jest.spyOn(communications(), 'historyForActor'), perProcess = jest.spyOn(communications(), 'historyForProcess'), countPerProcess = jest.spyOn(communications(), 'countForProcess');
    const row = await read(owner, goal);
    expect(row.communicationSummary.total).toBe(1000); expect(row.recentCommunications).toHaveLength(5);
    expect(row.recentCommunications[0]).toMatchObject({ id: seed.id, recipientTotal: 20 }); expect(row.recentCommunications[0].recipients).toHaveLength(10);
    expect(JSON.stringify(row).length).toBeLessThan(15000); expect(JSON.stringify(row)).not.toContain('bodyOriginal');
    expect(history).toHaveBeenCalledTimes(1); expect(perProcess).not.toHaveBeenCalled(); expect(countPerProcess).not.toHaveBeenCalled();
    expect(baselineQueryCount).toBeGreaterThan(0); expect(communicationQueryCount()).toBe(baselineQueryCount); expect(communicationQueryCount()).toBeLessThanOrEqual(3);
  });
});
