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
import { AuditModule } from '../audit/audit.module';
import { PasswordResetService } from './password-reset.service';
import { PasswordResetTokensService } from './password-reset-tokens.service';
import { PermissionsGuard } from './authorization/permissions.guard';
import { BootstrapAdminService } from './bootstrap-admin.service';

@Module({
  imports: [DatabaseModule, UsersModule, AuditModule],
  controllers: [AuthController],
  providers: [AuthService, PasswordService, SessionsService, SessionGuard, PermissionsGuard, UserAccessService, FirstAccessService, FirstAccessTokensService, PasswordResetService, PasswordResetTokensService, BootstrapAdminService],
  exports: [SessionGuard, PermissionsGuard, SessionsService, UserAccessService],
})
export class AuthModule {}
