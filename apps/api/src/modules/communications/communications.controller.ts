import { Body, Controller, Get, Header, Headers, Param, ParseUUIDPipe, Post, Query, Req, UseFilters } from '@nestjs/common';
import { ApiCookieAuth, ApiCreatedResponse, ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { RequirePermissions } from '../auth/authorization/require-permissions.decorator';
import { PERMISSIONS } from '../auth/authorization/permission';
import { ProcessErrorFilter } from '../relationships/relationship-process-error.filter';
import { RestrictionErrorFilter } from '../relationships/contact-restriction-error.filter';
import { CommunicationErrorFilter } from './communication-error.filter';
import { AvailableCommunicationAccountDto, CommunicationDto, CommunicationPaginationDto, CommunicationsPageDto, CreateSentCommunicationDto, CreateReceivedCommunicationDto } from './communication.dto';
import { CommunicationsService } from './communications.service';
@ApiTags('communications') @ApiCookieAuth('cecasem_session') @UseFilters(CommunicationErrorFilter, ProcessErrorFilter, RestrictionErrorFilter) @Controller()
export class CommunicationsController {
  constructor(private readonly communications: CommunicationsService) {}
  @Get('me/email-accounts') @Header('Cache-Control', 'no-store') @RequirePermissions(PERMISSIONS.SENT_COMMUNICATION_CREATE, PERMISSIONS.PROCESS_READ) @ApiOkResponse({ type: [AvailableCommunicationAccountDto] })
  accounts(@Req() request: AuthenticatedRequest) { return this.communications.availableAccounts(request.authenticatedUser.id); }
  @Post('relationship-processes/:id/communications/sent') @RequirePermissions(PERMISSIONS.SENT_COMMUNICATION_CREATE, PERMISSIONS.PROCESS_READ) @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'UUID único del intento de registro; reutilizar únicamente para reintentar el mismo original.' }) @ApiCreatedResponse({ type: CommunicationDto })
  register(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: CreateSentCommunicationDto, @Headers('idempotency-key') requestKey: string, @Req() request: AuthenticatedRequest) {
    return this.communications.registerSent(id, body, request.authenticatedUser.id, requestKey);
  }
  @Post('relationship-processes/:id/communications/received') @RequirePermissions(PERMISSIONS.RECEIVED_COMMUNICATION_CREATE, PERMISSIONS.PROCESS_READ) @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'UUID del registro; reutilizar para el mismo original recibido.' }) @ApiCreatedResponse({ type: CommunicationDto })
  registerReceived(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: CreateReceivedCommunicationDto, @Headers('idempotency-key') requestKey: string, @Req() request: AuthenticatedRequest) {
    return this.communications.registerReceived(id, body, request.authenticatedUser.id, requestKey);
  }
  @Get('communications/:id') @Header('Cache-Control', 'no-store') @RequirePermissions(PERMISSIONS.COMMUNICATION_READ, PERMISSIONS.PROCESS_READ) @ApiOkResponse({ type: CommunicationDto })
  get(@Param('id', new ParseUUIDPipe()) id: string, @Req() request: AuthenticatedRequest) { return this.communications.get(id, request.authenticatedUser.id); }
  @Get('relationship-processes/:id/communications') @Header('Cache-Control', 'no-store') @RequirePermissions(PERMISSIONS.COMMUNICATION_READ, PERMISSIONS.PROCESS_READ) @ApiOkResponse({ type: CommunicationsPageDto })
  list(@Param('id', new ParseUUIDPipe()) id: string, @Query() query: CommunicationPaginationDto, @Req() request: AuthenticatedRequest) { return this.communications.list(id, query, request.authenticatedUser.id); }
}
