import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, Query, Req, UseFilters } from '@nestjs/common';
import { ApiCookieAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { RequirePermissions } from '../auth/authorization/require-permissions.decorator';
import { PERMISSIONS } from '../auth/authorization/permission';
import { ContactRestrictionDto, ContactRestrictionPageDto, ContactRestrictionQueryDto, CreateContactRestrictionDto, LiftContactRestrictionDto } from './contact-restriction.dto';
import { RestrictionErrorFilter } from './contact-restriction-error.filter';
import { ContactRestrictionsService } from './contact-restrictions.service';
@ApiTags('contact-restrictions') @ApiCookieAuth('cecasem_session') @UseFilters(RestrictionErrorFilter) @Controller('contact-restrictions')
export class ContactRestrictionsController {
  constructor(private readonly restrictions: ContactRestrictionsService) {}
  @Get() @Header('Cache-Control', 'no-store') @RequirePermissions(PERMISSIONS.RESTRICTION_READ) @ApiOkResponse({ type: ContactRestrictionPageDto })
  list(@Query() query: ContactRestrictionQueryDto, @Req() request: AuthenticatedRequest) { return this.restrictions.list(query, request.authenticatedUser.id); }
  @Post() @RequirePermissions(PERMISSIONS.RESTRICTION_CREATE) @ApiCreatedResponse({ type: ContactRestrictionDto })
  create(@Body() body: CreateContactRestrictionDto, @Req() request: AuthenticatedRequest) { return this.restrictions.create(body, request.authenticatedUser.id); }
  @Get(':id') @Header('Cache-Control', 'no-store') @RequirePermissions(PERMISSIONS.RESTRICTION_READ) @ApiOkResponse({ type: ContactRestrictionDto })
  get(@Param('id', new ParseUUIDPipe()) id: string, @Req() request: AuthenticatedRequest) { return this.restrictions.get(id, request.authenticatedUser.id); }
  @Post(':id/lift') @RequirePermissions(PERMISSIONS.RESTRICTION_LIFT) @ApiCreatedResponse({ type: ContactRestrictionDto })
  lift(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: LiftContactRestrictionDto, @Req() request: AuthenticatedRequest) { return this.restrictions.lift(id, body, request.authenticatedUser.id); }
}
