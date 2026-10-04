import { Controller, Get, Header, Param, ParseUUIDPipe, Patch, Query, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { RequirePermissions } from '../auth/authorization/require-permissions.decorator';
import { PERMISSIONS } from '../auth/authorization/permission';
import { NotificationCountDto, NotificationDto, NotificationPageDto, NotificationQueryDto } from './notification.dto';
import { NotificationsService } from './notifications.service';

@Controller('me/notifications')
@ApiTags('notifications')
@ApiCookieAuth('cecasem_session')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}
  @Get() @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.NOTIFICATION_READ)
  @ApiOkResponse({ type: NotificationPageDto })
  list(@Query() query: NotificationQueryDto, @Req() request: AuthenticatedRequest) {
    return this.notifications.list(request.authenticatedUser.id, query);
  }
  @Get('unread-count') @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.NOTIFICATION_READ)
  @ApiOkResponse({ type: NotificationCountDto })
  count(@Req() request: AuthenticatedRequest) { return this.notifications.unreadCount(request.authenticatedUser.id); }
  @Patch(':id/read') @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.NOTIFICATION_MARK_READ)
  @ApiOkResponse({ type: NotificationDto })
  read(@Param('id', new ParseUUIDPipe()) id: string, @Req() request: AuthenticatedRequest) {
    return this.notifications.markRead(request.authenticatedUser.id, id);
  }
}
