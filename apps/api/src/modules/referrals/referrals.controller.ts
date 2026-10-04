import { Body, Controller, Get, Header, Headers, Param, ParseUUIDPipe, Post, Query, Req, UseFilters } from '@nestjs/common';
import { ApiCookieAuth, ApiCreatedResponse, ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { RequirePermissions } from '../auth/authorization/require-permissions.decorator';
import { PERMISSIONS } from '../auth/authorization/permission';
import { CommunicationErrorFilter } from '../communications/communication-error.filter';
import { ReferralErrorFilter } from './referral-error.filter';
import { CreateReferralDto, ReferralDto, ReferralPageDto, ReferralQueryDto } from './referral.dto';
import { ReferralsService } from './referrals.service';
@ApiTags('referrals') @ApiCookieAuth('cecasem_session') @UseFilters(ReferralErrorFilter, CommunicationErrorFilter) @Controller()
export class ReferralsController {
  constructor(private readonly referrals: ReferralsService) {}
  @Post('communications/:id/referrals') @Header('Cache-Control', 'no-store') @RequirePermissions(PERMISSIONS.REFERRAL_CREATE, PERMISSIONS.COMMUNICATION_READ, PERMISSIONS.PROCESS_READ)
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'UUID del intento; reutilizar para reintentar los mismos datos.' }) @ApiCreatedResponse({ type: ReferralDto })
  create(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: CreateReferralDto, @Headers('idempotency-key') key: string, @Req() request: AuthenticatedRequest) {
    return this.referrals.create(id, body, request.authenticatedUser.id, key);
  }
  @Get('communications/:id/referrals') @Header('Cache-Control', 'no-store') @RequirePermissions(PERMISSIONS.REFERRAL_READ, PERMISSIONS.COMMUNICATION_READ, PERMISSIONS.PROCESS_READ) @ApiOkResponse({ type: ReferralPageDto })
  list(@Param('id', new ParseUUIDPipe()) id: string, @Query() query: ReferralQueryDto, @Req() request: AuthenticatedRequest) { return this.referrals.list(id, query, request.authenticatedUser.id); }
  @Get('referrals/:id') @Header('Cache-Control', 'no-store') @RequirePermissions(PERMISSIONS.REFERRAL_READ, PERMISSIONS.COMMUNICATION_READ, PERMISSIONS.PROCESS_READ) @ApiOkResponse({ type: ReferralDto })
  get(@Param('id', new ParseUUIDPipe()) id: string, @Req() request: AuthenticatedRequest) { return this.referrals.get(id, request.authenticatedUser.id); }
}
