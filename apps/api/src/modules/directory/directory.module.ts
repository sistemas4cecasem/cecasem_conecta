import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { AuditModule } from '../audit/audit.module';
import { DirectoryService } from './directory.service';
import { DirectoryHistoryService } from './directory-history.service';
import { OrganizationsController, CategoriesController } from './directory.controller';
@Module({ imports: [DatabaseModule, AuthModule, UsersModule, AuditModule],
  controllers: [OrganizationsController, CategoriesController], providers: [DirectoryService, DirectoryHistoryService] })
export class DirectoryModule {}
