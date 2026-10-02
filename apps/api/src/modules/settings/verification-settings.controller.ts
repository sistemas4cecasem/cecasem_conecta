import { Body, Controller, Get, Header, Put, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/authorization/require-permissions.decorator';
import { PERMISSIONS } from '../auth/authorization/permission';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { VerificationSettingsService } from './verification-settings.service';
import { VerificationSettingsDto } from './verification-settings.dto';
@ApiTags('verification-settings') @ApiCookieAuth('cecasem_session') @Controller('settings/verification')
export class VerificationSettingsController {
  constructor(private readonly settings: VerificationSettingsService) {}
  @Get() @Header('Cache-Control', 'no-store') @RequirePermissions(PERMISSIONS.DIRECTORY_READ)
  get() { return this.settings.get(); }
  @Put() @RequirePermissions(PERMISSIONS.SETTINGS_VERIFICATION_UPDATE)
  update(@Body() body: VerificationSettingsDto, @Req() request: AuthenticatedRequest) { return this.settings.update(body, request.authenticatedUser.id); }
}
