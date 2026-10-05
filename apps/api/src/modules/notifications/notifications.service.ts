import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import { UsersService } from '../users/users.service';
import { MeetingsService } from '../meetings/meetings.service';
import { OpportunitiesService } from '../opportunities/opportunities.service';
import { hasPermission } from '../auth/authorization/role-permissions';
import { PERMISSIONS, type Permission } from '../auth/authorization/permission';
import type { UserIdentity } from '../users/user-projections';
import { encodeNotificationCursor, notificationCursor } from './notification-cursor';
import type { NotificationDto, NotificationPageDto, NotificationQueryDto } from './notification.dto';

const notificationSelect = { id: true, type: true, opportunityId: true, meetingId: true, createdAt: true, readAt: true } as const;
type NotificationRow = Prisma.NotificationGetPayload<{ select: typeof notificationSelect }>;

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService, private readonly users: UsersService,
    private readonly opportunities: OpportunitiesService, private readonly meetings: MeetingsService) {}

  private authorize(user: UserIdentity | null, permission: Permission): void {
    if (!user?.isActive || !hasPermission(user.role, permission)) throw new ForbiddenException('No tienes acceso a estas notificaciones.');
  }

  private async contracts(rows: NotificationRow[]): Promise<NotificationDto[]> {
    const [opportunities, meetings] = await Promise.all([
      this.opportunities.notificationSummaries([...new Set(rows.flatMap(row => row.opportunityId ? [row.opportunityId] : []))]),
      this.meetings.notificationSummaries([...new Set(rows.flatMap(row => row.meetingId ? [row.meetingId] : []))]),
    ]);
    const byOpportunity = new Map(opportunities.map(row => [row.id, row])), byMeeting = new Map(meetings.map(row => [row.id, row]));
    return rows.map(row => {
      const opportunity = row.opportunityId ? byOpportunity.get(row.opportunityId) : null;
      const meeting = row.meetingId ? byMeeting.get(row.meetingId) : null;
      if (row.opportunityId && !opportunity || row.meetingId && !meeting) throw new NotFoundException('El recurso no está disponible.');
      return { id: row.id, type: row.type, createdAt: row.createdAt.toISOString(), readAt: row.readAt?.toISOString() ?? null,
        opportunity: opportunity ?? null, meeting: meeting ? { ...meeting, scheduledAt: meeting.scheduledAt.toISOString(), purpose: meeting.purpose.slice(0,160) } : null };
    });
  }

  async list(actorId: string, query: NotificationQueryDto): Promise<NotificationPageDto> {
    this.authorize(await this.users.findIdentityById(actorId), PERMISSIONS.NOTIFICATION_READ);
    const after = notificationCursor(query.after), limit = query.pageSize ?? 25;
    const rows = await this.prisma.notification.findMany({ where: {
      recipientUserId: actorId,
      ...(query.status === 'unread' ? { readAt: null } : query.status === 'read' ? { readAt: { not: null } } : {}),
      ...(after ? { OR: [{ createdAt: { lt: after.createdAt } }, { createdAt: after.createdAt, id: { lt: after.id } }] } : {}),
    }, select: notificationSelect, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1 });
    const visible = rows.slice(0, limit), last = visible.at(-1);
    return { items: await this.contracts(visible), nextCursor: rows.length > limit && last ? encodeNotificationCursor(last) : null };
  }

  async unreadCount(actorId: string): Promise<{ count: number }> {
    this.authorize(await this.users.findIdentityById(actorId), PERMISSIONS.NOTIFICATION_READ);
    return { count: await this.prisma.notification.count({ where: { recipientUserId: actorId, readAt: null } }) };
  }

  async markRead(actorId: string, id: string): Promise<NotificationDto> {
    const row = await this.users.withLockedCredentials(actorId, async (user, tx) => {
      this.authorize(user, PERMISSIONS.NOTIFICATION_MARK_READ);
      // UPDATE condicional: dos lecturas conservan el primer timestamp, también bajo concurrencia.
      await tx.notification.updateMany({ where: { id, recipientUserId: actorId, readAt: null }, data: { readAt: new Date() } });
      const owned = await tx.notification.findFirst({ where: { id, recipientUserId: actorId }, select: notificationSelect });
      if (!owned) throw new NotFoundException('No se encontró la notificación.');
      return owned;
    });
    return (await this.contracts([row]))[0];
  }
}
