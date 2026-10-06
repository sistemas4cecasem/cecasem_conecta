import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { SettingsModule } from '../settings/settings.module';
import { DirectoryModule } from '../directory/directory.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({ imports: [DatabaseModule, AuthModule, UsersModule, SettingsModule, DirectoryModule], controllers: [DashboardController], providers: [DashboardService] })
export class DashboardModule {}
