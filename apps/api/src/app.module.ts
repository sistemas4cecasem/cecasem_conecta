import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnvironment } from './config/environment';
import { HealthModule } from './modules/health/health.module';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersAdministrationModule } from './modules/users-administration/users-administration.module';
import { DirectoryModule } from './modules/directory/directory.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    HealthModule,
    UsersModule,
    AuthModule,
    UsersAdministrationModule,
    DirectoryModule,
  ],
})
export class AppModule {}
