import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { AppEnvironment } from './environment';

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    validationError: { target: false, value: false },
  });
}

export function configureApplication(app: INestApplication): void {
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new HttpExceptionFilter());

  const config = app.get(ConfigService<AppEnvironment, true>);
  if (config.get('NODE_ENV', { infer: true }) === 'development') {
    const documentConfig = new DocumentBuilder()
      .setTitle('CECASEM Conecta API')
      .setDescription('API REST de CECASEM Conecta.')
      .setVersion('0.2.0')
      .build();
    SwaggerModule.setup('api/docs', app, () =>
      SwaggerModule.createDocument(app, documentConfig),
    );
  }
}
