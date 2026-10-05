import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppEnvironment } from '../../config/environment';
import { PrismaService } from '../../database/prisma.service';
import { OpportunitiesService } from '../opportunities/opportunities.service';
import { MeetingsService } from '../meetings/meetings.service';
import { canReceiveMeeting, excludeNotificationActor, meetingNotificationType, opportunityNotificationType } from './notification-policy';
import { UsersService } from '../users/users.service';

export const NOTIFICATION_POLL_MS = 5000;
export const NOTIFICATION_BATCH_SIZE = 25;
export const NOTIFICATION_CHECKPOINT = 'opportunity-created';
export const MEETING_NOTIFICATION_CHECKPOINT = 'meeting-activity';

@Injectable()
export class NotificationConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationConsumer.name);
  private timer?: NodeJS.Timeout;
  private running?: Promise<void>;
  private stopped = false;

  constructor(private readonly prisma: PrismaService, private readonly opportunities: OpportunitiesService,
    private readonly users: UsersService, private readonly config: ConfigService<AppEnvironment, true>, private readonly meetings: MeetingsService) {}

  onModuleInit(): void {
    if (this.config.get('NODE_ENV', { infer: true }) !== 'test') this.schedule(0);
  }
  private schedule(delay: number): void {
    this.timer = setTimeout(() => {
      this.running = this.consumeBatch().then(() => undefined).catch(() => {
        this.logger.error('No se pudo procesar el lote de notificaciones; se reintentará.');
      }).finally(() => { this.running = undefined; if (!this.stopped) this.schedule(NOTIFICATION_POLL_MS); });
    }, delay);
    this.timer.unref();
  }
  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    await this.running;
  }

  /** Barridos repetidos + recibo por hecho: el cursor nunca es la única garantía de entrega. */
  async consumeBatch(): Promise<{ scanned: number; delivered: number; failed: number; busy: boolean }> {
    // Una frontera fallida no impide confirmar el lote de la otra fuente.
    const results = await Promise.allSettled([this.consumeSource('opportunity'), this.consumeSource('meeting')]);
    const failure = results.find(result => result.status === 'rejected');
    if (failure?.status === 'rejected') throw failure.reason;
    const [opportunity, meeting] = results.map(result => {
      if (result.status !== 'fulfilled') throw new Error('Lote no confirmado.');
      return result.value;
    });
    return { scanned: opportunity.scanned + meeting.scanned, delivered: opportunity.delivered + meeting.delivered,
      failed: opportunity.failed + meeting.failed, busy: opportunity.busy || meeting.busy };
  }
  private async consumeSource(source: 'opportunity' | 'meeting') {
    return this.prisma.$transaction(async tx => {
      const key = source === 'opportunity' ? 45 : 46;
      const [lock] = await tx.$queryRaw<{ acquired: boolean }[]>`SELECT pg_try_advisory_xact_lock(1128612691, ${key}) AS acquired`;
      if (!lock.acquired) return { scanned: 0, delivered: 0, failed: 0, busy: true };
      const checkpointId = source === 'opportunity' ? NOTIFICATION_CHECKPOINT : MEETING_NOTIFICATION_CHECKPOINT;
      const checkpoint = await tx.notificationCheckpoint.upsert({ where: { id: checkpointId }, create: { id: checkpointId }, update: {} });
      const after = checkpoint.afterCreatedAt && checkpoint.afterEventId ? { createdAt: checkpoint.afterCreatedAt, id: checkpoint.afterEventId } : undefined;
      const producer = source === 'opportunity' ? this.opportunities : this.meetings;
      const through = checkpoint.throughCreatedAt && checkpoint.throughEventId ? { createdAt: checkpoint.throughCreatedAt, id: checkpoint.throughEventId } : await producer.recordedActivityUpperBound();
      const page = through ? await producer.recordedActivity(after, NOTIFICATION_BATCH_SIZE, through) : { items: [], next: null };
      // Lectura de audiencia por lote; cada recibo fija la selección al primer éxito.
      const meetingIds = page.items.flatMap(event => 'meetingId' in event ? [event.meetingId] : []);
      const audiences = source === 'meeting' ? await this.meetings.notificationAudience([...new Set(meetingIds)], tx) : [];
      const candidates = audiences.length ? await this.users.notificationCandidates([...new Set(audiences.flatMap(row => row.userIds))], tx) : [];
      let opportunityRecipients: { id: string }[] | undefined;
      let delivered = 0, failed = 0;
      for (const event of page.items) {
        const isMeeting = 'meetingId' in event;
        const type = isMeeting ? meetingNotificationType(event.type, event.changes, event.internalUserId) : opportunityNotificationType(event.kind);
        if (!type) continue;
        await tx.$executeRaw`SAVEPOINT notification_delivery`;
        try {
          const data = isMeeting ? { sourceEventId: event.id, meetingId: event.meetingId, meetingSourceType: event.type, sourceType: null }
            : { sourceEventId: event.id, opportunityId: event.opportunityId, sourceType: event.kind };
          const receipt = await tx.notificationDelivery.createMany({ data: [data], skipDuplicates: true });
          if (receipt.count) {
            let recipients: { id: string }[];
            if (isMeeting) {
              const audience = audiences.find(row => row.id === event.meetingId);
              if (!audience) throw new Error('Contexto de reunión no disponible.');
              const ids = type === 'MEETING_PARTICIPANT_ADDED' ? [event.internalUserId!] : audience.userIds;
              recipients = candidates.filter(user => ids.includes(user.id) && canReceiveMeeting(user.role, audience));
            } else recipients = opportunityRecipients ??= await this.users.opportunityNotificationRecipients(tx);
            if (excludeNotificationActor(type)) recipients = recipients.filter(user => user.id !== event.actorUserId);
            await tx.notification.createMany({ data: recipients.map(user => ({ recipientUserId: user.id, type,
              sourceEventId: event.id, ...(isMeeting ? { meetingId: event.meetingId } : { opportunityId: event.opportunityId }) })), skipDuplicates: true });
            delivered++;
          }
          await tx.$executeRaw`RELEASE SAVEPOINT notification_delivery`;
        } catch {
          await tx.$executeRaw`ROLLBACK TO SAVEPOINT notification_delivery`;
          await tx.$executeRaw`RELEASE SAVEPOINT notification_delivery`;
          failed++;
          this.logger.error('No se pudo entregar un hecho institucional; se reintentará en el próximo barrido.');
        }
      }
      // Cursor compuesto + límite superior finito + barridos repetidos recuperan commits tardíos.
      await tx.notificationCheckpoint.update({ where: { id: checkpointId }, data: {
        afterCreatedAt: page.next?.createdAt ?? null, afterEventId: page.next?.id ?? null,
        throughCreatedAt: page.next ? through?.createdAt : null, throughEventId: page.next ? through?.id : null,
        ...(page.next ? {} : { completedSweeps: { increment: 1 } }), updatedAt: new Date(),
      } });
      return { scanned: page.items.length, delivered, failed, busy: false };
    });
  }
}
