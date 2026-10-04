import { Controller, Get, Header, Param, ParseUUIDPipe, Query, Req, UseFilters } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { RequirePermissions } from '../auth/authorization/require-permissions.decorator';
import { PERMISSIONS } from '../auth/authorization/permission';
import { TimelinePageDto, TimelineQueryDto } from './timeline.dto';
import { TimelineErrorFilter } from './timeline-error.filter';
import { ProcessErrorFilter } from './relationship-process-error.filter';
import { RelationshipTimelineService } from './relationship-timeline.service';
@ApiTags('relationship-processes') @ApiCookieAuth('cecasem_session') @UseFilters(ProcessErrorFilter, TimelineErrorFilter) @Controller('relationship-processes')
export class RelationshipTimelineController {
  constructor(private readonly timeline: RelationshipTimelineService) {}
  @Get(':id/timeline') @Header('Cache-Control', 'no-store') @RequirePermissions(PERMISSIONS.PROCESS_READ, PERMISSIONS.COMMUNICATION_READ) @ApiOkResponse({ type: TimelinePageDto })
  get(@Param('id', new ParseUUIDPipe()) id: string, @Query() query: TimelineQueryDto, @Req() request: AuthenticatedRequest) { return this.timeline.get(id, query, request.authenticatedUser.id); }
}
