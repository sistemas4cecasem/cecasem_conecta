import { OrganizationBranchesService } from './organization-branches.service';
import { OrganizationBranchCreateDto, OrganizationBranchEditDto } from './organization-branch.dto';
import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, UseFilters } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/authorization/require-permissions.decorator';
import { PERMISSIONS } from '../auth/authorization/permission';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { DirectoryService } from './directory.service';
import { DirectoryErrorFilter } from './directory-error.filter';
import { DirectoryQueryDto, DirectoryStatusDto, OrganizationInputDto, OrganizationEditDto, OrganizationQueryDto, PageQueryDto } from './directory.dto';

@ApiTags('organizations') @ApiCookieAuth('cecasem_session') @UseFilters(DirectoryErrorFilter) @Controller('organizations')
export class OrganizationsController {
  constructor(private readonly directory: DirectoryService,private readonly organizationBranches:OrganizationBranchesService) {}
  @Get() @Header('Cache-Control', 'no-store') @RequirePermissions(PERMISSIONS.DIRECTORY_READ)
  @ApiOperation({ summary: 'Listar organizaciones paginadas' })
  list(@Query() query: OrganizationQueryDto, @Req() request: AuthenticatedRequest) { return this.directory.listOrganizations(query, request.authenticatedUser.id); }
  @Get(':id') @Header('Cache-Control', 'no-store') @RequirePermissions(PERMISSIONS.DIRECTORY_READ)
  detail(@Param('id', new ParseUUIDPipe()) id: string) { return this.directory.getOrganization(id); }
  @Post() @RequirePermissions(PERMISSIONS.DIRECTORY_WRITE)
  create(@Body() body: OrganizationInputDto, @Req() request: AuthenticatedRequest) { return this.directory.createOrganization(body, request.authenticatedUser.id); }
  @Put(':id') @RequirePermissions(PERMISSIONS.DIRECTORY_WRITE)
  @ApiOperation({ summary: 'Reemplazar ficha, asociación de sede y áreas de interés con versión esperada' })
  edit(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: OrganizationEditDto, @Req() request: AuthenticatedRequest) { return this.directory.editOrganization(id, body, request.authenticatedUser.id); }
  @Patch(':id/status') @RequirePermissions(PERMISSIONS.DIRECTORY_STATUS_UPDATE)
  status(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: DirectoryStatusDto, @Req() request: AuthenticatedRequest) { return this.directory.organizationStatus(id, body, request.authenticatedUser.id); }
  @Post(':id/branches') @RequirePermissions(PERMISSIONS.DIRECTORY_WRITE)
  createBranch(@Param('id',new ParseUUIDPipe()) id:string,@Body() body:OrganizationBranchCreateDto,@Req() request:AuthenticatedRequest) {return this.organizationBranches.create(id,body,request.authenticatedUser.id);}
  @Get(':id/branches/:branchId/profile') @Header('Cache-Control','no-store') @RequirePermissions(PERMISSIONS.DIRECTORY_READ)
  branchProfile(@Param('id',new ParseUUIDPipe()) id:string,@Param('branchId',new ParseUUIDPipe()) branchId:string) {return this.organizationBranches.profile(id,branchId);}
  @Put(':id/branches/:branchId/profile') @RequirePermissions(PERMISSIONS.DIRECTORY_WRITE)
  editBranch(@Param('id',new ParseUUIDPipe()) id:string,@Param('branchId',new ParseUUIDPipe()) branchId:string,@Body() body:OrganizationBranchEditDto,@Req() request:AuthenticatedRequest) {return this.organizationBranches.edit(id,branchId,body,request.authenticatedUser.id);}
  @Get(':id/branches') @Header('Cache-Control', 'no-store') @RequirePermissions(PERMISSIONS.DIRECTORY_READ)
  branches(@Param('id', new ParseUUIDPipe()) id: string, @Query() query: DirectoryQueryDto) { return this.directory.branches(id, query); }
  @Get(':id/history') @Header('Cache-Control', 'no-store') @RequirePermissions(PERMISSIONS.DIRECTORY_HISTORY_READ)
  history(@Param('id', new ParseUUIDPipe()) id: string, @Query() query: PageQueryDto) { return this.directory.organizationHistory(id, query); }
}
