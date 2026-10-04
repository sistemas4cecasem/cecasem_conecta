import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { DirectoryModule } from '../directory/directory.module';
import { CommunicationsModule } from '../communications/communications.module';
import { RelationshipsModule } from './relationships.module';
import { RelationshipContextService } from './relationship-context.service';
import { RelationshipContextController } from './relationship-context.controller';

// La proyección lee contratos de ambos módulos sin invertir sus dependencias.
@Module({ imports: [DatabaseModule, AuthModule, UsersModule, DirectoryModule, RelationshipsModule, CommunicationsModule],
  controllers: [RelationshipContextController], providers: [RelationshipContextService] })
export class RelationshipContextModule {}
