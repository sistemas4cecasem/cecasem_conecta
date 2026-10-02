import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { SessionsService } from './sessions.service';
import { SessionGuard } from './session.guard';
import { UserAccessService } from './user-access.service';
import { FirstAccessService } from './first-access.service';
import { FirstAccessTokensService } from './first-access-tokens.service';

@Module({
  imports: [DatabaseModule, UsersModule],
  controllers: [AuthController],
  providers: [AuthService, PasswordService, SessionsService, SessionGuard, UserAccessService, FirstAccessService, FirstAccessTokensService],
  exports: [SessionGuard, SessionsService, UserAccessService],
})
export class AuthModule {}
