import { Controller, Get, Header, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { RequirePermissions } from '../auth/authorization/require-permissions.decorator';
import { PERMISSIONS } from '../auth/authorization/permission';
import { DashboardService } from './dashboard.service';
import { DashboardResponseDto } from './dashboard.dto';

@ApiTags('dashboard')
@ApiCookieAuth('cecasem_session')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.PROCESS_READ)
  @ApiOkResponse({ type: DashboardResponseDto })
  get(@Req() request: AuthenticatedRequest) { return this.dashboard.get(request.authenticatedUser.id); }
}
