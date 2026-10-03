import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { DirectoryModule } from '../directory/directory.module';
import { AuditModule } from '../audit/audit.module';
import { ContactIntentsService } from './contact-intents.service';
import { ContactIntentsController } from './contact-intents.controller';
@Module({ imports: [DatabaseModule, AuthModule, UsersModule, DirectoryModule, AuditModule],
  controllers: [ContactIntentsController], providers: [ContactIntentsService] })
export class RelationshipsModule {}
