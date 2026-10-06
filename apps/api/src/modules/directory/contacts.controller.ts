import { Body, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, UseFilters } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/authorization/require-permissions.decorator';
import { PERMISSIONS } from '../auth/authorization/permission';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { DirectoryErrorFilter } from './directory-error.filter';
import { DirectoryStatusDto, PageQueryDto } from './directory.dto';
import { ContactConditionDto, ContactContextEditDto, ContactCorrectionDto, ContactCreateAssociationDto, ContactEmailQueryDto, ContactEndDto, ContactExistingDto, ContactInputDto, ContactReplacementDto, ContactsQueryDto } from './contacts.dto';
import { ContactsService } from './contacts.service';
@ApiTags('contact-methods') @ApiCookieAuth('cecasem_session') @UseFilters(DirectoryErrorFilter) @Controller('contact-methods')
export class ContactMethodsController {
  constructor(private readonly contacts:ContactsService) {}
  @Get() @Header('Cache-Control','no-store') @RequirePermissions(PERMISSIONS.DIRECTORY_READ)
  list(@Query() query:ContactsQueryDto) {return this.contacts.list(query);}
  @Get('email') @Header('Cache-Control','no-store') @RequirePermissions(PERMISSIONS.DIRECTORY_READ)
  @ApiOperation({summary:'Consultar correo canónico exacto, incluida su condición y cantidad de asociaciones'})
  email(@Query() query:ContactEmailQueryDto) {return this.contacts.exactEmail(query.email);}
  @Get(':id') @Header('Cache-Control','no-store') @RequirePermissions(PERMISSIONS.DIRECTORY_READ)
  get(@Param('id',new ParseUUIDPipe()) id:string) {return this.contacts.get(id);}
  @Post() @RequirePermissions(PERMISSIONS.DIRECTORY_WRITE)
  create(@Body() input:ContactInputDto,@Req() req:AuthenticatedRequest) {return this.contacts.create(input,req.authenticatedUser.id);}
  @Put(':id') @RequirePermissions(PERMISSIONS.DIRECTORY_WRITE)
  correct(@Param('id',new ParseUUIDPipe()) id:string,@Body() input:ContactCorrectionDto,@Req() req:AuthenticatedRequest) {return this.contacts.correct(id,input,req.authenticatedUser.id);}
  @Patch(':id/condition') @RequirePermissions(PERMISSIONS.DIRECTORY_WRITE)
  condition(@Param('id',new ParseUUIDPipe()) id:string,@Body() input:ContactConditionDto,@Req() req:AuthenticatedRequest) {return this.contacts.condition(id,input,req.authenticatedUser.id);}
  @Get(':id/history') @Header('Cache-Control','no-store') @RequirePermissions(PERMISSIONS.DIRECTORY_HISTORY_READ)
  history(@Param('id',new ParseUUIDPipe()) id:string,@Query() query:PageQueryDto) {return this.contacts.methodHistory(id,query);}
  @Get(':id/people') @Header('Cache-Control','no-store') @RequirePermissions(PERMISSIONS.DIRECTORY_READ)
  personAssociations(@Param('id',new ParseUUIDPipe()) id:string,@Query() query:PageQueryDto) {return this.contacts.listMethod(id,'person',query);}
  @Get(':id/organizations') @Header('Cache-Control','no-store') @RequirePermissions(PERMISSIONS.DIRECTORY_READ)
  organizationAssociations(@Param('id',new ParseUUIDPipe()) id:string,@Query() query:PageQueryDto) {return this.contacts.listMethod(id,'organization',query);}
}
@ApiTags('contacts') @ApiCookieAuth('cecasem_session') @UseFilters(DirectoryErrorFilter) @Controller('people')
export class PersonContactsController {
  constructor(private readonly contacts:ContactsService) {}
  @Get(':id/contacts') @Header('Cache-Control','no-store') @RequirePermissions(PERMISSIONS.DIRECTORY_READ)
  list(@Param('id',new ParseUUIDPipe()) id:string,@Query() query:PageQueryDto) {return this.contacts.listActor({personId:id},query);}
  @Post(':id/contacts') @RequirePermissions(PERMISSIONS.DIRECTORY_WRITE)
  create(@Param('id',new ParseUUIDPipe()) id:string,@Body() input:ContactCreateAssociationDto,@Req() req:AuthenticatedRequest) {return this.contacts.createAndAssociate({personId:id},input,req.authenticatedUser.id);}
  @Post(':id/contacts/existing') @HttpCode(200) @RequirePermissions(PERMISSIONS.DIRECTORY_WRITE)
  associate(@Param('id',new ParseUUIDPipe()) id:string,@Body() input:ContactExistingDto,@Req() req:AuthenticatedRequest) {return this.contacts.associate({personId:id},input.contactMethodId,input,req.authenticatedUser.id);}
}
@ApiTags('contacts') @ApiCookieAuth('cecasem_session') @UseFilters(DirectoryErrorFilter) @Controller('person-contacts')
export class PersonContactsActionsController {
  constructor(private readonly contacts:ContactsService) {}
  @Get(':id') @Header('Cache-Control','no-store') @RequirePermissions(PERMISSIONS.DIRECTORY_READ)
  get(@Param('id',new ParseUUIDPipe()) id:string) {return this.contacts.getAssociation('person',id);}
  @Put(':id') @RequirePermissions(PERMISSIONS.DIRECTORY_WRITE)
  context(@Param('id',new ParseUUIDPipe()) id:string,@Body() input:ContactContextEditDto,@Req() req:AuthenticatedRequest) {return this.contacts.editContext('person',id,input,req.authenticatedUser.id);}
  @Patch(':id/end') @RequirePermissions(PERMISSIONS.DIRECTORY_WRITE)
  end(@Param('id',new ParseUUIDPipe()) id:string,@Body() input:ContactEndDto,@Req() req:AuthenticatedRequest) {return this.contacts.end('person',id,input,req.authenticatedUser.id);}
  @Patch(':id/status') @RequirePermissions(PERMISSIONS.DIRECTORY_WRITE)
  status(@Param('id',new ParseUUIDPipe()) id:string,@Body() input:DirectoryStatusDto,@Req() req:AuthenticatedRequest) {return this.contacts.status('person',id,input,req.authenticatedUser.id);}
  @Post(':id/replace') @HttpCode(200) @RequirePermissions(PERMISSIONS.DIRECTORY_WRITE)
  replace(@Param('id',new ParseUUIDPipe()) id:string,@Body() input:ContactReplacementDto,@Req() req:AuthenticatedRequest) {return this.contacts.replace('person',id,input,req.authenticatedUser.id);}
  @Get(':id/history') @Header('Cache-Control','no-store') @RequirePermissions(PERMISSIONS.DIRECTORY_HISTORY_READ)
  history(@Param('id',new ParseUUIDPipe()) id:string,@Query() query:PageQueryDto) {return this.contacts.associationHistory('person',id,query);}
}
@ApiTags('contacts') @ApiCookieAuth('cecasem_session') @UseFilters(DirectoryErrorFilter) @Controller('organizations')
export class OrganizationContactsController {
  constructor(private readonly contacts:ContactsService) {}
  @Get(':id/contacts') @Header('Cache-Control','no-store') @RequirePermissions(PERMISSIONS.DIRECTORY_READ)
  list(@Param('id',new ParseUUIDPipe()) id:string,@Query() query:PageQueryDto) {return this.contacts.listActor({organizationId:id},query);}
  @Post(':id/contacts') @RequirePermissions(PERMISSIONS.DIRECTORY_WRITE)
  create(@Param('id',new ParseUUIDPipe()) id:string,@Body() input:ContactCreateAssociationDto,@Req() req:AuthenticatedRequest) {return this.contacts.createAndAssociate({organizationId:id},input,req.authenticatedUser.id);}
  @Post(':id/contacts/existing') @HttpCode(200) @RequirePermissions(PERMISSIONS.DIRECTORY_WRITE)
  associate(@Param('id',new ParseUUIDPipe()) id:string,@Body() input:ContactExistingDto,@Req() req:AuthenticatedRequest) {return this.contacts.associate({organizationId:id},input.contactMethodId,input,req.authenticatedUser.id);}
}
@ApiTags('contacts') @ApiCookieAuth('cecasem_session') @UseFilters(DirectoryErrorFilter) @Controller('organization-contacts')
export class OrganizationContactsActionsController {
  constructor(private readonly contacts:ContactsService) {}
  @Get(':id') @Header('Cache-Control','no-store') @RequirePermissions(PERMISSIONS.DIRECTORY_READ)
  get(@Param('id',new ParseUUIDPipe()) id:string) {return this.contacts.getAssociation('organization',id);}
  @Put(':id') @RequirePermissions(PERMISSIONS.DIRECTORY_WRITE)
  context(@Param('id',new ParseUUIDPipe()) id:string,@Body() input:ContactContextEditDto,@Req() req:AuthenticatedRequest) {return this.contacts.editContext('organization',id,input,req.authenticatedUser.id);}
  @Patch(':id/end') @RequirePermissions(PERMISSIONS.DIRECTORY_WRITE)
  end(@Param('id',new ParseUUIDPipe()) id:string,@Body() input:ContactEndDto,@Req() req:AuthenticatedRequest) {return this.contacts.end('organization',id,input,req.authenticatedUser.id);}
  @Patch(':id/status') @RequirePermissions(PERMISSIONS.DIRECTORY_WRITE)
  status(@Param('id',new ParseUUIDPipe()) id:string,@Body() input:DirectoryStatusDto,@Req() req:AuthenticatedRequest) {return this.contacts.status('organization',id,input,req.authenticatedUser.id);}
  @Post(':id/replace') @HttpCode(200) @RequirePermissions(PERMISSIONS.DIRECTORY_WRITE)
  replace(@Param('id',new ParseUUIDPipe()) id:string,@Body() input:ContactReplacementDto,@Req() req:AuthenticatedRequest) {return this.contacts.replace('organization',id,input,req.authenticatedUser.id);}
  @Get(':id/history') @Header('Cache-Control','no-store') @RequirePermissions(PERMISSIONS.DIRECTORY_HISTORY_READ)
  history(@Param('id',new ParseUUIDPipe()) id:string,@Query() query:PageQueryDto) {return this.contacts.associationHistory('organization',id,query);}
}
