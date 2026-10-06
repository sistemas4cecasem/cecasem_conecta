import { Body, Controller, Header, HttpCode, Post, Req, Res, UseFilters } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../auth/session.guard';
import { RequirePermissions } from '../../auth/authorization/require-permissions.decorator';
import { PERMISSIONS } from '../../auth/authorization/permission';
import { DirectoryErrorFilter } from '../../directory/directory-error.filter';
import { ProcessErrorFilter } from '../../relationships/relationship-process-error.filter';
import { OpportunityErrorFilter } from '../../opportunities/opportunity-error.filter';
import { ExportRequestDto } from './export.dto';
import { DataExportService } from './data-export.service';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@ApiTags('data-export') @ApiCookieAuth('cecasem_session') @UseFilters(DirectoryErrorFilter, ProcessErrorFilter, OpportunityErrorFilter)
@Controller('data-exchange/exports')
export class ExportController {
  constructor(private readonly exports: DataExportService) {}

  private async download(type: 'organizations' | 'contacts' | 'processes' | 'opportunities', body: ExportRequestDto,
    request: AuthenticatedRequest, response: Response) {
    const file = await this.exports.create(type, body.filters, request.authenticatedUser.id);
    response.setHeader('Content-Type', XLSX_MIME);
    response.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    response.setHeader('Content-Length', file.buffer.length);
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.status(200).send(file.buffer);
  }

  @Post('organizations/preview') @HttpCode(200) @Header('Cache-Control', 'no-store') @RequirePermissions(PERMISSIONS.DIRECTORY_READ)
  @ApiBody({ type: ExportRequestDto }) @ApiOperation({ summary: 'Contar organizaciones con los filtros de exportación' })
  previewOrganizations(@Body() body: ExportRequestDto, @Req() request: AuthenticatedRequest) { return this.exports.preview('organizations', body.filters, request.authenticatedUser.id); }
  @Post('organizations') @RequirePermissions(PERMISSIONS.DIRECTORY_READ) @ApiProduces(XLSX_MIME)
  organizations(@Body() body: ExportRequestDto, @Req() request: AuthenticatedRequest, @Res() response: Response) { return this.download('organizations', body, request, response); }

  @Post('contacts/preview') @HttpCode(200) @Header('Cache-Control', 'no-store') @RequirePermissions(PERMISSIONS.DIRECTORY_READ)
  @ApiBody({ type: ExportRequestDto }) @ApiOperation({ summary: 'Contar contactos con los filtros de exportación' })
  previewContacts(@Body() body: ExportRequestDto, @Req() request: AuthenticatedRequest) { return this.exports.preview('contacts', body.filters, request.authenticatedUser.id); }
  @Post('contacts') @RequirePermissions(PERMISSIONS.DIRECTORY_READ) @ApiProduces(XLSX_MIME)
  contacts(@Body() body: ExportRequestDto, @Req() request: AuthenticatedRequest, @Res() response: Response) { return this.download('contacts', body, request, response); }

  @Post('processes/preview') @HttpCode(200) @Header('Cache-Control', 'no-store') @RequirePermissions(PERMISSIONS.PROCESS_READ)
  @ApiBody({ type: ExportRequestDto }) @ApiOperation({ summary: 'Contar procesos con los filtros de exportación' })
  previewProcesses(@Body() body: ExportRequestDto, @Req() request: AuthenticatedRequest) { return this.exports.preview('processes', body.filters, request.authenticatedUser.id); }
  @Post('processes') @RequirePermissions(PERMISSIONS.PROCESS_READ) @ApiProduces(XLSX_MIME)
  processes(@Body() body: ExportRequestDto, @Req() request: AuthenticatedRequest, @Res() response: Response) { return this.download('processes', body, request, response); }

  @Post('opportunities/preview') @HttpCode(200) @Header('Cache-Control', 'no-store') @RequirePermissions(PERMISSIONS.OPPORTUNITY_READ)
  @ApiBody({ type: ExportRequestDto }) @ApiOperation({ summary: 'Contar oportunidades con los filtros de exportación' })
  previewOpportunities(@Body() body: ExportRequestDto, @Req() request: AuthenticatedRequest) { return this.exports.preview('opportunities', body.filters, request.authenticatedUser.id); }
  @Post('opportunities') @RequirePermissions(PERMISSIONS.OPPORTUNITY_READ) @ApiProduces(XLSX_MIME)
  opportunities(@Body() body: ExportRequestDto, @Req() request: AuthenticatedRequest, @Res() response: Response) { return this.download('opportunities', body, request, response); }
}
