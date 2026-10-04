import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import type { Readable } from 'node:stream';
import { FileStorage } from './file-storage';
import { FilesService, type ReceivedFile } from './files.service';
import { FILE_MAX_COUNT } from './file-config';
import { FileError } from './file-errors';
import type { AuthenticatedRequest } from '../auth/session.guard';
export type UploadRequest = AuthenticatedRequest & { stagedFiles?: ReceivedFile[]; files?: ReceivedFile[] };
@Injectable()
export class FileUploadInterceptor implements NestInterceptor {
  constructor(private readonly storage: FileStorage, private readonly files: FilesService) {}
  async intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest<UploadRequest>();
    const target = request.path.startsWith('/api/v1/meetings/') ? { meetingId: String(request.params.id) } : request.path.startsWith('/api/v1/opportunities/') ? { opportunityId: String(request.params.id) } : request.path.startsWith('/api/v1/communications/') ? { communicationId: String(request.params.id) } : { processId: String(request.params.id) };
    const requestKey = request.headers['idempotency-key'];
    if (typeof requestKey !== 'string' || !isUUID(String(request.params.id))) throw new FileError('INVALID_UPLOAD');
    await this.files.checkUpload(target, request.authenticatedUser.id, requestKey);
    request.stagedFiles = [];
    const storage = this.storage;
    const Interceptor = FilesInterceptor('files', FILE_MAX_COUNT, {
      limits: { fileSize: this.files.limits().maxBytes + 1, files: FILE_MAX_COUNT, fields: 0, parts: FILE_MAX_COUNT + 1 },
      storage: {
        _handleFile(_request: Request, file: { stream: Readable; originalname: string; mimetype: string }, callback: (error: Error | null, info?: ReceivedFile) => void) {
          void storage.stage(file.stream).then(staged => {
            let originalname = file.originalname;
            try { originalname = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(originalname, 'latin1')); } catch { /* Nombre latin1 legítimo. */ }
            const received = { ...staged, originalname, mimetype: file.mimetype };
            request.stagedFiles!.push(received); callback(null, received);
          }).catch((error: unknown) => callback(error instanceof Error ? error : new FileError('FILE_UNAVAILABLE')));
        },
        _removeFile(_request: Request, file: ReceivedFile, callback: (error: Error | null) => void) {
          void storage.discard(file.key).then(() => callback(null)).catch(() => callback(new FileError('FILE_UNAVAILABLE')));
        },
      },
    });
    try { return await new Interceptor().intercept(context, next); }
    catch (error) {
      await this.files.cleanup(request.stagedFiles);
      if (error instanceof FileError) throw error;
      if (error instanceof Error && /File too large/i.test(error.message)) throw new FileError('FILE_TOO_LARGE');
      throw new FileError('INVALID_UPLOAD');
    }
  }
}
