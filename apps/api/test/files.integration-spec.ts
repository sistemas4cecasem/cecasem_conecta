import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { mkdtemp, readdir, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { Readable } from 'node:stream';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/config/application';
import { validateEnvironment } from '../src/config/environment';
import { validateDatabaseUrl } from '../src/config/database-url';
import { PrismaService } from '../src/database/prisma.service';
import { UserRole } from '../src/generated/prisma/client';
import { UsersService } from '../src/modules/users/users.service';
import { SessionsService } from '../src/modules/auth/sessions.service';
import { RelationshipProcessesService } from '../src/modules/relationships/relationship-processes.service';
import { CommunicationsService } from '../src/modules/communications/communications.service';
import { CommunicationAmendmentsService } from '../src/modules/communications/communication-amendments.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { FilesService } from '../src/modules/files/files.service';
import { FileStorage } from '../src/modules/files/file-storage';
import type { FileMetadataDto, FilePageDto } from '../src/modules/files/files.dto';
import { FILE_MAX_BYTES } from '../src/modules/files/file-config';

const databaseUrl = validateDatabaseUrl(process.env.DATABASE_URL);
if (!new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('Archivos requieren base aislada _test.');
describe('Archivos PostgreSQL/HTTP/filesystem', () => {
  let app: INestApplication<Server>, prisma: PrismaService, files: FilesService, root: string;
  const userIds: string[] = [], orgIds: string[] = [];
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'cecasem-files-integration-'));
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ConfigService)
      .useValue(new ConfigService(validateEnvironment({ NODE_ENV: 'test', DATABASE_URL: databaseUrl, FILE_STORAGE_ROOT: root }))).compile();
    app = module.createNestApplication<INestApplication<Server>>(); configureApplication(app); await app.init(); prisma = app.get(PrismaService); files = app.get(FilesService);
  });
  afterEach(async () => {
    await prisma.$transaction([
      prisma.auditEvent.deleteMany({ where: { actorUserId: { in: userIds } } }),
      prisma.fileAttachment.deleteMany({ where: { upload: { uploadedByUserId: { in: userIds } } } }),
      prisma.fileUpload.deleteMany({ where: { uploadedByUserId: { in: userIds } } }),
      prisma.communicationAmendment.deleteMany({ where: { authorUserId: { in: userIds } } }),
      prisma.communicationRecipient.deleteMany({ where: { communication: { registeredByUserId: { in: userIds } } } }),
      prisma.communication.deleteMany({ where: { registeredByUserId: { in: userIds } } }),
      prisma.relationshipProcessEvent.deleteMany({ where: { actorUserId: { in: userIds } } }),
      prisma.processParticipant.deleteMany({ where: { userId: { in: userIds } } }),
      prisma.relationshipProcess.deleteMany({ where: { createdByUserId: { in: userIds } } }),
      prisma.organization.deleteMany({ where: { id: { in: orgIds } } }),
      prisma.userSession.deleteMany({ where: { userId: { in: userIds } } }),
      prisma.user.deleteMany({ where: { id: { in: userIds } } }),
    ]);
    userIds.length = orgIds.length = 0;
    // Solo raíz temporal propia, nunca storage de runtime.
    await rm(join(root, 'objects'), { recursive: true, force: true }); await rm(join(root, 'staging'), { recursive: true, force: true });
  });
  afterAll(async () => { await app.close(); await rm(root, { recursive: true, force: true }); });
  async function actor(role: UserRole = UserRole.ADMINISTRATOR) {
    const row = await app.get(UsersService).createIdentity({ givenNames: 'QA', familyNames: 'Files', email: randomUUID() + '@example.test', role }); userIds.push(row.id);
    const token = await prisma.$transaction(tx => app.get(SessionsService).create(row.id, tx)); return { ...row, cookie: 'cecasem_session=' + token };
  }
  async function process(ownerId: string) {
    const org = await prisma.organization.create({ data: { name: 'Organización QA archivos' } }); orgIds.push(org.id);
    return app.get(RelationshipProcessesService).create({ organizationId: org.id, purpose: 'Cooperación institucional' }, ownerId);
  }
  function upload(cookie: string, path: string, key = randomUUID(), bytes = Buffer.from('Acuerdo institucional'), name = 'acuerdo.txt', mime = 'text/plain') {
    return request(app.getHttpServer()).post('/api/v1/' + path + '/attachments').set('Cookie', cookie).set('Idempotency-Key', key).attach('files', bytes, { filename: name, contentType: mime });
  }
  async function communication(ownerId: string, processId: string) {
    return app.get(CommunicationsService).registerReceived(processId, { sender: 'actor@example.test', to: ['cecasem@example.test'], cc: [], bcc: [], subject: 'Propuesta', body: 'Original histórico', receivedAt: '2000-01-01T12:00:00.000Z' }, ownerId, randomUUID());
  }
  it.each(Object.values(UserRole))('%s carga múltiples, consulta y descarga con headers privados', async role => {
    const owner = await actor(), other = await actor(role), row = await process(owner.id), before = await prisma.relationshipProcess.findUniqueOrThrow({ where: { id: row.id } });
    const response = await upload(other.cookie, 'relationship-processes/' + row.id).attach('files', Buffer.from('Segundo archivo'), 'segundo.txt').expect(201);
    const attachments = response.body as FileMetadataDto[]; expect(attachments).toHaveLength(2); expect(attachments[0].uploadedBy.id).toBe(other.id); expect(response.text).not.toContain('storageKey'); expect(response.text).not.toContain(root);
    const list = await request(app.getHttpServer()).get('/api/v1/relationship-processes/' + row.id + '/attachments').set('Cookie', other.cookie).expect(200);
    expect((list.body as FilePageDto).total).toBe(2);
    await request(app.getHttpServer()).get('/api/v1/files/' + attachments[0].id).set('Cookie', other.cookie).expect(200);
    const downloaded = await request(app.getHttpServer()).get('/api/v1/files/' + attachments[0].id + '/download').set('Cookie', other.cookie).expect(200);
    expect(downloaded.text).toBe('Acuerdo institucional'); expect(downloaded.headers['content-disposition']).toContain('attachment'); expect(downloaded.headers['x-content-type-options']).toBe('nosniff'); expect(downloaded.headers['cache-control']).toBe('private, no-store');
    expect(await prisma.processParticipant.count({ where: { processId: row.id, userId: other.id } })).toBe(0); expect(await prisma.relationshipProcess.findUnique({ where: { id: row.id } })).toEqual(before);
  });
  it('reintentos concurrentes no duplican metadata, bytes ni auditoría', async () => {
    const owner = await actor(), row = await process(owner.id), key = randomUUID();
    const [a, b] = await Promise.all([upload(owner.cookie, 'relationship-processes/' + row.id, key), upload(owner.cookie, 'relationship-processes/' + row.id, key)]);
    expect(a.status).toBe(201); expect(b.status).toBe(201); expect(a.body).toEqual(b.body); expect(await prisma.fileUpload.count({ where: { uploadedByUserId: owner.id } })).toBe(1); expect(await readdir(join(root, 'objects'))).toHaveLength(1);
    await upload(owner.cookie, 'relationship-processes/' + row.id, key, Buffer.from('Otro contenido')).expect(409); expect(await readdir(join(root, 'objects'))).toHaveLength(1);
  });
  it('exactamente 20 MiB admitidos; un byte adicional rechazado', async () => {
    const owner = await actor(), row = await process(owner.id), bytes = Buffer.alloc(FILE_MAX_BYTES, 65);
    await upload(owner.cookie, 'relationship-processes/' + row.id, randomUUID(), bytes).expect(201);
    await upload(owner.cookie, 'relationship-processes/' + row.id, randomUUID(), Buffer.alloc(FILE_MAX_BYTES + 1, 65)).expect(413);
    expect(await prisma.fileAttachment.count({ where: { upload: { processId: row.id } } })).toBe(1);
  });
  it.each([
    [Buffer.alloc(0), 'empty.txt', 'text/plain'], [Buffer.from('MZ executable'), 'fake.pdf', 'application/pdf'],
    [Buffer.from('<html>activo</html>'), 'fake.txt', 'text/plain'], [Buffer.from('abc'), 'script.js', 'text/javascript'],
    [Buffer.from('abc'), 'wrong.txt', 'application/pdf'],
  ] as const)('rechaza archivo inválido %s %s', async (bytes, name, mime) => { const owner = await actor(), row = await process(owner.id); await upload(owner.cookie, 'relationship-processes/' + row.id, randomUUID(), bytes, name, mime).expect(400); expect(await prisma.fileUpload.count({ where: { uploadedByUserId: owner.id } })).toBe(0); });
  it('máximo 10 por solicitud y sin límite acumulado por recurso', async () => {
    const owner = await actor(), row = await process(owner.id); let ten = upload(owner.cookie, 'relationship-processes/' + row.id);
    for (let i = 1; i < 10; i++) ten = ten.attach('files', Buffer.from('abc'), 'd' + i + '.txt'); await ten.expect(201);
    await upload(owner.cookie, 'relationship-processes/' + row.id).expect(201);
    let eleven = upload(owner.cookie, 'relationship-processes/' + row.id); for (let i = 1; i < 11; i++) eleven = eleven.attach('files', Buffer.from('abc'), 'd' + i + '.txt'); await eleven.expect(400);
    expect(await prisma.fileAttachment.count({ where: { upload: { processId: row.id } } })).toBe(11); expect(await readdir(join(root, 'objects'))).toHaveLength(11);
  });
  it('conserva original/fingerprint y adjuntos tras invalidación; cerrado bloquea solo carga directa', async () => {
    const owner = await actor(), row = await process(owner.id), comm = await communication(owner.id, row.id);
    const original = await prisma.communication.findUniqueOrThrow({ where: { id: comm.id }, include: { recipients: true } });
    const attached = await upload(owner.cookie, 'communications/' + comm.id).expect(201); const id = (attached.body as FileMetadataDto[])[0].id;
    expect(await prisma.communication.findUnique({ where: { id: comm.id }, include: { recipients: true } })).toEqual(original);
    expect((attached.body as FileMetadataDto[])[0].incorporation).toBe('LATER_COMMUNICATION_ATTACHMENT');
    await app.get(CommunicationAmendmentsService).create(comm.id, 'INVALIDATION', 'Registro inválido explícito', owner.id, randomUUID());
    await upload(owner.cookie, 'communications/' + comm.id).expect(409); await request(app.getHttpServer()).get('/api/v1/files/' + id + '/download').set('Cookie', owner.cookie).expect(200);
    const fresh = await app.get(RelationshipProcessesService).get(row.id, owner.id); await app.get(RelationshipProcessesService).close(row.id, { expectedVersion: fresh.version, result: 'REJECTED' }, owner.id);
    await upload(owner.cookie, 'relationship-processes/' + row.id).expect(409);
    const late = await communication(owner.id, row.id); await upload(owner.cookie, 'communications/' + late.id).expect(201);
    const timeline = await request(app.getHttpServer()).get('/api/v1/relationship-processes/' + row.id + '/timeline').set('Cookie', owner.cookie).expect(200);
    expect(timeline.text).toContain('FILES_ATTACHED');
  });
  it('sesión ausente/revocada e inactividad rechazan lectura y carga; UUID desconocido 404', async () => {
    const owner = await actor(), row = await process(owner.id); const attached = await upload(owner.cookie, 'relationship-processes/' + row.id).expect(201); const id = (attached.body as FileMetadataDto[])[0].id;
    await request(app.getHttpServer()).get('/api/v1/files/' + id + '/download').expect(401);
    await upload(owner.cookie, 'relationship-processes/' + randomUUID()).expect(404);
    await request(app.getHttpServer()).get('/api/v1/files/' + randomUUID()).set('Cookie', owner.cookie).expect(404);
    await prisma.user.update({ where: { id: owner.id }, data: { isActive: false, deactivatedAt: new Date() } }); await upload(owner.cookie, 'relationship-processes/' + row.id).expect(401);
    await prisma.user.update({ where: { id: owner.id }, data: { isActive: true, deactivatedAt: null } }); await prisma.userSession.updateMany({ where: { userId: owner.id }, data: { revokedAt: new Date() } });
    await request(app.getHttpServer()).get('/api/v1/files/' + id + '/download').set('Cookie', owner.cookie).expect(401);
  });
  it('fallo DB/auditoría revierte lote y compensa bytes; faltantes no revelan rutas', async () => {
    const owner = await actor(), row = await process(owner.id), audit = jest.spyOn(app.get(AuditService), 'recordFilesAttached').mockRejectedValueOnce(new Error('Fallo sintético'));
    await upload(owner.cookie, 'relationship-processes/' + row.id).expect(500); audit.mockRestore(); expect(await prisma.fileUpload.count({ where: { uploadedByUserId: owner.id } })).toBe(0); expect(await readdir(join(root, 'objects'))).toEqual([]);
    const attached = await upload(owner.cookie, 'relationship-processes/' + row.id).expect(201); const id = (attached.body as FileMetadataDto[])[0].id;
    const record = await prisma.fileAttachment.findUniqueOrThrow({ where: { id } }); await app.get(FileStorage).discard(record.storageKey, true);
    const response = await request(app.getHttpServer()).get('/api/v1/files/' + id + '/download').set('Cookie', owner.cookie).expect(503); expect(response.text).not.toContain(root);
  });
  it.each(['closed', 'inactive'] as const)('revalida %s después de recibir/finalizar y antes de confirmar metadata', async change => {
    const owner = await actor(), row = await process(owner.id), storage = app.get(FileStorage), finalize = storage.finalize.bind(storage);
    const spy = jest.spyOn(storage, 'finalize').mockImplementationOnce(async key => {
      await finalize(key);
      if (change === 'closed') { const current = await app.get(RelationshipProcessesService).get(row.id, owner.id); await app.get(RelationshipProcessesService).close(row.id, { expectedVersion: current.version, result: 'REJECTED' }, owner.id); }
      else await prisma.user.update({ where: { id: owner.id }, data: { isActive: false, deactivatedAt: new Date() } });
    });
    try { await upload(owner.cookie, 'relationship-processes/' + row.id).expect(change === 'closed' ? 409 : 403); }
    finally { spy.mockRestore(); }
    expect(await prisma.fileUpload.count({ where: { processId: row.id } })).toBe(0); expect(await readdir(join(root, 'objects'))).toEqual([]);
  });
  it('rechaza auditoría de archivos sin operación y FK de autor inexistente', async () => {
    const owner = await actor(), row = await process(owner.id), attached = await upload(owner.cookie, 'relationship-processes/' + row.id).expect(201);
    const record = await prisma.fileAttachment.findUniqueOrThrow({ where: { id: (attached.body as FileMetadataDto[])[0].id } });
    await prisma.auditEvent.deleteMany({ where: { fileUploadId: record.uploadId } });
    await expect(prisma.auditEvent.create({ data: { action: 'FILES_ATTACHED', fileUploadId: record.uploadId, actorUserId: owner.id } })).rejects.toThrow();
    await expect(prisma.auditEvent.create({ data: { action: 'FILES_ATTACHED', fileUploadId: record.uploadId, operationId: record.uploadId, actorUserId: randomUUID() } })).rejects.toThrow();
  });
  it('FK/checks e historial no tienen DELETE ordinario', async () => {
    const owner = await actor(), row = await process(owner.id), key = randomUUID();
    await expect(prisma.fileUpload.create({ data: { uploadedByUserId: owner.id, requestKey: key, requestFingerprint: 'a'.repeat(64) } })).rejects.toThrow();
    await expect(prisma.fileUpload.create({ data: { uploadedByUserId: owner.id, processId: randomUUID(), requestKey: key, requestFingerprint: 'a'.repeat(64) } })).rejects.toThrow();
    const response = await upload(owner.cookie, 'relationship-processes/' + row.id).expect(201); const record = await prisma.fileAttachment.findUniqueOrThrow({ where: { id: (response.body as FileMetadataDto[])[0].id } });
    await expect(prisma.fileAttachment.update({ where: { id: record.id }, data: { sizeBytes: 0 } })).rejects.toThrow();
    await expect(prisma.fileAttachment.update({ where: { id: record.id }, data: { storageKey: '../outside' } })).rejects.toThrow();
    await expect(prisma.fileAttachment.update({ where: { id: record.id }, data: { sha256: 'invalid' } })).rejects.toThrow();
    await request(app.getHttpServer()).delete('/api/v1/files/' + record.id).set('Cookie', owner.cookie).expect(404);
  });
  it('1000 incorporaciones mantienen consultas acotadas y cursor sin pérdidas ni duplicados', async () => {
    const owner = await actor(), row = await process(owner.id), at = new Date('2001-01-01T00:00:00.000Z');
    const first = await prisma.fileUpload.create({ data: { processId: row.id, uploadedByUserId: owner.id, requestKey: randomUUID(), requestFingerprint: 'a'.repeat(64), createdAt: at,
      files: { create: { originalName: 'histórico.txt', mimeType: 'text/plain', declaredMimeType: 'text/plain', sizeBytes: 1, sha256: 'a'.repeat(64), storageKey: randomUUID(), position: 0 } } } });
    const spy = jest.spyOn(Client.prototype, 'query');
    const count = () => spy.mock.calls.filter(([query]) => /^SELECT/i.test(typeof query === 'string' ? query : String((query as { text?: string }).text ?? ''))).length;
    const read = () => request(app.getHttpServer()).get('/api/v1/relationship-processes/' + row.id + '/timeline?pageSize=5').set('Cookie', owner.cookie);
    try {
      await read().expect(200); const baseline = count();
      const uploads = await prisma.fileUpload.createManyAndReturn({ data: Array.from({ length: 999 }, () => ({ processId: row.id, uploadedByUserId: owner.id, requestKey: randomUUID(), requestFingerprint: 'a'.repeat(64), createdAt: at })), select: { id: true } });
      await prisma.fileAttachment.createMany({ data: uploads.map(upload => ({ uploadId: upload.id, originalName: 'histórico.txt', mimeType: 'text/plain', declaredMimeType: 'text/plain', sizeBytes: 1, sha256: 'a'.repeat(64), storageKey: randomUUID(), position: 0 })) });
      spy.mockClear(); const page = await read().expect(200);
      const body = page.body as { items: { id: string; kind: string }[]; nextCursor: string };
      // 4.4: una consulta acotada adicional para la séptima fuente histórica.
      expect(count()).toBe(baseline); expect(count()).toBeLessThanOrEqual(20);
      expect(body.items).toHaveLength(5); expect(body.items.every(item => item.kind === 'FILES_ATTACHED')).toBe(true);
      const next = await request(app.getHttpServer()).get('/api/v1/relationship-processes/' + row.id + '/timeline').query({ pageSize: 5, after: body.nextCursor }).set('Cookie', owner.cookie).expect(200);
      const nextItems = (next.body as typeof body).items;
      expect(nextItems).toHaveLength(5); expect(nextItems.every(item => !body.items.some(previous => previous.id === item.id))).toBe(true);
      expect(await prisma.fileUpload.count({ where: { processId: row.id } })).toBe(1000); expect(first.id).toBeDefined();
    } finally { spy.mockRestore(); }
  });
  it('reconciliación distingue histórico, reciente y huérfano antiguo', async () => {
    const owner = await actor(), row = await process(owner.id); await upload(owner.cookie, 'relationship-processes/' + row.id).expect(201);
    const orphan = await app.get(FileStorage).stage(Readable.from('huérfano')); await app.get(FileStorage).finalize(orphan.key); const at = new Date(Date.now() - 48 * 3600000); await utimes(join(root, 'objects', orphan.key), at, at);
    const threshold = new Date(Date.now() - 24 * 3600000); expect(await files.reconcile(threshold)).toEqual([{ key: orphan.key, temporary: false }]);
    await files.reconcile(threshold, true); expect(await readdir(join(root, 'objects'))).toHaveLength(1);
  });
});
