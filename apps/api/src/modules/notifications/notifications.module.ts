import { ReminderRecordsModule } from '../reminders/reminder-records.module';
import { RelationshipsModule } from '../relationships/relationships.module';
import { MeetingsModule } from '../meetings/meetings.module';
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';
import { OpportunitiesModule } from '../opportunities/opportunities.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationConsumer } from './notification-consumer';

@Module({ imports: [ReminderRecordsModule, DatabaseModule, UsersModule, AuthModule, OpportunitiesModule, MeetingsModule, RelationshipsModule],
  controllers: [NotificationsController], providers: [NotificationsService, NotificationConsumer], exports: [NotificationsService] })
export class NotificationsModule {}
