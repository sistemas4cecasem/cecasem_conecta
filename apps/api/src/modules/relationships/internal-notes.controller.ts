import { Body, Controller, Param, ParseUUIDPipe, Post, Req, UseFilters } from '@nestjs/common';
import { ApiCookieAuth, ApiCreatedResponse, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { RequirePermissions } from '../auth/authorization/require-permissions.decorator';
import { PERMISSIONS } from '../auth/authorization/permission';
import { CreateInternalNoteDto, TimelineItemDto } from './timeline.dto';
import { TimelineErrorFilter } from './timeline-error.filter';
import { ProcessErrorFilter } from './relationship-process-error.filter';
import { InternalNotesService } from './internal-notes.service';
@ApiTags('relationship-processes') @ApiCookieAuth('cecasem_session') @UseFilters(ProcessErrorFilter, TimelineErrorFilter) @Controller('relationship-processes')
export class InternalNotesController {
  constructor(private readonly notes: InternalNotesService) {}
  @Post(':id/notes') @RequirePermissions(PERMISSIONS.PROCESS_READ, PERMISSIONS.INTERNAL_NOTE_CREATE) @ApiCreatedResponse({ type: TimelineItemDto })
  create(@Param('id', new ParseUUIDPipe()) id: string, @Body() input: CreateInternalNoteDto, @Req() request: AuthenticatedRequest) { return this.notes.create(id, input.body, request.authenticatedUser.id); }
}
