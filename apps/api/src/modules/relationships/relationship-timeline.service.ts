import { FilesService } from '../files/files.service';
import { ReferralsService } from '../referrals/referrals.service';
import { MeetingsService } from '../meetings/meetings.service';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { UsersService } from '../users/users.service';
import { hasPermission } from '../auth/authorization/role-permissions';
import { PERMISSIONS } from '../auth/authorization/permission';
import { CommunicationsService } from '../communications/communications.service';
import { CommunicationAmendmentsService } from '../communications/communication-amendments.service';
import { RelationshipProcessesService } from './relationship-processes.service';
import { InternalNotesService } from './internal-notes.service';
import { ProcessError } from './relationship-process.rules';
import { compareTimeline, decodeTimelineCursor, encodeTimelineCursor } from './timeline.rules';
import type { TimelinePageDto, TimelineQueryDto } from './timeline.dto';
@Injectable()
export class RelationshipTimelineService {
  constructor(private readonly prisma: PrismaService, private readonly users: UsersService, private readonly processes: RelationshipProcessesService,
    private readonly communications: CommunicationsService, private readonly notes: InternalNotesService, private readonly amendments: CommunicationAmendmentsService, private readonly files: FilesService, private readonly referrals: ReferralsService, private readonly meetings: MeetingsService) {}
  async get(processId: string, query: TimelineQueryDto, actorId: string): Promise<TimelinePageDto> {
    const after = decodeTimelineCursor(processId, query.after);
    return this.prisma.$transaction(async tx => {
      const actor = await this.users.findIdentityById(actorId, tx);
      if (!actor?.isActive || !hasPermission(actor.role, PERMISSIONS.PROCESS_READ) || !hasPermission(actor.role, PERMISSIONS.COMMUNICATION_READ)) throw new ProcessError('FORBIDDEN');
      await this.processes.requireCommunicationProcess(processId, tx);
      const limit = query.pageSize + 1;
      const events = await this.processes.timelineItems(processId, after, limit, tx);
      const communications = await this.communications.timelineItems(processId, after, limit, tx);
      const notes = await this.notes.timelineItems(processId, after, limit, tx);
      const amendments = await this.amendments.timelineItems(processId, after, limit, tx);
      const canReadMeetings = hasPermission(actor.role, PERMISSIONS.MEETING_READ), canReadOpportunities = hasPermission(actor.role, PERMISSIONS.OPPORTUNITY_READ);
      const attachments = await this.files.timelineItems(processId, after, limit, tx, { read: canReadMeetings && hasPermission(actor.role, PERMISSIONS.FILE_READ), opportunities: canReadOpportunities });
      const referrals = hasPermission(actor.role, PERMISSIONS.REFERRAL_READ) ? await this.referrals.timelineItems(processId, after, limit, tx) : [];
      const meetings = canReadMeetings ? await this.meetings.timelineItems(processId, after, limit, tx, canReadOpportunities) : [];
      const merged = [...events, ...communications, ...notes, ...amendments, ...attachments, ...referrals, ...meetings].sort(compareTimeline), items = merged.slice(0, query.pageSize);
      return { items, nextCursor: merged.length > query.pageSize ? encodeTimelineCursor(processId, items[items.length - 1]) : null };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
}
