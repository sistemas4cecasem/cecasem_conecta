import { FilesModule } from '../files/files.module';
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { CommunicationsModule } from '../communications/communications.module';
import { RelationshipsModule } from './relationships.module';
import { RelationshipTimelineService } from './relationship-timeline.service';
import { RelationshipTimelineController } from './relationship-timeline.controller';
@Module({ imports: [FilesModule, DatabaseModule, AuthModule, UsersModule, RelationshipsModule, CommunicationsModule],
  controllers: [RelationshipTimelineController], providers: [RelationshipTimelineService] })
export class RelationshipTimelineModule {}
