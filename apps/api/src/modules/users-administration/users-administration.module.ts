import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { UsersController } from './users.controller';
import { EmailAccountsController } from './email-accounts.controller';
import { UsersAdministrationService } from './users-administration.service';

@Module({ imports: [UsersModule, AuthModule, AuditModule], controllers: [UsersController, EmailAccountsController],
  providers: [UsersAdministrationService], exports: [UsersAdministrationService] })
export class UsersAdministrationModule {}
