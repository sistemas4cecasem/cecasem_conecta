import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppEnvironment } from '../../config/environment';
import { PrismaService } from '../../database/prisma.service';
import { OpportunitiesService } from '../opportunities/opportunities.service';
import { MeetingsService } from '../meetings/meetings.service';
import { canReceiveMeeting, canReceiveProcess, excludeNotificationActor, meetingNotificationType, opportunityNotificationType, processNotificationType } from './notification-policy';
import { UsersService } from '../users/users.service';
import { RelationshipProcessesService } from '../relationships/relationship-processes.service';

export const NOTIFICATION_POLL_MS = 5000;
export const NOTIFICATION_BATCH_SIZE = 25;
export const NOTIFICATION_CHECKPOINT = 'opportunity-created';
export const MEETING_NOTIFICATION_CHECKPOINT = 'meeting-activity';
export const PROCESS_NOTIFICATION_CHECKPOINT = 'process-achieved';

@Injectable()
export class NotificationConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationConsumer.name);
  private timer?: NodeJS.Timeout;
  private running?: Promise<void>;
  private stopped = false;

  constructor(private readonly prisma: PrismaService, private readonly opportunities: OpportunitiesService,
    private readonly users: UsersService, private readonly config: ConfigService<AppEnvironment, true>, private readonly meetings: MeetingsService,
    private readonly processes: RelationshipProcessesService) {}

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
    const results = await Promise.allSettled([this.consumeSource('opportunity'), this.consumeSource('meeting'), this.consumeSource('process')]);
    const failure = results.find(result => result.status === 'rejected');
    if (failure?.status === 'rejected') throw failure.reason;
    const batches = results.map(result => {
      if (result.status !== 'fulfilled') throw new Error('Lote no confirmado.');
      return result.value;
    });
    return batches.reduce((total, batch) => ({ scanned: total.scanned + batch.scanned, delivered: total.delivered + batch.delivered,
      failed: total.failed + batch.failed, busy: total.busy || batch.busy }), { scanned: 0, delivered: 0, failed: 0, busy: false });
  }
  private async consumeSource(source: 'opportunity' | 'meeting' | 'process') {
    return this.prisma.$transaction(async tx => {
      const key = source === 'opportunity' ? 45 : source === 'meeting' ? 46 : 48;
      const [lock] = await tx.$queryRaw<{ acquired: boolean }[]>`SELECT pg_try_advisory_xact_lock(1128612691, ${key}) AS acquired`;
      if (!lock.acquired) return { scanned: 0, delivered: 0, failed: 0, busy: true };
      const checkpointId = source === 'opportunity' ? NOTIFICATION_CHECKPOINT : source === 'meeting' ? MEETING_NOTIFICATION_CHECKPOINT : PROCESS_NOTIFICATION_CHECKPOINT;
      const checkpoint = await tx.notificationCheckpoint.upsert({ where: { id: checkpointId }, create: { id: checkpointId }, update: {} });
      const after = checkpoint.afterCreatedAt && checkpoint.afterEventId ? { createdAt: checkpoint.afterCreatedAt, id: checkpoint.afterEventId } : undefined;
      const producer = source === 'opportunity' ? this.opportunities : source === 'meeting' ? this.meetings : this.processes;
      const through = checkpoint.throughCreatedAt && checkpoint.throughEventId ? { createdAt: checkpoint.throughCreatedAt, id: checkpoint.throughEventId } : await producer.recordedActivityUpperBound();
      const page = through ? await producer.recordedActivity(after, NOTIFICATION_BATCH_SIZE, through) : { items: [], next: null };
      // Lectura de audiencia por lote; cada recibo fija la selección al primer éxito.
      const meetingIds = page.items.flatMap(event => 'meetingId' in event ? [event.meetingId] : []);
      const audiences = source === 'meeting' ? await this.meetings.notificationAudience([...new Set(meetingIds)], tx) : [];
      const processIds = page.items.flatMap(event => 'processId' in event && processNotificationType(event.kind, event.newState, event.result) ? [event.processId] : []);
      const formal = processIds.length ? await this.processes.notificationParticipants([...new Set(processIds)], tx) : [];
      const candidates = source === 'meeting' && meetingIds.length || processIds.length ? await this.users.institutionalNotificationCandidates(
        [...new Set([...audiences.flatMap(row => row.userIds), ...formal.map(row => row.userId)])], tx) : [];
      let opportunityRecipients: { id: string }[] | undefined;
      let delivered = 0, failed = 0;
      for (const event of page.items) {
        const isMeeting = 'meetingId' in event;
        const isProcess = 'processId' in event;
        const type = isMeeting ? meetingNotificationType(event.type, event.changes, event.internalUserId)
          : isProcess ? processNotificationType(event.kind, event.newState, event.result) : opportunityNotificationType(event.kind);
        if (!type) continue;
        await tx.$executeRaw`SAVEPOINT notification_delivery`;
        try {
          const data = isMeeting ? { sourceEventId: event.id, meetingId: event.meetingId, meetingSourceType: event.type, sourceType: null }
            : isProcess ? { sourceEventId: event.id, processId: event.processId, sourceType: null }
            : { sourceEventId: event.id, opportunityId: event.opportunityId, sourceType: event.kind };
          const receipt = await tx.notificationDelivery.createMany({ data: [data], skipDuplicates: true });
          if (receipt.count) {
            let recipients: { id: string }[];
            if (isMeeting) {
              const audience = audiences.find(row => row.id === event.meetingId);
              if (!audience) throw new Error('Contexto de reunión no disponible.');
              const ids = type === 'MEETING_PARTICIPANT_ADDED' ? [event.internalUserId!] : audience.userIds;
              recipients = candidates.filter(user => (ids.includes(user.id) || type !== 'MEETING_PARTICIPANT_ADDED' && ['ADMINISTRATOR', 'BOARD'].includes(user.role)) && canReceiveMeeting(user.role, audience));
            } else if (isProcess) {
              const ids = formal.filter(row => row.processId === event.processId).map(row => row.userId);
              recipients = candidates.filter(user => (ids.includes(user.id) || ['ADMINISTRATOR', 'BOARD'].includes(user.role)) && canReceiveProcess(user.role));
            } else recipients = opportunityRecipients ??= await this.users.opportunityNotificationRecipients(tx);
            if (excludeNotificationActor(type)) recipients = recipients.filter(user => user.id !== event.actorUserId);
            await tx.notification.createMany({ data: recipients.map(user => ({ recipientUserId: user.id, type,
              sourceEventId: event.id, ...(isMeeting ? { meetingId: event.meetingId } : isProcess ? { processId: event.processId } : { opportunityId: event.opportunityId }) })), skipDuplicates: true });
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
