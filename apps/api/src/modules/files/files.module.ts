import { MeetingsModule } from '../meetings/meetings.module';
import { OpportunitiesModule } from '../opportunities/opportunities.module';
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { AuditModule } from '../audit/audit.module';
import { RelationshipsModule } from '../relationships/relationships.module';
import { CommunicationsModule } from '../communications/communications.module';
import { FileStorage } from './file-storage';
import { LocalFileStorage } from './local-file-storage';
import { FilesService } from './files.service';
import { FilesController } from './files.controller';
import { FileUploadInterceptor } from './file-upload.interceptor';
@Module({ imports: [MeetingsModule, OpportunitiesModule, DatabaseModule, AuthModule, UsersModule, AuditModule, RelationshipsModule, CommunicationsModule],
  controllers: [FilesController], providers: [FilesService, FileUploadInterceptor, { provide: FileStorage, useClass: LocalFileStorage }], exports: [FilesService] })
export class FilesModule {}
