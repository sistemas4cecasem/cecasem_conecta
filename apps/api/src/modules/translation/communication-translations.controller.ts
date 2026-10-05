import { Controller, Get, Post, Param, ParseUUIDPipe, Req, Res, Header, HttpCode, UseFilters } from '@nestjs/common';
import type { Response } from 'express';
import { ApiCookieAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { RequirePermissions } from '../auth/authorization/require-permissions.decorator';
import { PERMISSIONS } from '../auth/authorization/permission';
import { CommunicationErrorFilter } from '../communications/communication-error.filter';
import { TranslationErrorFilter } from './translation-error.filter';
import { CommunicationTranslationsService } from './communication-translations.service';
import { CommunicationTranslationDto } from './communication-translation.dto';
@ApiTags('translations') @ApiCookieAuth('cecasem_session') @UseFilters(TranslationErrorFilter, CommunicationErrorFilter)
@Controller('communications/:id/translations/spanish')
export class CommunicationTranslationsController {
  constructor(private readonly translations: CommunicationTranslationsService) {}
  @Get() @Header('Cache-Control', 'no-store') @RequirePermissions(PERMISSIONS.TRANSLATION_READ, PERMISSIONS.COMMUNICATION_READ, PERMISSIONS.PROCESS_READ)
  @ApiOkResponse({ type: CommunicationTranslationDto, description: 'Traducción persistida o null; no llama al proveedor.' })
  async get(@Param('id', new ParseUUIDPipe()) id: string, @Req() request: AuthenticatedRequest, @Res() response: Response) {
    response.json(await this.translations.get(id, request.authenticatedUser.id));
  }
  @Post() @HttpCode(200) @Header('Cache-Control', 'no-store') @RequirePermissions(PERMISSIONS.TRANSLATION_REQUEST, PERMISSIONS.COMMUNICATION_READ, PERMISSIONS.PROCESS_READ)
  @ApiOkResponse({ type: CommunicationTranslationDto })
  request(@Param('id', new ParseUUIDPipe()) id: string, @Req() request: AuthenticatedRequest) { return this.translations.request(id, request.authenticatedUser.id); }
}
