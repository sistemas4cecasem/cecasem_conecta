import { Module } from '@nestjs/common';
import { DirectoryModule } from '../directory/directory.module';
import { AuthModule } from '../auth/auth.module';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
@Module({ imports: [DirectoryModule, AuthModule], controllers: [SearchController], providers: [SearchService] })
export class SearchModule {}
