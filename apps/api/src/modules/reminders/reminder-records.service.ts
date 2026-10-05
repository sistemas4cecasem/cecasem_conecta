import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { InactivitySourcesService } from '../relationships/inactivity-sources.service';

@Injectable()
export class ReminderRecordsService {
  constructor(private readonly prisma: PrismaService, private readonly sources: InactivitySourcesService) {}
  async summaries(ids: string[]) {
    const rows = await this.prisma.reminderOccurrence.findMany({ where: { id: { in: ids } }, select: {
      id: true, intentId: true, processId: true, inactivityAnchorAt: true, dueAt: true, intervalDaysSnapshot: true,
    } });
    const resources = await this.sources.summaries(rows.flatMap(row => row.intentId ? [row.intentId] : []), rows.flatMap(row => row.processId ? [row.processId] : []));
    const byId = new Map(resources.map(row => [row.id, row]));
    return rows.map(row => ({ id: row.id, intentId: row.intentId, processId: row.processId,
      inactivityAnchorAt: row.inactivityAnchorAt.toISOString(), dueAt: row.dueAt.toISOString(), intervalDays: row.intervalDaysSnapshot,
      purpose: byId.get((row.intentId ?? row.processId)!)?.purpose ?? '', context: byId.get((row.intentId ?? row.processId)!)?.context ?? '' }));
  }
}
