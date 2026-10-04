import { Body, Controller, Get, Header, Headers, Param, ParseUUIDPipe, Post, Query, Req, UseFilters } from '@nestjs/common';
import { ApiCookieAuth, ApiCreatedResponse, ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { RequirePermissions } from '../auth/authorization/require-permissions.decorator';
import { PERMISSIONS } from '../auth/authorization/permission';
import { AmendmentDto, AmendmentQueryDto, AmendmentsPageDto, CreateAmendmentDto, InvalidateCommunicationDto } from './communication-amendment.dto';
import { CommunicationAmendmentsService } from './communication-amendments.service';
import { AmendmentErrorFilter } from './communication-amendment-error.filter';
@ApiTags('communications') @ApiCookieAuth('cecasem_session') @UseFilters(AmendmentErrorFilter) @Controller('communications')
export class CommunicationAmendmentsController {
  constructor(private readonly amendments: CommunicationAmendmentsService) {}
  @Get(':id/amendments') @Header('Cache-Control', 'no-store') @RequirePermissions(PERMISSIONS.COMMUNICATION_READ, PERMISSIONS.PROCESS_READ) @ApiOkResponse({ type: AmendmentsPageDto })
  list(@Param('id', new ParseUUIDPipe()) id: string, @Query() query: AmendmentQueryDto, @Req() request: AuthenticatedRequest) { return this.amendments.list(id, query.page, request.authenticatedUser.id); }
  @Post(':id/amendments') @RequirePermissions(PERMISSIONS.COMMUNICATION_AMEND, PERMISSIONS.COMMUNICATION_READ, PERMISSIONS.PROCESS_READ) @ApiHeader({ name: 'Idempotency-Key', required: true }) @ApiCreatedResponse({ type: AmendmentDto })
  create(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: CreateAmendmentDto, @Headers('idempotency-key') key: string, @Req() request: AuthenticatedRequest) { return this.amendments.create(id, body.type, body.content, request.authenticatedUser.id, key); }
  @Post(':id/invalidate') @RequirePermissions(PERMISSIONS.COMMUNICATION_INVALIDATE, PERMISSIONS.COMMUNICATION_READ, PERMISSIONS.PROCESS_READ) @ApiHeader({ name: 'Idempotency-Key', required: true }) @ApiCreatedResponse({ type: AmendmentDto })
  invalidate(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: InvalidateCommunicationDto, @Headers('idempotency-key') key: string, @Req() request: AuthenticatedRequest) { return this.amendments.create(id, 'INVALIDATION', body.reason, request.authenticatedUser.id, key); }
}
