import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, Query, Req, UseFilters } from '@nestjs/common';
import { ApiCookieAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { RequirePermissions } from '../auth/authorization/require-permissions.decorator';
import { PERMISSIONS } from '../auth/authorization/permission';
import { ChangeProcessStateDto, CloseProcessDto, CreateRelationshipProcessDto, ProcessDetailDto, ProcessEventPageDto, ProcessPageDto, ProcessPaginationDto, ProcessParticipantDto, ProcessQueryDto, ReopenProcessDto } from './relationship-process.dto';
import { ProcessErrorFilter } from './relationship-process-error.filter';
import { RelationshipProcessesService } from './relationship-processes.service';
import { RestrictionErrorFilter } from './contact-restriction-error.filter';

@ApiTags('relationship-processes') @ApiCookieAuth('cecasem_session') @UseFilters(ProcessErrorFilter, RestrictionErrorFilter) @Controller('relationship-processes')
export class RelationshipProcessesController {
  constructor(private readonly processes: RelationshipProcessesService) {}
  @Get() @Header('Cache-Control', 'no-store') @RequirePermissions(PERMISSIONS.PROCESS_READ) @ApiOkResponse({ type: ProcessPageDto })
  list(@Query() query: ProcessQueryDto, @Req() request: AuthenticatedRequest) { return this.processes.list(query, request.authenticatedUser.id); }
  @Post() @RequirePermissions(PERMISSIONS.PROCESS_CREATE) @ApiCreatedResponse({ type: ProcessDetailDto })
  create(@Body() body: CreateRelationshipProcessDto, @Req() request: AuthenticatedRequest) { return this.processes.create(body, request.authenticatedUser.id); }
  @Get(':id') @Header('Cache-Control', 'no-store') @RequirePermissions(PERMISSIONS.PROCESS_READ) @ApiOkResponse({ type: ProcessDetailDto })
  get(@Param('id', new ParseUUIDPipe()) id: string, @Req() request: AuthenticatedRequest) { return this.processes.get(id, request.authenticatedUser.id); }
  @Get(':id/participants') @Header('Cache-Control', 'no-store') @RequirePermissions(PERMISSIONS.PROCESS_READ) @ApiOkResponse({ type: [ProcessParticipantDto] })
  participants(@Param('id', new ParseUUIDPipe()) id: string, @Req() request: AuthenticatedRequest) { return this.processes.participants(id, request.authenticatedUser.id); }
  @Get(':id/events') @Header('Cache-Control', 'no-store') @RequirePermissions(PERMISSIONS.PROCESS_READ) @ApiOkResponse({ type: ProcessEventPageDto })
  events(@Param('id', new ParseUUIDPipe()) id: string, @Query() query: ProcessPaginationDto, @Req() request: AuthenticatedRequest) { return this.processes.events(id, query, request.authenticatedUser.id); }
  @Post(':id/state') @RequirePermissions(PERMISSIONS.PROCESS_STATE_CHANGE) @ApiCreatedResponse({ type: ProcessDetailDto })
  state(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: ChangeProcessStateDto, @Req() request: AuthenticatedRequest) { return this.processes.changeState(id, body, request.authenticatedUser.id); }
  @Post(':id/close') @RequirePermissions(PERMISSIONS.PROCESS_CLOSE) @ApiCreatedResponse({ type: ProcessDetailDto })
  close(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: CloseProcessDto, @Req() request: AuthenticatedRequest) { return this.processes.close(id, body, request.authenticatedUser.id); }
  @Post(':id/reopen') @RequirePermissions(PERMISSIONS.PROCESS_REOPEN) @ApiCreatedResponse({ type: ProcessDetailDto })
  reopen(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: ReopenProcessDto, @Req() request: AuthenticatedRequest) { return this.processes.reopen(id, body, request.authenticatedUser.id); }
}
