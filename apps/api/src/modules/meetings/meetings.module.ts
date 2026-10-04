import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { RelationshipsModule } from '../relationships/relationships.module';
import { OpportunitiesModule } from '../opportunities/opportunities.module';
import { DirectoryModule } from '../directory/directory.module';
import { AuditModule } from '../audit/audit.module';
import { MeetingsService } from './meetings.service';
import { MeetingsController } from './meetings.controller';
import { MeetingClock } from './meeting-clock';
@Module({imports:[DatabaseModule,AuthModule,UsersModule,RelationshipsModule,OpportunitiesModule,DirectoryModule,AuditModule],
 controllers:[MeetingsController],providers:[MeetingsService,MeetingClock],exports:[MeetingsService,MeetingClock]})
export class MeetingsModule {}
