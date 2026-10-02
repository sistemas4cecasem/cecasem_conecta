import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { AuditModule } from '../audit/audit.module';
import { VerificationSettingsService } from './verification-settings.service';
import { VerificationSettingsController } from './verification-settings.controller';
@Module({ imports: [DatabaseModule, AuthModule, UsersModule, AuditModule], controllers: [VerificationSettingsController],
  providers: [VerificationSettingsService], exports: [VerificationSettingsService] })
export class SettingsModule {}
