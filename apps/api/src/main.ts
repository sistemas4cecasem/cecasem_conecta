import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApplication } from './config/application';
import { AppEnvironment } from './config/environment';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configureApplication(app);
  app.enableShutdownHooks();

  const config = app.get(ConfigService<AppEnvironment, true>);
  await app.listen(config.get('APP_PORT', { infer: true }));
}

void bootstrap().catch(() => {
  new Logger('Bootstrap').error(
    'No se pudo iniciar la API. Revise la configuración y los registros de NestJS.',
  );
  process.exitCode = 1;
});
