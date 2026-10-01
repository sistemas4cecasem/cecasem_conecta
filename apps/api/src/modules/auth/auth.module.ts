import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { SessionsService } from './sessions.service';
import { SessionGuard } from './session.guard';
import { UserAccessService } from './user-access.service';

@Module({
  imports: [DatabaseModule, UsersModule],
  controllers: [AuthController],
  providers: [AuthService, PasswordService, SessionsService, SessionGuard, UserAccessService],
  exports: [SessionGuard, SessionsService, UserAccessService],
})
export class AuthModule {}
