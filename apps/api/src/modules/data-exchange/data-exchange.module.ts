import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { DirectoryModule } from '../directory/directory.module';
import { UsersModule } from '../users/users.module';
import { DataImportService } from './import/data-import.service';
import { ImportController } from './import/import.controller';
import { RelationshipsModule } from '../relationships/relationships.module';
import { OpportunitiesModule } from '../opportunities/opportunities.module';
import { DataExportService } from './export/data-export.service';
import { ExportController } from './export/export.controller';

@Module({ imports: [DatabaseModule, AuthModule, AuditModule, DirectoryModule, RelationshipsModule, OpportunitiesModule, UsersModule],
  controllers: [ImportController, ExportController], providers: [DataImportService, DataExportService] })
export class DataExchangeModule {}
