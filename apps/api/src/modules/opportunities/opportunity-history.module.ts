import { Controller, Get, Header, Param, ParseUUIDPipe, Query, Req, UseFilters, Injectable, Module } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { RequirePermissions } from '../auth/authorization/require-permissions.decorator';
import { PERMISSIONS } from '../auth/authorization/permission';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { FilesModule } from '../files/files.module';
import { FilesService } from '../files/files.service';
import { OpportunitiesModule } from './opportunities.module';
import { OpportunitiesService } from './opportunities.service';
import { OpportunityHistoryPageDto, OpportunityHistoryQueryDto } from './opportunity.dto';
import { decodeOpportunityCursor } from './opportunity.rules';
import { OpportunityErrorFilter } from './opportunity-error.filter';
@Injectable()
export class OpportunityHistoryService {
  constructor(private readonly prisma: PrismaService, private readonly opportunities: OpportunitiesService, private readonly files: FilesService) { }
  async get(id: string, query: OpportunityHistoryQueryDto, actorId: string): Promise<OpportunityHistoryPageDto> {
    const after = decodeOpportunityCursor(query.after);
    return this.prisma.$transaction(async (tx) => {
      await this.opportunities.assertRead(id, actorId, tx);
      const limit = query.pageSize + 1;
      const events = await this.opportunities.historyItems(id, after, limit, tx), files = await this.files.opportunityHistoryItems(id, after, limit, tx);
      const merged = [...events, ...files].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.source.localeCompare(b.source) || a.id.localeCompare(b.id)), items = merged.slice(0, query.pageSize), last = items.at(-1);
      return { items, nextCursor: merged.length > query.pageSize && last ? Buffer.from(JSON.stringify({ createdAt: last.createdAt, source: last.source, id: last.id })).toString('base64url') : null };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
}
@Controller('opportunities')
@ApiTags('opportunities')
@ApiCookieAuth('cecasem_session')
@UseFilters(OpportunityErrorFilter)
export class OpportunityHistoryController {
  constructor(private readonly history: OpportunityHistoryService) { }
  @Get(':id/history')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.OPPORTUNITY_READ, PERMISSIONS.FILE_READ)
  @ApiOkResponse({ type: OpportunityHistoryPageDto })
  get(
  @Param('id', new ParseUUIDPipe())
  id: string,
  @Query()
  query: OpportunityHistoryQueryDto,
  @Req()
  request: AuthenticatedRequest) { return this.history.get(id, query, request.authenticatedUser.id); }
}
@Module({ imports: [DatabaseModule, AuthModule, OpportunitiesModule, FilesModule], providers: [OpportunityHistoryService], controllers: [OpportunityHistoryController] })
export class OpportunityHistoryModule {
}
