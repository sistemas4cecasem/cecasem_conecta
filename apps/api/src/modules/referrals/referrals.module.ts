import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';
import { CommunicationsModule } from '../communications/communications.module';
import { DirectoryModule } from '../directory/directory.module';
import { AuditModule } from '../audit/audit.module';
import { ReferralsController } from './referrals.controller';
import { ReferralsService } from './referrals.service';
@Module({ imports: [DatabaseModule, UsersModule, AuthModule, CommunicationsModule, DirectoryModule, AuditModule], controllers: [ReferralsController], providers: [ReferralsService], exports: [ReferralsService] })
export class ReferralsModule {}
