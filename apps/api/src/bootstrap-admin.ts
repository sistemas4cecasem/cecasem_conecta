import 'reflect-metadata';
import { StringDecoder } from 'node:string_decoder';
import { NestFactory } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validateOrReject } from 'class-validator';
import { AppModule } from './app.module';
import { BootstrapAdminService } from './modules/auth/bootstrap-admin.service';
import { CreateUserDto } from './modules/users-administration/administration.dto';
import { UserRole } from './generated/prisma/client';
import { bootstrapArguments } from './bootstrap-arguments';

function readHiddenPassword(prompt: string): Promise<string> {
  const input = process.stdin;
  if (!input.isTTY || typeof input.setRawMode !== 'function') {
    return Promise.reject(new Error('El aprovisionamiento requiere una terminal interactiva para solicitar la contraseña de forma segura.'));
  }

  return new Promise((resolve, reject) => {
    const decoder = new StringDecoder('utf8');
    let value = '';
    const cleanup = () => {
      input.removeListener('data', onData);
      input.setRawMode(false);
      input.pause();
    };
    const onData = (chunk: Buffer) => {
      for (const character of decoder.write(chunk)) {
        if (character === '\u0003') { cleanup(); reject(new Error('Aprovisionamiento cancelado.')); return; }
        if (character === '\r' || character === '\n') { cleanup(); process.stdout.write('\n'); resolve(value); return; }
        if (character === '\u007f' || character === '\b') { value = [...value].slice(0, -1).join(''); continue; }
        if (character >= ' ') value += character;
      }
    };
    process.stdout.write(prompt);
    input.setRawMode(true);
    input.resume();
    input.on('data', onData);
  });
}

async function main() {
  const identity = bootstrapArguments(process.argv.slice(2));
  const password = await readHiddenPassword('Contraseña inicial del Administrador: ');
  const confirmation = await readHiddenPassword('Confirma la contraseña: ');
  if (password !== confirmation) throw new Error('Las contraseñas no coinciden.');
  await validateOrReject(plainToInstance(CreateUserDto, { ...identity, role: UserRole.ADMINISTRATOR, password }), { whitelist: true, forbidNonWhitelisted: true });
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const result = await app.get(BootstrapAdminService).initialize(identity, password);
    // Solo se imprime la identidad; nunca la contraseña.
    process.stdout.write(JSON.stringify(result) + '\n');
  } finally { await app.close(); }
}
void main().catch(() => {
  process.stderr.write('No se pudo completar el aprovisionamiento inicial. Verifica argumentos, contraseña, estado inicial y disponibilidad de PostgreSQL.\n');
  process.exitCode = 1;
});
