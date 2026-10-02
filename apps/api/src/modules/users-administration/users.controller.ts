import { Body, Controller, Delete, Get, Header, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, UseFilters } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiCreatedResponse, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/authorization/require-permissions.decorator';
import { PERMISSIONS } from '../auth/authorization/permission';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { UserAccessService } from '../auth/user-access.service';
import { UsersAdministrationService } from './users-administration.service';
import { AdministrativeUserDto, ChangeRoleDto, CreateUserDto, UsersQueryDto } from './administration.dto';
import { AdministrationErrorFilter } from './administration-error.filter';

@ApiTags('users') @ApiCookieAuth('cecasem_session') @UseFilters(AdministrationErrorFilter) @Controller('users')
export class UsersController {
  constructor(private readonly administration: UsersAdministrationService, private readonly access: UserAccessService) {}

  @Get() @Header('Cache-Control', 'no-store') @RequirePermissions(PERMISSIONS.USERS_READ)
  @ApiOkResponse({ type: AdministrativeUserDto, isArray: true })
  list(@Query() query: UsersQueryDto, @Req() request: AuthenticatedRequest) {
    return this.administration.list(query.status, request.authenticatedUser);
  }
  @Post() @RequirePermissions(PERMISSIONS.USERS_CREATE) @ApiCreatedResponse({ type: AdministrativeUserDto })
  create(@Body() body: CreateUserDto, @Req() request: AuthenticatedRequest) {
    return this.administration.create(body, request.authenticatedUser.id);
  }
  @Patch(':id/role') @HttpCode(204) @RequirePermissions(PERMISSIONS.USERS_ROLE_UPDATE)
  role(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: ChangeRoleDto, @Req() request: AuthenticatedRequest) {
    return this.administration.changeRole(id, body.role, request.authenticatedUser.id);
  }
  @Post(':id/deactivate') @HttpCode(204) @RequirePermissions(PERMISSIONS.USERS_STATUS_UPDATE)
  deactivate(@Param('id', new ParseUUIDPipe()) id: string, @Req() request: AuthenticatedRequest) {
    return this.access.deactivate(id, request.authenticatedUser.id);
  }
  @Post(':id/reactivate') @HttpCode(204) @RequirePermissions(PERMISSIONS.USERS_STATUS_UPDATE)
  reactivate(@Param('id', new ParseUUIDPipe()) id: string, @Req() request: AuthenticatedRequest) {
    return this.administration.reactivate(id, request.authenticatedUser.id);
  }
  @Get(':id/email-accounts') @Header('Cache-Control', 'no-store') @RequirePermissions(PERMISSIONS.USERS_MAILBOXES_MANAGE)
  assignments(@Param('id', new ParseUUIDPipe()) id: string, @Req() request: AuthenticatedRequest) {
    return this.administration.assignments(id, request.authenticatedUser.id);
  }
  @Put(':id/email-accounts/:emailAccountId') @HttpCode(204) @RequirePermissions(PERMISSIONS.USERS_MAILBOXES_MANAGE)
  assign(@Param('id', new ParseUUIDPipe()) id: string, @Param('emailAccountId', new ParseUUIDPipe()) accountId: string, @Req() request: AuthenticatedRequest) {
    return this.administration.setMailbox(id, accountId, true, request.authenticatedUser.id);
  }
  @Delete(':id/email-accounts/:emailAccountId') @HttpCode(204) @RequirePermissions(PERMISSIONS.USERS_MAILBOXES_MANAGE)
  remove(@Param('id', new ParseUUIDPipe()) id: string, @Param('emailAccountId', new ParseUUIDPipe()) accountId: string, @Req() request: AuthenticatedRequest) {
    return this.administration.setMailbox(id, accountId, false, request.authenticatedUser.id);
  }
}
