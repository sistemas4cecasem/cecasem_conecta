import { Module } from '@nestjs/common';
import { DirectoryModule } from '../directory/directory.module';
import { AuthModule } from '../auth/auth.module';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { UsersModule } from '../users/users.module';
import { RelationshipsModule } from '../relationships/relationships.module';
import { CommunicationsModule } from '../communications/communications.module';
@Module({ imports: [DirectoryModule, AuthModule, UsersModule, RelationshipsModule, CommunicationsModule], controllers: [SearchController], providers: [SearchService] })
export class SearchModule {}
