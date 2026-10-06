import { RemindersModule } from './modules/reminders/reminders.module';
import { TranslationModule } from './modules/translation/translation.module';
import { OpportunitiesModule } from './modules/opportunities/opportunities.module';
import { ReferralsModule } from './modules/referrals/referrals.module';
import { MeetingsModule } from './modules/meetings/meetings.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OpportunityHistoryModule } from './modules/opportunities/opportunity-history.module';
import { Module } from '@nestjs/common';
import { FilesModule } from './modules/files/files.module';
import { ConfigModule } from '@nestjs/config';
import { validateEnvironment } from './config/environment';
import { HealthModule } from './modules/health/health.module';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersAdministrationModule } from './modules/users-administration/users-administration.module';
import { DirectoryModule } from './modules/directory/directory.module';
import { SearchModule } from './modules/search/search.module';
import { RelationshipsModule } from './modules/relationships/relationships.module';
import { CommunicationsModule } from './modules/communications/communications.module';
import { RelationshipContextModule } from './modules/relationships/relationship-context.module';
import { RelationshipTimelineModule } from './modules/relationships/relationship-timeline.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { DataExchangeModule } from './modules/data-exchange/data-exchange.module';

@Module({
  imports: [TranslationModule, RemindersModule,
    ReferralsModule,
    MeetingsModule,
    OpportunitiesModule, OpportunityHistoryModule,
    NotificationsModule,
    FilesModule,
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    HealthModule,
    UsersModule,
    AuthModule,
    UsersAdministrationModule,
    DirectoryModule,
    SearchModule,
    RelationshipsModule,
    CommunicationsModule,
    RelationshipContextModule,
    RelationshipTimelineModule,
    DashboardModule,
    DataExchangeModule,
  ],
})
export class AppModule {}
