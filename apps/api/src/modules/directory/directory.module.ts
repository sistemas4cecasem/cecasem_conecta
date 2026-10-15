import { OrganizationBranchesService } from './organization-branches.service';
import { DirectoryReferralsService } from './directory-referrals.service';
import { OrganizationFilterService } from './organization-filter.service';
import { DirectoryImportService } from './directory-import.service';
import { DuplicateDetectionService } from './duplicate-detection.service';
import { DirectorySearchService } from './directory-search.service';
import { DirectoryExportService } from './directory-export.service';
import { DirectoryTargetService } from './directory-target.service';
import { ConsolidationService } from './consolidation.service';
import { DuplicateCandidatesController, OrganizationDuplicatesController, PersonDuplicatesController } from './duplicates.controller';
import { DirectoryActorPolicy } from './directory-actor.policy';
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { AuditModule } from '../audit/audit.module';
import { DirectoryService } from './directory.service';
import { DirectoryHistoryService } from './directory-history.service';
import { OrganizationsController } from './directory.controller';
import { PeopleService } from './people.service';
import { PeopleController, PersonRelationsController, OrganizationPeopleController } from './people.controller';
import { ContactsService } from './contacts.service';
import { ContactMethodsController, PersonContactsController, OrganizationContactsController, PersonContactsActionsController, OrganizationContactsActionsController } from './contacts.controller';
@Module({ imports: [DatabaseModule, AuthModule, UsersModule, AuditModule],
  controllers: [DuplicateCandidatesController, OrganizationDuplicatesController, PersonDuplicatesController, OrganizationsController, PeopleController, PersonRelationsController, OrganizationPeopleController,
    ContactMethodsController, PersonContactsController, OrganizationContactsController, PersonContactsActionsController, OrganizationContactsActionsController],
  providers: [OrganizationBranchesService, OrganizationFilterService, DirectoryExportService, DirectoryImportService, DirectoryReferralsService, DirectoryTargetService, DirectorySearchService, DuplicateDetectionService, ConsolidationService, DirectoryActorPolicy, DirectoryService, DirectoryHistoryService, PeopleService, ContactsService],
  exports: [DirectoryExportService, DirectoryImportService, DirectoryReferralsService, DirectorySearchService, DirectoryTargetService] })
export class DirectoryModule {}
