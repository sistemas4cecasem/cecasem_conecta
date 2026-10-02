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
@Module({ imports: [DatabaseModule, AuthModule, UsersModule, AuditModule],
  controllers: [OrganizationsController, CategoriesController, PeopleController, PersonRelationsController, OrganizationPeopleController], providers: [DirectoryService, DirectoryHistoryService, PeopleService] })
export class DirectoryModule {}
