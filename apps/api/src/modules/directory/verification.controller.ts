import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, Query, Req, UseFilters } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/authorization/require-permissions.decorator';
import { PERMISSIONS } from '../auth/authorization/permission';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { DirectoryErrorFilter } from './directory-error.filter';
import { VerifyDto } from './verification.dto';
import { PageQueryDto } from './directory.dto';
import { VerificationService } from './verification.service';

@ApiTags('directory-verification') @ApiCookieAuth('cecasem_session') @UseFilters(DirectoryErrorFilter) @Controller('organizations')
export class OrganizationVerificationController {
  constructor(private readonly verification: VerificationService) {}
  @Get(':id/verification') @Header('Cache-Control', 'no-store') @RequirePermissions(PERMISSIONS.DIRECTORY_READ)
  status(@Param('id', new ParseUUIDPipe()) id: string) { return this.verification.status('organization', id); }
  @Post(':id/verify') @RequirePermissions(PERMISSIONS.DIRECTORY_VERIFY)
  verify(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: VerifyDto, @Req() request: AuthenticatedRequest) { return this.verification.verify('organization', id, body, request.authenticatedUser.id); }
  @Get(':id/verifications') @Header('Cache-Control', 'no-store') @RequirePermissions(PERMISSIONS.DIRECTORY_HISTORY_READ)
  history(@Param('id', new ParseUUIDPipe()) id: string, @Query() query: PageQueryDto) { return this.verification.history('organization', id, query); }
}

@ApiTags('directory-verification') @ApiCookieAuth('cecasem_session') @UseFilters(DirectoryErrorFilter) @Controller('people')
export class PersonVerificationController {
  constructor(private readonly verification: VerificationService) {}
  @Get(':id/verification') @Header('Cache-Control', 'no-store') @RequirePermissions(PERMISSIONS.DIRECTORY_READ)
  status(@Param('id', new ParseUUIDPipe()) id: string) { return this.verification.status('person', id); }
  @Post(':id/verify') @RequirePermissions(PERMISSIONS.DIRECTORY_VERIFY)
  verify(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: VerifyDto, @Req() request: AuthenticatedRequest) { return this.verification.verify('person', id, body, request.authenticatedUser.id); }
  @Get(':id/verifications') @Header('Cache-Control', 'no-store') @RequirePermissions(PERMISSIONS.DIRECTORY_HISTORY_READ)
  history(@Param('id', new ParseUUIDPipe()) id: string, @Query() query: PageQueryDto) { return this.verification.history('person', id, query); }
}

@ApiTags('directory-verification') @ApiCookieAuth('cecasem_session') @UseFilters(DirectoryErrorFilter) @Controller('person-organization-relations')
export class RelationVerificationController {
  constructor(private readonly verification: VerificationService) {}
  @Get(':id/verification') @Header('Cache-Control', 'no-store') @RequirePermissions(PERMISSIONS.DIRECTORY_READ)
  status(@Param('id', new ParseUUIDPipe()) id: string) { return this.verification.status('relation', id); }
  @Post(':id/verify') @RequirePermissions(PERMISSIONS.DIRECTORY_VERIFY)
  verify(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: VerifyDto, @Req() request: AuthenticatedRequest) { return this.verification.verify('relation', id, body, request.authenticatedUser.id); }
  @Get(':id/verifications') @Header('Cache-Control', 'no-store') @RequirePermissions(PERMISSIONS.DIRECTORY_HISTORY_READ)
  history(@Param('id', new ParseUUIDPipe()) id: string, @Query() query: PageQueryDto) { return this.verification.history('relation', id, query); }
}

@ApiTags('directory-verification') @ApiCookieAuth('cecasem_session') @UseFilters(DirectoryErrorFilter) @Controller('person-contacts')
export class PersonContactVerificationController {
  constructor(private readonly verification: VerificationService) {}
  @Get(':id/verification') @Header('Cache-Control', 'no-store') @RequirePermissions(PERMISSIONS.DIRECTORY_READ)
  status(@Param('id', new ParseUUIDPipe()) id: string) { return this.verification.status('personContact', id); }
  @Post(':id/verify') @RequirePermissions(PERMISSIONS.DIRECTORY_VERIFY)
  verify(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: VerifyDto, @Req() request: AuthenticatedRequest) { return this.verification.verify('personContact', id, body, request.authenticatedUser.id); }
  @Get(':id/verifications') @Header('Cache-Control', 'no-store') @RequirePermissions(PERMISSIONS.DIRECTORY_HISTORY_READ)
  history(@Param('id', new ParseUUIDPipe()) id: string, @Query() query: PageQueryDto) { return this.verification.history('personContact', id, query); }
}

@ApiTags('directory-verification') @ApiCookieAuth('cecasem_session') @UseFilters(DirectoryErrorFilter) @Controller('organization-contacts')
export class OrganizationContactVerificationController {
  constructor(private readonly verification: VerificationService) {}
  @Get(':id/verification') @Header('Cache-Control', 'no-store') @RequirePermissions(PERMISSIONS.DIRECTORY_READ)
  status(@Param('id', new ParseUUIDPipe()) id: string) { return this.verification.status('organizationContact', id); }
  @Post(':id/verify') @RequirePermissions(PERMISSIONS.DIRECTORY_VERIFY)
  verify(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: VerifyDto, @Req() request: AuthenticatedRequest) { return this.verification.verify('organizationContact', id, body, request.authenticatedUser.id); }
  @Get(':id/verifications') @Header('Cache-Control', 'no-store') @RequirePermissions(PERMISSIONS.DIRECTORY_HISTORY_READ)
  history(@Param('id', new ParseUUIDPipe()) id: string, @Query() query: PageQueryDto) { return this.verification.history('organizationContact', id, query); }
}
