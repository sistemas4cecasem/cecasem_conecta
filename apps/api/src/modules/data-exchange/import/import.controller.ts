import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, Query, Req, UploadedFile, UseFilters, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../../auth/session.guard';
import { RequirePermissions } from '../../auth/authorization/require-permissions.decorator';
import { PERMISSIONS } from '../../auth/authorization/permission';
import { ImportErrorFilter } from './import-error.filter';
import { ConfirmImportDto, ImportPreviewRequestDto, ImportRowsQueryDto } from './import.dto';
import { DataImportService } from './data-import.service';

const uploadInterceptor = FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024, files: 1, fields: 8, parts: 9 } });
type ImportUpload = { originalname: string; mimetype: string; buffer: Buffer };

@ApiTags('data-import') @ApiCookieAuth('cecasem_session') @UseFilters(ImportErrorFilter)
@Controller('data-exchange/imports')
export class ImportController {
  constructor(private readonly imports: DataImportService) {}

  @Post('inspect') @RequirePermissions(PERMISSIONS.DATA_IMPORT_EXECUTE) @UseInterceptors(uploadInterceptor)
  @ApiConsumes('multipart/form-data') @ApiBody({ schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiOperation({ summary: 'Inspeccionar la estructura de un XLSX sin guardar el archivo' })
  inspect(@UploadedFile() file: ImportUpload | undefined, @Req() request: AuthenticatedRequest) {
    return this.imports.inspect(file, request.authenticatedUser.id);
  }

  @Post('preview') @RequirePermissions(PERMISSIONS.DATA_IMPORT_EXECUTE) @UseInterceptors(uploadInterceptor)
  @ApiConsumes('multipart/form-data') @ApiBody({ schema: { type: 'object', required: ['file', 'worksheetName', 'headerRow', 'recordKind', 'columnMapping'], properties: {
    file: { type: 'string', format: 'binary' }, worksheetName: { type: 'string' }, headerRow: { type: 'integer' }, recordKind: { type: 'string', enum: ['ORGANIZATION', 'PERSON', 'CONTACT', 'HISTORICAL_RECORD'] }, columnMapping: { type: 'string' },
  } } })
  @ApiOperation({ summary: 'Crear un preview persistente, sin fichas de negocio' })
  preview(@UploadedFile() file: ImportUpload | undefined, @Body() body: ImportPreviewRequestDto, @Req() request: AuthenticatedRequest) {
    return this.imports.preview(file, body, request.authenticatedUser.id);
  }

  @Get() @Header('Cache-Control', 'no-store') @RequirePermissions(PERMISSIONS.DATA_IMPORT_EXECUTE)
  list(@Query() query: ImportRowsQueryDto, @Req() request: AuthenticatedRequest) { return this.imports.adminList(request.authenticatedUser.id, query.page, query.pageSize); }

  @Get(':id') @Header('Cache-Control', 'no-store') @RequirePermissions(PERMISSIONS.DATA_IMPORT_EXECUTE)
  get(@Param('id', new ParseUUIDPipe()) id: string, @Query() query: ImportRowsQueryDto, @Req() request: AuthenticatedRequest) {
    return this.imports.getBatch(id, request.authenticatedUser.id, query);
  }

  @Post(':id/confirm') @RequirePermissions(PERMISSIONS.DATA_IMPORT_EXECUTE)
  confirm(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: ConfirmImportDto, @Req() request: AuthenticatedRequest) {
    return this.imports.confirm(id, body.decisions ?? [], request.authenticatedUser.id);
  }
}
