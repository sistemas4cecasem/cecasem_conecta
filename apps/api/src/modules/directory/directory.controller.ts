import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, UseFilters } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/authorization/require-permissions.decorator';
import { PERMISSIONS } from '../auth/authorization/permission';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { DirectoryService } from './directory.service';
import { DirectoryErrorFilter } from './directory-error.filter';
import { CategoryInputDto, CategoryEditDto, DirectoryQueryDto, DirectoryStatusDto, OrganizationInputDto, OrganizationEditDto, OrganizationQueryDto, PageQueryDto } from './directory.dto';

@ApiTags('organizations') @ApiCookieAuth('cecasem_session') @UseFilters(DirectoryErrorFilter) @Controller('organizations')
export class OrganizationsController {
  constructor(private readonly directory: DirectoryService) {}
  @Get() @Header('Cache-Control', 'no-store') @RequirePermissions(PERMISSIONS.DIRECTORY_READ)
  @ApiOperation({ summary: 'Listar organizaciones paginadas' })
  list(@Query() query: OrganizationQueryDto, @Req() request: AuthenticatedRequest) { return this.directory.listOrganizations(query, request.authenticatedUser.id); }
  @Get(':id') @Header('Cache-Control', 'no-store') @RequirePermissions(PERMISSIONS.DIRECTORY_READ)
  detail(@Param('id', new ParseUUIDPipe()) id: string) { return this.directory.getOrganization(id); }
  @Post() @RequirePermissions(PERMISSIONS.DIRECTORY_WRITE)
  create(@Body() body: OrganizationInputDto, @Req() request: AuthenticatedRequest) { return this.directory.createOrganization(body, request.authenticatedUser.id); }
  @Put(':id') @RequirePermissions(PERMISSIONS.DIRECTORY_WRITE)
  @ApiOperation({ summary: 'Reemplazar ficha, matriz y categorías con versión esperada' })
  edit(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: OrganizationEditDto, @Req() request: AuthenticatedRequest) { return this.directory.editOrganization(id, body, request.authenticatedUser.id); }
  @Patch(':id/status') @RequirePermissions(PERMISSIONS.DIRECTORY_STATUS_UPDATE)
  status(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: DirectoryStatusDto, @Req() request: AuthenticatedRequest) { return this.directory.organizationStatus(id, body, request.authenticatedUser.id); }
  @Get(':id/children') @Header('Cache-Control', 'no-store') @RequirePermissions(PERMISSIONS.DIRECTORY_READ)
  children(@Param('id', new ParseUUIDPipe()) id: string, @Query() query: DirectoryQueryDto) { return this.directory.children(id, query); }
  @Get(':id/history') @Header('Cache-Control', 'no-store') @RequirePermissions(PERMISSIONS.DIRECTORY_HISTORY_READ)
  history(@Param('id', new ParseUUIDPipe()) id: string, @Query() query: PageQueryDto) { return this.directory.organizationHistory(id, query); }
}
@ApiTags('categories') @ApiCookieAuth('cecasem_session') @UseFilters(DirectoryErrorFilter) @Controller('categories')
export class CategoriesController {
  constructor(private readonly directory: DirectoryService) {}
  @Get() @Header('Cache-Control', 'no-store') @RequirePermissions(PERMISSIONS.DIRECTORY_READ)
  list(@Query() query: DirectoryQueryDto) { return this.directory.listCategories(query); }
  @Post() @RequirePermissions(PERMISSIONS.DIRECTORY_WRITE)
  create(@Body() body: CategoryInputDto, @Req() request: AuthenticatedRequest) { return this.directory.createCategory(body, request.authenticatedUser.id); }
  @Put(':id') @RequirePermissions(PERMISSIONS.DIRECTORY_WRITE)
  edit(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: CategoryEditDto, @Req() request: AuthenticatedRequest) { return this.directory.editCategory(id, body, request.authenticatedUser.id); }
  @Patch(':id/status') @RequirePermissions(PERMISSIONS.DIRECTORY_STATUS_UPDATE)
  status(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: DirectoryStatusDto, @Req() request: AuthenticatedRequest) { return this.directory.categoryStatus(id, body, request.authenticatedUser.id); }
  @Get(':id/history') @Header('Cache-Control', 'no-store') @RequirePermissions(PERMISSIONS.DIRECTORY_HISTORY_READ)
  history(@Param('id', new ParseUUIDPipe()) id: string, @Query() query: PageQueryDto) { return this.directory.categoryHistory(id, query); }
}
