import { Controller, Get, Header, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/authorization/require-permissions.decorator';
import { PERMISSIONS } from '../auth/authorization/permission';
import { SearchQueryDto } from './search.dto';
import { SearchService } from './search.service';
@ApiTags('search') @ApiCookieAuth('cecasem_session') @Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}
  @Get() @Header('Cache-Control', 'no-store') @RequirePermissions(PERMISSIONS.DIRECTORY_READ)
  @ApiOperation({ summary: 'Buscar fichas por nombre y un correo exacto; página común de los dos grupos de nombres' })
  search(@Query() query: SearchQueryDto) { return this.searchService.search(query); }
}
