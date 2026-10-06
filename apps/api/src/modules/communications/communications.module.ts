import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { RelationshipsModule } from '../relationships/relationships.module';
import { CommunicationsController } from './communications.controller';
import { CommunicationsService } from './communications.service';
import { CommunicationSearchService } from './communication-search.service';
import { CommunicationAmendmentsService } from './communication-amendments.service';
import { CommunicationAmendmentsController } from './communication-amendments.controller';
@Module({ imports: [DatabaseModule, UsersModule, AuthModule, AuditModule, RelationshipsModule], controllers: [CommunicationsController, CommunicationAmendmentsController], providers: [CommunicationSearchService, CommunicationsService, CommunicationAmendmentsService], exports: [CommunicationSearchService, CommunicationsService, CommunicationAmendmentsService] })
export class CommunicationsModule {}
