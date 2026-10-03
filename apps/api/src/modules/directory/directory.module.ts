import { DuplicateDetectionService } from './duplicate-detection.service';
import { ConsolidationService } from './consolidation.service';
import { DuplicateCandidatesController, OrganizationDuplicatesController, PersonDuplicatesController } from './duplicates.controller';
import { DirectoryActorPolicy } from './directory-actor.policy';
import { SettingsModule } from '../settings/settings.module';
import { VerificationClock, VerificationService } from './verification.service';
import { OrganizationVerificationController, PersonVerificationController, RelationVerificationController, PersonContactVerificationController, OrganizationContactVerificationController } from './verification.controller';
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { AuditModule } from '../audit/audit.module';
import { DirectoryService } from './directory.service';
import { DirectoryHistoryService } from './directory-history.service';
import { OrganizationsController, CategoriesController } from './directory.controller';
import { PeopleService } from './people.service';
import { PeopleController, PersonRelationsController, OrganizationPeopleController } from './people.controller';
import { ContactsService } from './contacts.service';
import { ContactMethodsController, PersonContactsController, OrganizationContactsController, PersonContactsActionsController, OrganizationContactsActionsController } from './contacts.controller';
@Module({ imports: [DatabaseModule, AuthModule, UsersModule, AuditModule, SettingsModule],
  controllers: [DuplicateCandidatesController, OrganizationDuplicatesController, PersonDuplicatesController, OrganizationVerificationController, PersonVerificationController, RelationVerificationController, PersonContactVerificationController, OrganizationContactVerificationController, OrganizationsController, CategoriesController, PeopleController, PersonRelationsController, OrganizationPeopleController,
    ContactMethodsController, PersonContactsController, OrganizationContactsController, PersonContactsActionsController, OrganizationContactsActionsController],
  providers: [DuplicateDetectionService, ConsolidationService, DirectoryActorPolicy, VerificationClock, VerificationService, DirectoryService, DirectoryHistoryService, PeopleService, ContactsService] })
export class DirectoryModule {}
