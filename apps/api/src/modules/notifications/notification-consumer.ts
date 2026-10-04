import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppEnvironment } from '../../config/environment';
import { PrismaService } from '../../database/prisma.service';
import { OpportunitiesService } from '../opportunities/opportunities.service';
import { UsersService } from '../users/users.service';

export const NOTIFICATION_POLL_MS = 5000;
export const NOTIFICATION_BATCH_SIZE = 25;
export const NOTIFICATION_CHECKPOINT = 'opportunity-created';

@Injectable()
export class NotificationConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationConsumer.name);
  private timer?: NodeJS.Timeout;
  private running?: Promise<void>;
  private stopped = false;

  constructor(private readonly prisma: PrismaService, private readonly opportunities: OpportunitiesService,
    private readonly users: UsersService, private readonly config: ConfigService<AppEnvironment, true>) {}

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
    return this.prisma.$transaction(async tx => {
      const [lock] = await tx.$queryRaw<{ acquired: boolean }[]>`SELECT pg_try_advisory_xact_lock(1128612691, 45) AS acquired`;
      if (!lock.acquired) return { scanned: 0, delivered: 0, failed: 0, busy: true };
      const checkpoint = await tx.notificationCheckpoint.upsert({ where: { id: NOTIFICATION_CHECKPOINT },
        create: { id: NOTIFICATION_CHECKPOINT }, update: {} });
      const after = checkpoint.afterCreatedAt && checkpoint.afterEventId
        ? { createdAt: checkpoint.afterCreatedAt, id: checkpoint.afterEventId } : undefined;
      const through = checkpoint.throughCreatedAt && checkpoint.throughEventId
        ? { createdAt: checkpoint.throughCreatedAt, id: checkpoint.throughEventId }
        : await this.opportunities.recordedActivityUpperBound();
      const page = through ? await this.opportunities.recordedActivity(after, NOTIFICATION_BATCH_SIZE, through)
        : { items: [], next: null };
      let delivered = 0, failed = 0;
      for (const event of page.items) {
        if (event.kind !== 'CREATED') continue;
        await tx.$executeRaw`SAVEPOINT notification_delivery`;
        try {
          const receipt = await tx.notificationDelivery.createMany({ data: [{ sourceEventId: event.id, opportunityId: event.opportunityId }], skipDuplicates: true });
          if (receipt.count) {
            const recipients = await this.users.opportunityNotificationRecipients(tx);
            await tx.notification.createMany({ data: recipients.map(user => ({ recipientUserId: user.id,
              sourceEventId: event.id, opportunityId: event.opportunityId })), skipDuplicates: true });
            delivered++;
          }
          await tx.$executeRaw`RELEASE SAVEPOINT notification_delivery`;
        } catch {
          await tx.$executeRaw`ROLLBACK TO SAVEPOINT notification_delivery`;
          await tx.$executeRaw`RELEASE SAVEPOINT notification_delivery`;
          failed++;
          this.logger.error('No se pudo entregar un hecho de oportunidad; se reintentará en el próximo barrido.');
        }
      }
      // Al llegar al final, el siguiente lote vuelve al inicio y recupera commits tardíos y fallos aislados.
      await tx.notificationCheckpoint.update({ where: { id: NOTIFICATION_CHECKPOINT }, data: {
        afterCreatedAt: page.next?.createdAt ?? null, afterEventId: page.next?.id ?? null,
        throughCreatedAt: page.next ? through?.createdAt : null, throughEventId: page.next ? through?.id : null,
        ...(page.next ? {} : { completedSweeps: { increment: 1 } }), updatedAt: new Date(),
      } });
      return { scanned: page.items.length, delivered, failed, busy: false };
    });
  }
}
