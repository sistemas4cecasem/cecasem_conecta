import { Body, Controller, Get, Header, Patch, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/authorization/require-permissions.decorator';
import { PERMISSIONS } from '../auth/authorization/permission';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { ReminderSettingsService } from './reminder-settings.service';
import { UpdateReminderSettingsDto } from './reminder-settings.dto';
@ApiTags('reminder-settings') @ApiCookieAuth('cecasem_session') @Controller('settings/reminders')
export class ReminderSettingsController {
  constructor(private readonly settings: ReminderSettingsService) {}
  @Get() @Header('Cache-Control', 'no-store') @RequirePermissions(PERMISSIONS.SETTINGS_REMINDERS_UPDATE)
  get(@Req() request: AuthenticatedRequest) { return this.settings.get(request.authenticatedUser.id); }
  @Patch() @Header('Cache-Control', 'no-store') @RequirePermissions(PERMISSIONS.SETTINGS_REMINDERS_UPDATE)
  update(@Body() body: UpdateReminderSettingsDto, @Req() request: AuthenticatedRequest) { return this.settings.update(body, request.authenticatedUser.id); }
}
