import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import type { AppEnvironment } from '../../config/environment';
import { InactivitySourcesService } from '../relationships/inactivity-sources.service';
import { UsersService } from '../users/users.service';
import { ReminderSettingsService } from '../settings/reminder-settings.service';
import { NotificationsService } from '../notifications/notifications.service';
import { canReceiveReminder, reminderDueAt, reminderType, REMINDER_POLL_MS } from './reminder.rules';

@Injectable()
export class ReminderScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReminderScheduler.name);
  private timer?: NodeJS.Timeout;
  private running?: Promise<unknown>;
  private stopped = false;
  constructor(private readonly prisma: PrismaService, private readonly sources: InactivitySourcesService,
    private readonly users: UsersService, private readonly settings: ReminderSettingsService,
    private readonly notifications: NotificationsService, private readonly config: ConfigService<AppEnvironment, true>) {}
  onModuleInit() { if (this.config.get('NODE_ENV', { infer: true }) !== 'test') this.schedule(0); }
  private schedule(delay: number) {
    this.timer = setTimeout(() => {
      this.running = this.sweep().catch(() => this.logger.error('No se pudo completar el barrido de recordatorios; se reintentará.'))
        .finally(() => { this.running = undefined; if (!this.stopped) this.schedule(REMINDER_POLL_MS); });
    }, delay);
    this.timer.unref();
  }
  async onModuleDestroy() { this.stopped = true; if (this.timer) clearTimeout(this.timer); await this.running; }

  /** Interno: no existe endpoint HTTP de ejecución. Un snapshot por barrido. */
  async sweep(now = new Date()) {
    const settings = await this.settings.snapshot();
    const cutoff = new Date(+now - settings.intervalDays * 86400000);
    const result = { scanned: 0, detected: 0, failed: 0 };
    for (const kind of ['intent', 'process'] as const) {
      let after: { id: string; lastActivityAt: Date } | undefined;
      do {
        const rows = await this.sources.candidates(kind, cutoff, after);
        if (!rows.length || this.stopped) break;
        await this.prisma.$transaction(async tx => {
          const [lock] = await tx.$queryRaw<{ acquired: boolean }[]>`SELECT pg_try_advisory_xact_lock(1128612691, 47) AS acquired`;
          if (!lock.acquired) return;
          const audience = await this.sources.audience(kind, rows, tx);
          const users = await this.users.notificationCandidates([...new Set(audience.map(row => row.userId))], tx);
          const allowed = await this.sources.allowedTargets(rows, tx);
          const existing = await tx.reminderOccurrence.findMany({ where: { OR: rows.map(row => ({ ...(kind === 'intent' ? { intentId: row.id } : { processId: row.id }), inactivityAnchorAt: row.lastActivityAt })) },
            select: { intentId: true, processId: true, inactivityAnchorAt: true } });
          const cycles = new Set(existing.map(row => `${row.intentId ?? row.processId}:${+row.inactivityAnchorAt}`));
          for (const row of rows) {
            result.scanned++;
            if (cycles.has(`${row.id}:${+row.lastActivityAt}`) || !allowed.has(row.id)) continue;
            await tx.$executeRaw`SAVEPOINT inactivity_candidate`;
            try {
              if (await this.sources.revalidate(kind, row, tx)) {
                const occurrence = await tx.reminderOccurrence.create({ data: {
                  ...(kind === 'intent' ? { intentId: row.id } : { processId: row.id }), inactivityAnchorAt: row.lastActivityAt,
                  intervalDaysSnapshot: settings.intervalDays, settingsVersionSnapshot: settings.version,
                  dueAt: reminderDueAt(row.lastActivityAt, settings.intervalDays), createdAt: now,
                } });
                const recipients = users.filter(user => canReceiveReminder(user.role, kind) && audience.some(member => member.processId === row.id && member.userId === user.id));
                await this.notifications.deliverReminder(occurrence.id, reminderType(kind), recipients.map(user => user.id), tx);
                result.detected++;
              }
              await tx.$executeRaw`RELEASE SAVEPOINT inactivity_candidate`;
            } catch {
              await tx.$executeRaw`ROLLBACK TO SAVEPOINT inactivity_candidate`;
              await tx.$executeRaw`RELEASE SAVEPOINT inactivity_candidate`;
              result.failed++;
              this.logger.error('No se pudo confirmar un recordatorio; el ciclo se reintentará.');
            }
          }
        });
        after = rows.at(-1)!;
        if (rows.length < 25) break;
      } while (!this.stopped);
    }
    return result;
  }
}
