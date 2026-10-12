import { ReminderSettingsService } from './reminder-settings.service';
import { ReminderSettingsController } from './reminder-settings.controller';
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { AuditModule } from '../audit/audit.module';
@Module({ imports: [DatabaseModule, AuthModule, UsersModule, AuditModule], controllers: [ReminderSettingsController],
  providers: [ReminderSettingsService], exports: [ReminderSettingsService] })
export class SettingsModule {}
