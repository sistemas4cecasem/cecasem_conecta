import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { AppEnvironment } from './environment';
import type { Request, Response, NextFunction } from 'express';
import type { NestExpressApplication } from '@nestjs/platform-express';

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    validationError: { target: false, value: false },
  });
}

export function configureApplication(app: INestApplication): void {
  // Nest usa el adapter Express: admite el texto original y JSON escapado hasta el límite validado.
  (app as NestExpressApplication).useBodyParser('json', { limit: '2mb' });
  app.setGlobalPrefix('api/v1');
  app.use('/api/v1/auth', (_request: Request, response: Response, next: NextFunction) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new HttpExceptionFilter());

  const config = app.get(ConfigService<AppEnvironment, true>);
  if (config.get('NODE_ENV', { infer: true }) === 'development') {
    const documentConfig = new DocumentBuilder()
      .setTitle('CECASEM Conecta API')
      .setDescription('API REST de CECASEM Conecta.')
      .setVersion('0.2.0')
      .addCookieAuth('cecasem_session', { type: 'apiKey', in: 'cookie' }, 'cecasem_session')
      .build();
    SwaggerModule.setup('api/docs', app, () =>
      SwaggerModule.createDocument(app, documentConfig),
    );
  }
}
