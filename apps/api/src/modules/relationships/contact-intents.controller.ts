import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, Query, Req, UseFilters } from '@nestjs/common';
import { ApiCookieAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { RequirePermissions } from '../auth/authorization/require-permissions.decorator';
import { PERMISSIONS } from '../auth/authorization/permission';
import { CancelContactIntentDto, ContactIntentDto, ContactIntentPageDto, ContactIntentQueryDto, CreateContactIntentDto } from './contact-intent.dto';
import { IntentErrorFilter } from './contact-intent-error.filter';
import { ContactIntentsService } from './contact-intents.service';

@ApiTags('contact-intents') @ApiCookieAuth('cecasem_session') @UseFilters(IntentErrorFilter) @Controller('contact-intents')
export class ContactIntentsController {
  constructor(private readonly intents: ContactIntentsService) {}
  @Get() @Header('Cache-Control', 'no-store') @RequirePermissions(PERMISSIONS.INTENT_READ) @ApiOkResponse({ type: ContactIntentPageDto })
  list(@Query() query: ContactIntentQueryDto, @Req() request: AuthenticatedRequest) { return this.intents.list(query, request.authenticatedUser.id); }
  @Post() @RequirePermissions(PERMISSIONS.INTENT_CREATE) @ApiCreatedResponse({ type: ContactIntentDto })
  create(@Body() body: CreateContactIntentDto, @Req() request: AuthenticatedRequest) { return this.intents.create(body, request.authenticatedUser.id); }
  @Get(':id') @Header('Cache-Control', 'no-store') @RequirePermissions(PERMISSIONS.INTENT_READ) @ApiOkResponse({ type: ContactIntentDto })
  get(@Param('id', new ParseUUIDPipe()) id: string, @Req() request: AuthenticatedRequest) { return this.intents.get(id, request.authenticatedUser.id); }
  @Post(':id/cancel') @RequirePermissions(PERMISSIONS.INTENT_CANCEL) @ApiCreatedResponse({ type: ContactIntentDto })
  cancel(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: CancelContactIntentDto, @Req() request: AuthenticatedRequest) {
    return this.intents.cancel(id, body.expectedVersion, request.authenticatedUser.id);
  }
}
