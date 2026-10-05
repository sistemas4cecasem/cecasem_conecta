import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';
import { CommunicationsModule } from '../communications/communications.module';
import { TranslationProvider } from './translation-provider';
import { LibreTranslateProvider } from './libretranslate-provider';
import { CommunicationTranslationsController } from './communication-translations.controller';
import { CommunicationTranslationsService } from './communication-translations.service';
@Module({ imports: [DatabaseModule, UsersModule, AuthModule, CommunicationsModule], controllers: [CommunicationTranslationsController],
  providers: [CommunicationTranslationsService, { provide: TranslationProvider, useClass: LibreTranslateProvider }] })
export class TranslationModule {}
