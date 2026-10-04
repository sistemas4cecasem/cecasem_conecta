import { Controller, Get, Header, Query, Req, UseFilters } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { RequirePermissions } from '../auth/authorization/require-permissions.decorator';
import { RelationshipContextDto, RelationshipContextQueryDto } from './relationship-context.dto';
import { RelationshipContextService } from './relationship-context.service';
import { CONTEXT_READ_PERMISSIONS } from './relationship-context.rules';
import { ContextErrorFilter } from './relationship-context-error.filter';
@ApiTags('relationship-context') @ApiCookieAuth('cecasem_session') @UseFilters(ContextErrorFilter) @Controller('relationship-context')
export class RelationshipContextController {
  constructor(private readonly context: RelationshipContextService) {}
  @Get() @Header('Cache-Control', 'no-store') @RequirePermissions(...CONTEXT_READ_PERMISSIONS) @ApiOkResponse({ type: RelationshipContextDto })
  get(@Query() query: RelationshipContextQueryDto, @Req() request: AuthenticatedRequest) { return this.context.get(query, request.authenticatedUser.id); }
}
