import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { DirectoryModule } from '../directory/directory.module';
import { AuditModule } from '../audit/audit.module';
import { ContactIntentsService } from './contact-intents.service';
import { ContactIntentsController } from './contact-intents.controller';
import { RelationshipProcessesController } from './relationship-processes.controller';
import { RelationshipProcessesService } from './relationship-processes.service';
import { ProcessParticipationService } from './process-participation.service';
import { ContactRestrictionsService } from './contact-restrictions.service';
import { ContactRestrictionsController } from './contact-restrictions.controller';
import { InternalNotesService } from './internal-notes.service';
import { InternalNotesController } from './internal-notes.controller';
@Module({ imports: [DatabaseModule, AuthModule, UsersModule, DirectoryModule, AuditModule],
  controllers: [ContactIntentsController, RelationshipProcessesController, ContactRestrictionsController, InternalNotesController], providers: [ContactIntentsService, RelationshipProcessesService, ProcessParticipationService, ContactRestrictionsService, InternalNotesService],
  exports: [ProcessParticipationService, ContactRestrictionsService, RelationshipProcessesService, InternalNotesService] })
export class RelationshipsModule {}
