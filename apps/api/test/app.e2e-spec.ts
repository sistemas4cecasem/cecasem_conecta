import { BadRequestException, INestApplication, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/config/application';
import { AppEnvironment } from '../src/config/environment';
import { HealthController } from '../src/modules/health/health.controller';
import { PrismaService } from '../src/database/prisma.service';

async function createApp(
  nodeEnv: AppEnvironment['NODE_ENV'],
): Promise<INestApplication<Server>> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue({ $queryRaw: jest.fn().mockResolvedValue([{ value: 1 }]) })
    .compile();
  const app = moduleRef.createNestApplication<INestApplication<Server>>();
  app.get(ConfigService<AppEnvironment, true>).set('NODE_ENV', nodeEnv);
  configureApplication(app);
  return app;
}

describe('API in development', () => {
  let app: INestApplication<Server>;

  beforeAll(async () => {
    app = await createApp('development');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves health under /api/v1', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect({ status: 'ok', database: 'ok' });
  });

  it('returns uniform errors for nonexistent routes', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/missing')
      .expect(404);
    expect(response.body).toMatchObject({
      statusCode: 404,
      message: 'Cannot GET /api/v1/missing',
      path: '/api/v1/missing',
    });
    expect(response.body).toHaveProperty('timestamp');
    expect(response.body).not.toHaveProperty('stack');
  });

  it('does not expose health without the API prefix', async () => {
    await request(app.getHttpServer()).get('/health').expect(404);
  });

  it('serves Swagger UI in development', async () => {
    await request(app.getHttpServer())
      .get('/api/docs/')
      .expect(200)
      .expect('Content-Type', /html/);
  });

  it('documents the real health endpoint', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/docs-json')
      .expect(200);
    expect(response.body).toMatchObject({
      info: { title: 'CECASEM Conecta API', version: '0.2.0' },
      paths: { '/api/v1/health': { get: { tags: ['health'] } } },
      components: {
        schemas: { HealthResponseDto: { properties: { status: { enum: ['ok'] }, database: { enum: ['ok'] } } } },
      },
    });
  });
});

describe('API in production', () => {
  let app: INestApplication<Server>;

  beforeAll(async () => {
    app = await createApp('production');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('keeps health available', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect({ status: 'ok', database: 'ok' });
  });

  it.each(['/api/docs/', '/api/docs-json', '/api/docs-yaml'])(
    'does not expose Swagger at %s',
    async (path) => {
      await request(app.getHttpServer()).get(path).expect(404);
    },
  );
});

describe('Global exception handling', () => {
  it('preserves validation messages and the HTTP status', async () => {
    const app = await createApp('test');
    const controller = app.get(HealthController);
    jest.spyOn(controller, 'getHealth').mockImplementationOnce(() => {
      throw new BadRequestException(['name must be a string']);
    });
    try {
      await app.init();
      const response = await request(app.getHttpServer())
        .get('/api/v1/health?debug=ignored')
        .expect(400);
      expect(response.body).toMatchObject({
        statusCode: 400,
        message: ['name must be a string'],
        path: '/api/v1/health',
      });
    } finally {
      await app.close();
    }
  });

  it('logs unexpected failures without disclosing their content', async () => {
    const app = await createApp('production');
    const logger = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    jest.spyOn(app.get(HealthController), 'getHealth').mockImplementationOnce(() => {
      throw new Error('Sensitive internal failure');
    });
    try {
      await app.init();
      const response = await request(app.getHttpServer())
        .get('/api/v1/health')
        .expect(500);
      expect(response.body).toMatchObject({
        statusCode: 500,
        message: 'Error interno del servidor.',
        path: '/api/v1/health',
      });
      expect(response.body).not.toHaveProperty('stack');
      expect(response.text).not.toContain('Sensitive internal failure');
      expect(logger).toHaveBeenCalledWith(
        'Fallo interno de la API; respuesta HTTP 500 o superior.',
      );
    } finally {
      await app.close();
    }
  });
});
