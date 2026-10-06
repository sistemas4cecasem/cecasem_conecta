import { ForbiddenException, Injectable } from '@nestjs/common';
import { OpportunityStatus, Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { UsersService } from '../users/users.service';
import { hasPermission } from '../auth/authorization/role-permissions';
import { PERMISSIONS } from '../auth/authorization/permission';
import { VerificationSettingsService } from '../settings/verification-settings.service';
import { VerificationClock } from '../directory/verification.service';
import { organizationVerificationPredicate } from '../directory/verification.rules';
import type { DashboardResponseDto } from './dashboard.dto';

const meetingSelect = { id: true, purpose: true, scheduledAt: true, timezone: true, processId: true, opportunityId: true,
  opportunity: { select: { name: true } }, process: { select: { purpose: true } } } satisfies Prisma.MeetingSelect;

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService, private readonly users: UsersService,
    private readonly verificationSettings: VerificationSettingsService, private readonly verificationClock: VerificationClock) {}

  async get(actorId: string): Promise<DashboardResponseDto> {
    return this.prisma.$transaction(async tx => {
      const actor = await this.users.findIdentityById(actorId, tx);
      if (!actor?.isActive || !hasPermission(actor.role, PERMISSIONS.PROCESS_READ)) throw new ForbiddenException();
      const asOf = new Date();
      if (hasPermission(actor.role, PERMISSIONS.DIRECTORY_READ) && ['ADMINISTRATOR', 'BOARD'].includes(actor.role))
        return this.institutional(asOf, tx);
      if (actor.role === 'PLANNING') return this.planning(asOf, tx);
      if (actor.role === 'RESEARCH') return this.research(actor.id, asOf, tx);
      throw new ForbiddenException();
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  private async institutional(asOf: Date, tx: Prisma.TransactionClient): Promise<DashboardResponseDto> {
    const activeProcessWhere = { state: { not: 'CLOSED' as const } };
    const futureMeetingWhere = { status: 'SCHEDULED' as const, scheduledAt: { gt: asOf } };
    const settings = await this.verificationSettings.get(tx);
    const now = this.verificationClock.now();
    const reviewDue = organizationVerificationPredicate('REVIEW_DUE', Prisma.sql`o.id`, Prisma.sql`o.version`, settings.institutionalVerificationMonths, now);
    const neverVerified = organizationVerificationPredicate('NEVER_VERIFIED', Prisma.sql`o.id`, Prisma.sql`o.version`, settings.institutionalVerificationMonths, now);
    const [activeProcesses, waitingResponseProcesses, opportunityGroups, upcomingMeetingCount, upcomingMeetings,
      pendingApplications, verificationCounts] = await Promise.all([
      tx.relationshipProcess.count({ where: activeProcessWhere }),
      tx.relationshipProcess.count({ where: { state: 'WAITING_RESPONSE' } }),
      tx.opportunity.groupBy({ by: ['status'], _count: { _all: true } }),
      tx.meeting.count({ where: futureMeetingWhere }),
      tx.meeting.findMany({ where: futureMeetingWhere, select: meetingSelect, orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }], take: 5 }),
      tx.opportunity.count({ where: { status: 'SUBMITTED' } }),
      tx.$queryRaw<{ reviewDue: bigint; neverVerified: bigint }[]>(Prisma.sql`
        SELECT count(*) FILTER (WHERE ${reviewDue}) AS "reviewDue",
          count(*) FILTER (WHERE ${neverVerified}) AS "neverVerified"
        FROM "Organization" o WHERE o."isActive" = true`),
    ]);
    const byStatus = Object.fromEntries(opportunityGroups.map(row => [row.status, row._count._all]));
    return { view: 'institutional', asOf: asOf.toISOString(), activeProcesses, waitingResponseProcesses,
      opportunities: { pendingReview: byStatus.PENDING_REVIEW ?? 0, preparing: byStatus.PREPARING ?? 0,
        submitted: byStatus.SUBMITTED ?? 0, discarded: byStatus.DISCARDED ?? 0, finished: byStatus.FINISHED ?? 0 },
      upcomingMeetingCount, upcomingMeetings: upcomingMeetings.map(row => ({ id: row.id, purpose: row.purpose,
        scheduledAt: row.scheduledAt.toISOString(), timezone: row.timezone, processId: row.processId, opportunityId: row.opportunityId,
        relatedTitle: row.opportunity?.name ?? row.process?.purpose ?? null })), pendingApplications,
      organizationsReviewDue: Number(verificationCounts[0]?.reviewDue ?? 0), organizationsNeverVerified: Number(verificationCounts[0]?.neverVerified ?? 0) };
  }

  private async research(actorId: string, asOf: Date, tx: Prisma.TransactionClient): Promise<DashboardResponseDto> {
    const relatedToActor = { OR: [{ createdByUserId: actorId }, { participants: { some: { userId: actorId } } }] } satisfies Prisma.RelationshipProcessWhereInput;
    const [activeProcesses, relevantProcesses, activeIntents, relevantIntents, reminderCount, reminders] = await Promise.all([
      tx.relationshipProcess.count({ where: { ...relatedToActor, state: { not: 'CLOSED' } } }),
      tx.relationshipProcess.findMany({ where: { ...relatedToActor, state: { not: 'CLOSED' } },
        select: { id: true, purpose: true, state: true, lastActivityAt: true, organization: { select: { name: true } }, person: { select: { givenNames: true, familyNames: true } } },
        orderBy: [{ lastActivityAt: 'desc' }, { id: 'desc' }], take: 5 }),
      tx.contactIntent.count({ where: { authorUserId: actorId, state: 'ACTIVE' } }),
      tx.contactIntent.findMany({ where: { authorUserId: actorId, state: 'ACTIVE' }, select: { id: true, purpose: true, lastActivityAt: true,
        organization: { select: { name: true } }, person: { select: { givenNames: true, familyNames: true } } },
        orderBy: [{ lastActivityAt: 'desc' }, { id: 'desc' }], take: 5 }),
      tx.notification.count({ where: { recipientUserId: actorId, readAt: null, reminderId: { not: null },
        type: { in: ['INTENT_INACTIVITY_REMINDER', 'PROCESS_INACTIVITY_REMINDER'] },
        reminder: { OR: [{ process: { state: { not: 'CLOSED' } } }, { intent: { state: 'ACTIVE' } }] } } }),
      tx.notification.findMany({ where: { recipientUserId: actorId, readAt: null, reminderId: { not: null },
        type: { in: ['INTENT_INACTIVITY_REMINDER', 'PROCESS_INACTIVITY_REMINDER'] },
        reminder: { OR: [{ process: { state: { not: 'CLOSED' } } }, { intent: { state: 'ACTIVE' } }] } },
        select: { id: true, type: true, createdAt: true, reminder: { select: { processId: true, intentId: true, process: { select: { purpose: true } }, intent: { select: { purpose: true } } } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 5 }),
    ]);
    const item = (row: { id: string; purpose: string; lastActivityAt: Date; state?: string; organization: { name: string } | null; person: { givenNames: string | null; familyNames: string | null } | null }) => ({
      id: row.id, purpose: row.purpose, state: row.state ?? 'ACTIVE', lastActivityAt: row.lastActivityAt.toISOString(),
      target: row.organization?.name ?? (row.person ? [row.person.givenNames, row.person.familyNames].filter(Boolean).join(' ') : undefined),
    });
    return { view: 'research', asOf: asOf.toISOString(), activeProcesses, relevantProcesses: relevantProcesses.map(item),
      activeIntents, relevantIntents: relevantIntents.map(row => item({ ...row, state: 'ACTIVE' })), unreadReminders: reminderCount,
      reminderItems: reminders.map(row => ({ id: row.id, type: row.type, createdAt: row.createdAt.toISOString(),
        subject: row.reminder?.process?.purpose ?? row.reminder?.intent?.purpose ?? 'Recordatorio de inactividad',
        processId: row.reminder?.processId ?? null, intentId: row.reminder?.intentId ?? null })) };
  }

  private async planning(asOf: Date, tx: Prisma.TransactionClient): Promise<DashboardResponseDto> {
    const end = new Date(asOf.getTime() + 30 * 24 * 60 * 60 * 1000);
    const deadlineWhere = { deadline: { gte: new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate())), lte: end }, status: { notIn: [OpportunityStatus.DISCARDED, OpportunityStatus.FINISHED] } };
    const relevantMeetingWhere: Prisma.MeetingWhereInput = { status: 'SCHEDULED', scheduledAt: { gt: asOf },
      OR: [{ opportunityId: { not: null } }, { process: { opportunities: { some: {} } } }] };
    const [opportunityGroups, deadlinesInNext30Days, upcomingDeadlines, upcomingMeetingCount, upcomingMeetings] = await Promise.all([
      tx.opportunity.groupBy({ by: ['status'], _count: { _all: true } }),
      tx.opportunity.count({ where: deadlineWhere }),
      tx.opportunity.findMany({ where: deadlineWhere, select: { id: true, name: true, deadline: true, status: true },
        orderBy: [{ deadline: 'asc' }, { id: 'asc' }], take: 5 }),
      tx.meeting.count({ where: relevantMeetingWhere }),
      tx.meeting.findMany({ where: relevantMeetingWhere, select: meetingSelect, orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }], take: 5 }),
    ]);
    const byStatus = Object.fromEntries(opportunityGroups.map(row => [row.status, row._count._all]));
    return { view: 'planning', asOf: asOf.toISOString(), opportunities: { pendingReview: byStatus.PENDING_REVIEW ?? 0, preparing: byStatus.PREPARING ?? 0,
      submitted: byStatus.SUBMITTED ?? 0, discarded: byStatus.DISCARDED ?? 0, finished: byStatus.FINISHED ?? 0 },
      deadlinesInNext30Days, upcomingDeadlines: upcomingDeadlines.map(row => ({ id: row.id, name: row.name,
        deadline: row.deadline!.toISOString().slice(0, 10), status: row.status })), upcomingMeetingCount,
      upcomingMeetings: upcomingMeetings.map(row => ({ id: row.id, purpose: row.purpose, scheduledAt: row.scheduledAt.toISOString(),
        timezone: row.timezone, processId: row.processId, opportunityId: row.opportunityId, relatedTitle: row.opportunity?.name ?? row.process?.purpose ?? null })) };
  }
}
