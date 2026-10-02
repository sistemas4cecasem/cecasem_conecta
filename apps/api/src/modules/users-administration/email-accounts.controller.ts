import { Body, Controller, Get, Header, Post, Req, UseFilters } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiCreatedResponse, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/authorization/require-permissions.decorator';
import { PERMISSIONS } from '../auth/authorization/permission';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { UsersAdministrationService } from './users-administration.service';
import { CreateEmailAccountDto, EmailAccountDto } from './administration.dto';
import { AdministrationErrorFilter } from './administration-error.filter';

@ApiTags('email-accounts') @ApiCookieAuth('cecasem_session') @UseFilters(AdministrationErrorFilter) @Controller('email-accounts')
export class EmailAccountsController {
  constructor(private readonly administration: UsersAdministrationService) {}
  @Get() @Header('Cache-Control', 'no-store') @RequirePermissions(PERMISSIONS.USERS_MAILBOXES_MANAGE)
  @ApiOkResponse({ type: EmailAccountDto, isArray: true })
  list(@Req() request: AuthenticatedRequest) { return this.administration.catalog(request.authenticatedUser.id); }
  @Post() @RequirePermissions(PERMISSIONS.USERS_MAILBOXES_MANAGE) @ApiCreatedResponse({ type: EmailAccountDto })
  create(@Body() body: CreateEmailAccountDto, @Req() request: AuthenticatedRequest) {
    return this.administration.createMailbox(body, request.authenticatedUser.id);
  }
}
