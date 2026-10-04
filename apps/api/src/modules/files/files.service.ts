import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { isUUID } from 'class-validator';
import type { AppEnvironment } from '../../config/environment';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { UsersService } from '../users/users.service';
import type { UserIdentity } from '../users/user-projections';
import { hasPermission } from '../auth/authorization/role-permissions';
import { PERMISSIONS } from '../auth/authorization/permission';
import { AuditService } from '../audit/audit.service';
import { CommunicationsService } from '../communications/communications.service';
import { RelationshipProcessesService } from '../relationships/relationship-processes.service';
import { FileStorage, type StagedFile } from './file-storage';
import { FileError } from './file-errors';
import { FILE_MAX_COUNT } from './file-config';
import { safeOriginalName, validateFile } from './file-validation';
import type { FileMetadataDto, FilePaginationDto } from './files.dto';
import { timelineSeek, type TimelinePosition } from '../relationships/timeline.rules';
import type { TimelineItem } from '../relationships/timeline.dto';

export type FileTarget = { processId: string; communicationId?: never } | { communicationId: string; processId?: never };
export type ReceivedFile = StagedFile & { originalname: string; mimetype: string };
const uploadSelect = { processId: true, communicationId: true, createdAt: true, uploadedBy: { select: { id: true, givenNames: true, familyNames: true, isActive: true } } } as const;
const fileSelect = { id: true, originalName: true, mimeType: true, declaredMimeType: true, sizeBytes: true, sha256: true, upload: { select: uploadSelect } } satisfies Prisma.FileAttachmentSelect;
type FileRow = Prisma.FileAttachmentGetPayload<{ select: typeof fileSelect }>;
const metadata = (row: FileRow): FileMetadataDto => ({ id: row.id, originalName: row.originalName, mimeType: row.mimeType, declaredMimeType: row.declaredMimeType,
  sizeBytes: row.sizeBytes, sha256: row.sha256, createdAt: row.upload.createdAt.toISOString(), processId: row.upload.processId, communicationId: row.upload.communicationId,
  incorporation: row.upload.communicationId ? 'LATER_COMMUNICATION_ATTACHMENT' : 'PROCESS_ATTACHMENT',
  uploadedBy: { id: row.upload.uploadedBy.id, displayName: row.upload.uploadedBy.givenNames + ' ' + row.upload.uploadedBy.familyNames, isActive: row.upload.uploadedBy.isActive } });

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);
  private readonly activeKeys = new Set<string>();
  constructor(private readonly prisma: PrismaService, private readonly users: UsersService, private readonly storage: FileStorage,
    private readonly processes: RelationshipProcessesService, private readonly communications: CommunicationsService,
    private readonly audit: AuditService, private readonly config: ConfigService<AppEnvironment, true>) {}
  limits() { return { maxBytes: this.config.get('FILE_MAX_BYTES', { infer: true }), maxFiles: FILE_MAX_COUNT }; }
  private authorize(actor: UserIdentity | null, target: FileTarget, upload: boolean) {
    if (!actor?.isActive || !hasPermission(actor.role, upload ? PERMISSIONS.FILE_UPLOAD : PERMISSIONS.FILE_READ) || !hasPermission(actor.role, PERMISSIONS.PROCESS_READ)
      || (target.communicationId && !hasPermission(actor.role, PERMISSIONS.COMMUNICATION_READ))) throw new FileError('FORBIDDEN');
  }
  private async requireTarget(target: FileTarget, tx: Prisma.TransactionClient, uploading: boolean) {
    if (!!target.processId === !!target.communicationId) throw new FileError('INVALID_UPLOAD');
    try {
      if (target.processId) {
        const row = await this.processes.requireAttachmentProcess(target.processId, tx, uploading);
        if (uploading && row.state === 'CLOSED') throw new FileError('RESOURCE_CLOSED');
      } else {
        const row = await this.communications.requireAttachmentCommunication(target.communicationId!, tx, uploading);
        if (uploading && row.validity === 'INVALIDATED') throw new FileError('COMMUNICATION_INVALIDATED');
      }
    } catch (error) {
      if (error instanceof Error && 'code' in error && ['PROCESS_NOT_FOUND', 'COMMUNICATION_NOT_FOUND'].includes(String(error.code))) throw new FileError('RESOURCE_NOT_FOUND');
      throw error;
    }
  }
  async checkUpload(target: FileTarget, actorId: string, requestKey: string) {
    if (!isUUID(requestKey)) throw new FileError('INVALID_UPLOAD');
    await this.prisma.$transaction(async tx => {
      this.authorize(await this.users.findIdentityById(actorId, tx), target, true);
      // Retry ya confirmado sigue permitido aunque el recurso haya cambiado de estado.
      const prior = await tx.fileUpload.findUnique({ where: { uploadedByUserId_requestKey: { uploadedByUserId: actorId, requestKey } }, select: { processId: true, communicationId: true } });
      if (prior && (prior.processId !== (target.processId ?? null) || prior.communicationId !== (target.communicationId ?? null))) throw new FileError('REQUEST_CONFLICT');
      await this.requireTarget(target, tx, !prior);
    });
  }
  async cleanup(files: readonly ReceivedFile[], finalized = false) {
    await Promise.all(files.map(async file => {
      try { await this.storage.discard(file.key, finalized); } catch { this.logger.error('No se pudo retirar un archivo técnico; requiere reconciliación.'); }
      this.activeKeys.delete(file.key);
    }));
  }
  async upload(target: FileTarget, files: readonly ReceivedFile[], actorId: string, requestKey: string): Promise<FileMetadataDto[]> {
    const finalized: ReceivedFile[] = [];
    try {
      if (!isUUID(requestKey) || files.length < 1 || files.length > FILE_MAX_COUNT) throw new FileError('INVALID_UPLOAD');
      const validated: { originalName: string; mimeType: string; declaredMimeType: string; sizeBytes: number; sha256: string }[] = [];
      for (const file of files) {
        this.activeKeys.add(file.key);
        const originalName = safeOriginalName(file.originalname), bytes = await this.storage.readStaged(file.key);
        if (!bytes.length || bytes.length !== file.sizeBytes) throw new FileError('INVALID_UPLOAD');
        if (bytes.length > this.limits().maxBytes) throw new FileError('FILE_TOO_LARGE');
        if (createHash('sha256').update(bytes).digest('hex') !== file.sha256) throw new FileError('INVALID_UPLOAD');
        const mimeType = validateFile(originalName, file.mimetype, bytes);
        validated.push({ originalName, mimeType, declaredMimeType: file.mimetype.toLowerCase().split(';')[0].trim(), sizeBytes: file.sizeBytes, sha256: file.sha256 });
      }
      const fingerprint = createHash('sha256').update(JSON.stringify([target, validated])).digest('hex');
      for (const file of files) { await this.storage.finalize(file.key); finalized.push(file); }
      const result = await this.users.withLockedCredentials(actorId, async (actor, tx) => {
        this.authorize(actor, target, true);
        const prior = await tx.fileUpload.findUnique({ where: { uploadedByUserId_requestKey: { uploadedByUserId: actorId, requestKey } }, include: { files: { select: fileSelect, orderBy: { position: 'asc' } } } });
        await this.requireTarget(target, tx, !prior);
        if (prior) {
          if (prior.requestFingerprint !== fingerprint) throw new FileError('REQUEST_CONFLICT');
          return { items: prior.files.map(metadata), reused: true };
        }
        const upload = await tx.fileUpload.create({ data: { ...target, uploadedByUserId: actorId, requestKey, requestFingerprint: fingerprint, createdAt: new Date(),
          files: { create: validated.map((file, position) => ({ ...file, position, storageKey: files[position].key })) } }, include: { files: { select: fileSelect, orderBy: { position: 'asc' } } } });
        await this.audit.recordFilesAttached(upload.id, actorId, tx);
        return { items: upload.files.map(metadata), reused: false };
      });
      if (result.reused) await this.cleanup(finalized, true);
      return result.items;
    } catch (error) {
      // Commit ambiguo: jamás retirar bytes que DB ya vinculó. Si DB no responde, conservarlos para reconciliar.
      for (const file of finalized) {
        try { if (!await this.prisma.fileAttachment.findUnique({ where: { storageKey: file.key }, select: { id: true } })) await this.cleanup([file], true); }
        catch { this.logger.error('No se pudo confirmar la compensación; conservar bytes para reconciliación.'); }
      }
      throw error;
    } finally {
      await this.cleanup(files);
      for (const file of finalized) this.activeKeys.delete(file.key);
    }
  }
  async list(target: FileTarget, query: FilePaginationDto, actorId: string) {
    return this.prisma.$transaction(async tx => {
      this.authorize(await this.users.findIdentityById(actorId, tx), target, false); await this.requireTarget(target, tx, false);
      const where = { upload: target };
      const rows = await tx.fileAttachment.findMany({ where, select: fileSelect, orderBy: [{ upload: { createdAt: 'desc' } }, { id: 'desc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize });
      return { items: rows.map(metadata), total: await tx.fileAttachment.count({ where }), page: query.page, pageSize: query.pageSize };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  async get(id: string, actorId: string) { return metadata(await this.authorizedFile(id, actorId)); }
  private async authorizedFile(id: string, actorId: string) {
    return this.prisma.$transaction(async tx => {
      const actor = await this.users.findIdentityById(actorId, tx);
      this.authorize(actor, { processId: id }, false);
      const row = await tx.fileAttachment.findUnique({ where: { id }, select: { ...fileSelect, storageKey: true } });
      if (!row) throw new FileError('FILE_NOT_FOUND');
      const target: FileTarget = row.upload.communicationId ? { communicationId: row.upload.communicationId } : { processId: row.upload.processId! };
      this.authorize(actor, target, false); await this.requireTarget(target, tx, false);
      return row;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  async download(id: string, actorId: string) {
    const row = await this.authorizedFile(id, actorId);
    return { file: metadata(row), stream: await this.storage.open(row.storageKey, row.sizeBytes, row.sha256) };
  }
  async timelineItems(processId: string, after: TimelinePosition | undefined, limit: number, tx: Prisma.TransactionClient): Promise<TimelineItem[]> {
    const rows = await tx.fileUpload.findMany({ where: { AND: [{ OR: [{ processId }, { communication: { processId } }] }, timelineSeek(after, 'FILE', 'createdAt')] },
      select: { id: true, ...uploadSelect, files: { select: { originalName: true }, orderBy: { position: 'asc' } } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: limit });
    return rows.map(row => ({ id: row.id, kind: 'FILES_ATTACHED', occurredAt: row.createdAt.toISOString(), registeredAt: row.createdAt.toISOString(), summary: 'Adjuntos incorporados',
      actor: { id: row.uploadedBy.id, displayName: row.uploadedBy.givenNames + ' ' + row.uploadedBy.familyNames, isActive: row.uploadedBy.isActive },
      payload: { uploadId: row.id, communicationId: row.communicationId, names: row.files.map(file => file.originalName) } }));
  }
  /** Solo mantenimiento con cargas detenidas. Por defecto identifica; nunca se ejecuta automáticamente. */
  async reconcile(olderThan: Date, remove = false) {
    if (!Number.isFinite(+olderThan) || +olderThan > Date.now() - 24 * 60 * 60 * 1000) throw new FileError('INVALID_UPLOAD');
    const orphans = [];
    for (const candidate of await this.storage.candidates(olderThan)) {
      if (this.activeKeys.has(candidate.key)) continue;
      if (await this.prisma.fileAttachment.findUnique({ where: { storageKey: candidate.key }, select: { id: true } })) continue;
      orphans.push(candidate);
      if (remove) await this.storage.discard(candidate.key, !candidate.temporary);
    }
    return orphans;
  }
}
