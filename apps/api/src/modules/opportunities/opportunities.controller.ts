import { Body, Controller, Get, Header, Headers, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseFilters } from '@nestjs/common';
import { ApiCookieAuth, ApiCreatedResponse, ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { RequirePermissions } from '../auth/authorization/require-permissions.decorator';
import { PERMISSIONS } from '../auth/authorization/permission';
import { CreateOpportunityDto, DiscardOpportunityDto, OpportunityDto, OpportunityPageDto, OpportunityQueryDto, OpportunityStateDto, UpdateOpportunityDto } from './opportunity.dto';
import { OpportunitiesService } from './opportunities.service';
import { OpportunityErrorFilter } from './opportunity-error.filter';
@Controller('opportunities')
@ApiTags('opportunities')
@ApiCookieAuth('cecasem_session')
@UseFilters(OpportunityErrorFilter)
export class OpportunitiesController {
  constructor(private readonly opportunities: OpportunitiesService) { }
  @Post()
  @RequirePermissions(PERMISSIONS.OPPORTUNITY_CREATE)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiCreatedResponse({ type: OpportunityDto })
  create(
  @Body()
  input: CreateOpportunityDto,
  @Req()
  request: AuthenticatedRequest,
  @Headers('idempotency-key')
  key: string) { return this.opportunities.create(input, request.authenticatedUser.id, key); }
  @Get()
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.OPPORTUNITY_READ)
  @ApiOkResponse({ type: OpportunityPageDto })
  list(
  @Query()
  query: OpportunityQueryDto,
  @Req()
  request: AuthenticatedRequest) { return this.opportunities.list(query, request.authenticatedUser.id); }
  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.OPPORTUNITY_READ)
  @ApiOkResponse({ type: OpportunityDto })
  get(
  @Param('id', new ParseUUIDPipe())
  id: string,
  @Req()
  request: AuthenticatedRequest) { return this.opportunities.get(id, request.authenticatedUser.id); }
  @Patch(':id')
  @RequirePermissions(PERMISSIONS.OPPORTUNITY_UPDATE)
  @ApiOkResponse({ type: OpportunityDto })
  update(
  @Param('id', new ParseUUIDPipe())
  id: string,
  @Body()
  input: UpdateOpportunityDto,
  @Req()
  request: AuthenticatedRequest) { return this.opportunities.update(id, input, request.authenticatedUser.id); }
  @Post(':id/state')
  @RequirePermissions(PERMISSIONS.OPPORTUNITY_STATE_CHANGE)
  @ApiCreatedResponse({ type: OpportunityDto })
  state(
  @Param('id', new ParseUUIDPipe())
  id: string,
  @Body()
  input: OpportunityStateDto,
  @Req()
  request: AuthenticatedRequest) { return this.opportunities.changeState(id, input, request.authenticatedUser.id); }
  @Post(':id/discard')
  @RequirePermissions(PERMISSIONS.OPPORTUNITY_DISCARD)
  @ApiCreatedResponse({ type: OpportunityDto })
  discard(
  @Param('id', new ParseUUIDPipe())
  id: string,
  @Body()
  input: DiscardOpportunityDto,
  @Req()
  request: AuthenticatedRequest) { return this.opportunities.discard(id, input, request.authenticatedUser.id); }
}
