import { Controller, Get, Header, Query, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/authorization/require-permissions.decorator';
import { PERMISSIONS } from '../auth/authorization/permission';
import { SearchQueryDto } from './search.dto';
import { SearchService } from './search.service';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { SearchResponseDto } from './search-response.dto';
@ApiTags('search') @ApiCookieAuth('cecasem_session') @Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}
  @Get() @Header('Cache-Control', 'no-store') @RequirePermissions(PERMISSIONS.DIRECTORY_READ)
  @ApiOkResponse({ type: SearchResponseDto })
  @ApiOperation({ summary: 'Búsqueda global de fichas, procesos por propósito y antecedentes históricos de correo exacto; grupos autorizados y paginados' })
  search(@Query() query: SearchQueryDto, @Req() request: AuthenticatedRequest) { return this.searchService.search(query, request.authenticatedUser.id); }
}
