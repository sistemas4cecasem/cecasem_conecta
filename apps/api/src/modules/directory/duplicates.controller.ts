import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, Query, Req, UseFilters } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '../auth/authorization/permission';
import { RequirePermissions } from '../auth/authorization/require-permissions.decorator';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { DirectoryErrorFilter } from './directory-error.filter';
import { PageQueryDto } from './directory.dto';
import { ConsolidateDto, ConsolidationPreviewDto, DuplicateDecisionDto } from './duplicates.dto';
import { DuplicateDetectionService } from './duplicate-detection.service';
import { ConsolidationService } from './consolidation.service';

@ApiTags('directory-duplicates') @ApiCookieAuth('cecasem_session') @UseFilters(DirectoryErrorFilter) @Controller('duplicate-candidates')
export class DuplicateCandidatesController {
  constructor(private readonly detection: DuplicateDetectionService, private readonly consolidation: ConsolidationService) {}
  @Get() @Header('Cache-Control', 'no-store') @RequirePermissions(PERMISSIONS.DIRECTORY_READ)
  @ApiOperation({ summary: 'Consultar candidatos pendientes paginados' })
  list(@Query() query: PageQueryDto) { return this.detection.listPending(query); }
  @Post(':id/dismiss') @RequirePermissions(PERMISSIONS.DIRECTORY_DUPLICATES_DISMISS)
  @ApiOperation({ summary: 'Indicar que dos fichas no son duplicadas, sin modificarlas' })
  dismiss(@Param('id', new ParseUUIDPipe()) id: string, @Body() input: DuplicateDecisionDto, @Req() request: AuthenticatedRequest) {
    return this.detection.dismiss(id, input, request.authenticatedUser.id);
  }
  @Get(':id/consolidation-preview') @Header('Cache-Control', 'no-store') @RequirePermissions(PERMISSIONS.DIRECTORY_DUPLICATES_MANAGE)
  @ApiOperation({ summary: 'Revisar principal elegido, referencias y efectos de consolidación' })
  preview(@Param('id', new ParseUUIDPipe()) id: string, @Query() input: ConsolidationPreviewDto, @Req() request: AuthenticatedRequest) {
    return this.consolidation.preview(id, input.principalId, request.authenticatedUser.id);
  }
  @Post(':id/consolidate') @RequirePermissions(PERMISSIONS.DIRECTORY_DUPLICATES_MANAGE)
  @ApiOperation({ summary: 'Consolidar con revisión de versiones y confirmación de efectos' })
  consolidate(@Param('id', new ParseUUIDPipe()) id: string, @Body() input: ConsolidateDto, @Req() request: AuthenticatedRequest) {
    return this.consolidation.consolidate(id, input, request.authenticatedUser.id);
  }
}
@ApiTags('directory-duplicates') @ApiCookieAuth('cecasem_session') @UseFilters(DirectoryErrorFilter) @Controller('organizations')
export class OrganizationDuplicatesController {
  constructor(private readonly detection: DuplicateDetectionService) {}
  @Get(':id/duplicate-candidates') @Header('Cache-Control', 'no-store') @RequirePermissions(PERMISSIONS.DIRECTORY_READ)
  @ApiOperation({ summary: 'Reevaluar posibles organizaciones duplicadas de esta ficha' })
  list(@Param('id', new ParseUUIDPipe()) id: string, @Query() query: PageQueryDto, @Req() request: AuthenticatedRequest) {
    return this.detection.listActor('organization', id, query, request.authenticatedUser.id);
  }
}
@ApiTags('directory-duplicates') @ApiCookieAuth('cecasem_session') @UseFilters(DirectoryErrorFilter) @Controller('people')
export class PersonDuplicatesController {
  constructor(private readonly detection: DuplicateDetectionService) {}
  @Get(':id/duplicate-candidates') @Header('Cache-Control', 'no-store') @RequirePermissions(PERMISSIONS.DIRECTORY_READ)
  @ApiOperation({ summary: 'Reevaluar posibles personas duplicadas de esta ficha' })
  list(@Param('id', new ParseUUIDPipe()) id: string, @Query() query: PageQueryDto, @Req() request: AuthenticatedRequest) {
    return this.detection.listActor('person', id, query, request.authenticatedUser.id);
  }
}
