import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { AuditModule } from '../audit/audit.module';
import { DirectoryModule } from '../directory/directory.module';
import { RelationshipsModule } from '../relationships/relationships.module';
import { CommunicationsModule } from '../communications/communications.module';
import { OpportunitiesService } from './opportunities.service';
import { OpportunitiesController } from './opportunities.controller';
@Module({ imports: [DatabaseModule, AuthModule, UsersModule, AuditModule, DirectoryModule, RelationshipsModule, CommunicationsModule], providers: [OpportunitiesService], controllers: [OpportunitiesController], exports: [OpportunitiesService] })
export class OpportunitiesModule {
}
