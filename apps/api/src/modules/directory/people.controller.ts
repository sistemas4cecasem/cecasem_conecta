import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, UseFilters } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/authorization/require-permissions.decorator';
import { PERMISSIONS } from '../auth/authorization/permission';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { DirectoryErrorFilter } from './directory-error.filter';
import { DirectoryStatusDto, PageQueryDto } from './directory.dto';
import { PeopleQueryDto, PersonEditDto, PersonInputDto, RelationCreateDto, RelationEditDto, RelationEndDto, RelationsQueryDto } from './people.dto';
import { PeopleService } from './people.service';

@ApiTags('people') @ApiCookieAuth('cecasem_session') @UseFilters(DirectoryErrorFilter) @Controller('people')
export class PeopleController {
  constructor(private readonly people:PeopleService) {}
  @Get() @Header('Cache-Control','no-store') @RequirePermissions(PERMISSIONS.DIRECTORY_READ)
  @ApiOperation({summary:'Listar personas externas paginadas'})
  list(@Query() query:PeopleQueryDto) {return this.people.list(query);}
  @Get(':id') @Header('Cache-Control','no-store') @RequirePermissions(PERMISSIONS.DIRECTORY_READ)
  get(@Param('id',new ParseUUIDPipe()) id:string) {return this.people.get(id);}
  @Post() @RequirePermissions(PERMISSIONS.DIRECTORY_WRITE)
  create(@Body() body:PersonInputDto,@Req() req:AuthenticatedRequest) {return this.people.create(body,req.authenticatedUser.id);}
  @Put(':id') @RequirePermissions(PERMISSIONS.DIRECTORY_WRITE)
  edit(@Param('id',new ParseUUIDPipe()) id:string,@Body() body:PersonEditDto,@Req() req:AuthenticatedRequest) {return this.people.edit(id,body,req.authenticatedUser.id);}
  @Patch(':id/status') @RequirePermissions(PERMISSIONS.DIRECTORY_STATUS_UPDATE)
  status(@Param('id',new ParseUUIDPipe()) id:string,@Body() body:DirectoryStatusDto,@Req() req:AuthenticatedRequest) {return this.people.status(id,body,req.authenticatedUser.id);}
  @Get(':id/history') @Header('Cache-Control','no-store') @RequirePermissions(PERMISSIONS.DIRECTORY_HISTORY_READ)
  history(@Param('id',new ParseUUIDPipe()) id:string,@Query() query:PageQueryDto) {return this.people.personHistory(id,query);}
  @Get(':id/relations') @Header('Cache-Control','no-store') @RequirePermissions(PERMISSIONS.DIRECTORY_READ)
  relations(@Param('id',new ParseUUIDPipe()) id:string,@Query() query:RelationsQueryDto) {return this.people.relationsOfPerson(id,query);}
  @Post(':id/relations') @RequirePermissions(PERMISSIONS.DIRECTORY_WRITE)
  @ApiOperation({summary:'Registrar un episodio nuevo; conserva todos los anteriores'})
  createRelation(@Param('id',new ParseUUIDPipe()) id:string,@Body() body:RelationCreateDto,@Req() req:AuthenticatedRequest) {return this.people.createRelation(id,body,req.authenticatedUser.id);}
}
@ApiTags('person-organization-relations') @ApiCookieAuth('cecasem_session') @UseFilters(DirectoryErrorFilter) @Controller('person-organization-relations')
export class PersonRelationsController {
  constructor(private readonly people:PeopleService) {}
  @Get(':id') @Header('Cache-Control','no-store') @RequirePermissions(PERMISSIONS.DIRECTORY_READ)
  get(@Param('id',new ParseUUIDPipe()) id:string) {return this.people.getRelation(id);}
  @Put(':id') @RequirePermissions(PERMISSIONS.DIRECTORY_WRITE)
  @ApiOperation({summary:'Corregir un episodio existente con historial y versión'})
  edit(@Param('id',new ParseUUIDPipe()) id:string,@Body() body:RelationEditDto,@Req() req:AuthenticatedRequest) {return this.people.editRelation(id,body,req.authenticatedUser.id);}
  @Patch(':id/end') @RequirePermissions(PERMISSIONS.DIRECTORY_WRITE)
  end(@Param('id',new ParseUUIDPipe()) id:string,@Body() body:RelationEndDto,@Req() req:AuthenticatedRequest) {return this.people.endRelation(id,body,req.authenticatedUser.id);}
  @Get(':id/history') @Header('Cache-Control','no-store') @RequirePermissions(PERMISSIONS.DIRECTORY_HISTORY_READ)
  history(@Param('id',new ParseUUIDPipe()) id:string,@Query() query:PageQueryDto) {return this.people.relationHistory(id,query);}
}
@ApiTags('organizations') @ApiCookieAuth('cecasem_session') @UseFilters(DirectoryErrorFilter) @Controller('organizations')
export class OrganizationPeopleController {
  constructor(private readonly people:PeopleService) {}
  @Get(':id/people') @Header('Cache-Control','no-store') @RequirePermissions(PERMISSIONS.DIRECTORY_READ)
  list(@Param('id',new ParseUUIDPipe()) id:string,@Query() query:RelationsQueryDto) {return this.people.relationsOfOrganization(id,query);}
}
