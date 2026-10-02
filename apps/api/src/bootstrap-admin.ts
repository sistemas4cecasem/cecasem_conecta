import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validateOrReject } from 'class-validator';
import { AppModule } from './app.module';
import { BootstrapAdminService } from './modules/auth/bootstrap-admin.service';
import { CreateUserDto } from './modules/users-administration/administration.dto';
import { UserRole } from './generated/prisma/client';
import { bootstrapArguments } from './bootstrap-arguments';

async function main() {
  const identity = bootstrapArguments(process.argv.slice(2));
  await validateOrReject(plainToInstance(CreateUserDto, { ...identity, role: UserRole.ADMINISTRATOR }), { whitelist: true, forbidNonWhitelisted: true });
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const result = await app.get(BootstrapAdminService).issue(identity);
    // Salida interactiva única; no archivo, logger de aplicación ni password.
    process.stdout.write(JSON.stringify(result) + '\n');
  } finally { await app.close(); }
}
void main().catch(() => {
  process.stderr.write('No se pudo completar el aprovisionamiento inicial. Verifica argumentos, estado inicial y disponibilidad de PostgreSQL.\n');
  process.exitCode = 1;
});
