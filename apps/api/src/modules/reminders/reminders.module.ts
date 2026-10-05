import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { RelationshipsModule } from '../relationships/relationships.module';
import { UsersModule } from '../users/users.module';
import { SettingsModule } from '../settings/settings.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReminderScheduler } from './reminder-scheduler';
@Module({ imports: [DatabaseModule, RelationshipsModule, UsersModule, SettingsModule, NotificationsModule], providers: [ReminderScheduler] })
export class RemindersModule {}
