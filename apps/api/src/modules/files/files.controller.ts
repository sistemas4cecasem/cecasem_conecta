import { Controller, Get, Header, Headers, Param, ParseUUIDPipe, Post, Query, Req, Res, StreamableFile, UseFilters, UseInterceptors } from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiCookieAuth, ApiCreatedResponse, ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { RequirePermissions } from '../auth/authorization/require-permissions.decorator';
import { PERMISSIONS } from '../auth/authorization/permission';
import { FileErrorFilter } from './file-error.filter';
import { FilesService } from './files.service';
import { FileUploadInterceptor, type UploadRequest } from './file-upload.interceptor';
import { FileMetadataDto, FilePageDto, FilePaginationDto } from './files.dto';
function uploadDocs() { return ApiBody({ schema: { type: 'object', required: ['files'], properties: { files: { type: 'array', minItems: 1, maxItems: 10, items: { type: 'string', format: 'binary' } } } } }); }
@Controller() @ApiTags('files') @ApiCookieAuth('cecasem_session') @UseFilters(FileErrorFilter)
export class FilesController {
  constructor(private readonly files: FilesService) {}
  @Get('files/config') @Header('Cache-Control', 'no-store') @RequirePermissions(PERMISSIONS.FILE_READ)
  limits() { return this.files.limits(); }
  @Post('relationship-processes/:id/attachments') @RequirePermissions(PERMISSIONS.FILE_UPLOAD, PERMISSIONS.PROCESS_READ)
  @UseInterceptors(FileUploadInterceptor) @ApiConsumes('multipart/form-data') @uploadDocs() @ApiHeader({ name: 'Idempotency-Key', required: true }) @ApiCreatedResponse({ type: [FileMetadataDto] })
  uploadProcess(@Param('id', new ParseUUIDPipe()) id: string, @Req() request: UploadRequest, @Headers('idempotency-key') key: string) {
    return this.files.upload({ processId: id }, request.files ?? [], request.authenticatedUser.id, key);
  }
  @Post('communications/:id/attachments') @RequirePermissions(PERMISSIONS.FILE_UPLOAD, PERMISSIONS.PROCESS_READ, PERMISSIONS.COMMUNICATION_READ)
  @UseInterceptors(FileUploadInterceptor) @ApiConsumes('multipart/form-data') @uploadDocs() @ApiHeader({ name: 'Idempotency-Key', required: true }) @ApiCreatedResponse({ type: [FileMetadataDto] })
  uploadCommunication(@Param('id', new ParseUUIDPipe()) id: string, @Req() request: UploadRequest, @Headers('idempotency-key') key: string) {
    return this.files.upload({ communicationId: id }, request.files ?? [], request.authenticatedUser.id, key);
  }
  @Get('relationship-processes/:id/attachments') @Header('Cache-Control', 'no-store') @RequirePermissions(PERMISSIONS.FILE_READ, PERMISSIONS.PROCESS_READ) @ApiOkResponse({ type: FilePageDto })
  listProcess(@Param('id', new ParseUUIDPipe()) id: string, @Query() query: FilePaginationDto, @Req() request: AuthenticatedRequest) { return this.files.list({ processId: id }, query, request.authenticatedUser.id); }
  @Get('communications/:id/attachments') @Header('Cache-Control', 'no-store') @RequirePermissions(PERMISSIONS.FILE_READ, PERMISSIONS.PROCESS_READ, PERMISSIONS.COMMUNICATION_READ) @ApiOkResponse({ type: FilePageDto })
  listCommunication(@Param('id', new ParseUUIDPipe()) id: string, @Query() query: FilePaginationDto, @Req() request: AuthenticatedRequest) { return this.files.list({ communicationId: id }, query, request.authenticatedUser.id); }
  @Get('files/:id') @Header('Cache-Control', 'no-store') @RequirePermissions(PERMISSIONS.FILE_READ) @ApiOkResponse({ type: FileMetadataDto })
  get(@Param('id', new ParseUUIDPipe()) id: string, @Req() request: AuthenticatedRequest) { return this.files.get(id, request.authenticatedUser.id); }
  @Get('files/:id/download') @RequirePermissions(PERMISSIONS.FILE_READ)
  async download(@Param('id', new ParseUUIDPipe()) id: string, @Req() request: AuthenticatedRequest, @Res({ passthrough: true }) response: Response) {
    const { file, stream } = await this.files.download(id, request.authenticatedUser.id);
    response.setHeader('Cache-Control', 'private, no-store'); response.setHeader('X-Content-Type-Options', 'nosniff');
    const filename = encodeURIComponent(file.originalName).replace(/['()*]/g, char => '%' + char.charCodeAt(0).toString(16));
    return new StreamableFile(stream, { type: file.mimeType, length: file.sizeBytes, disposition: `attachment; filename="download"; filename*=UTF-8''${filename}` });
  }
}
