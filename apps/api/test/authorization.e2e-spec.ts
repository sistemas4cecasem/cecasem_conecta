import { Controller, Get, type INestApplication, Logger, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import request from 'supertest';
import { configureApplication } from '../src/config/application';
import { UserRole } from '../src/generated/prisma/client';
import { PERMISSIONS } from '../src/modules/auth/authorization/permission';
import { PermissionsGuard } from '../src/modules/auth/authorization/permissions.guard';
import { RequirePermissions } from '../src/modules/auth/authorization/require-permissions.decorator';
import { SessionGuard } from '../src/modules/auth/session.guard';
import { SessionsService } from '../src/modules/auth/sessions.service';
import type { UserIdentity } from '../src/modules/users/user-projections';

describe('Errores controlados de configuración de autorización HTTP', () => {
  let app: INestApplication<Server>;
  const operation = jest.fn<unknown, []>();
  const findIdentity = jest.fn();
  const identity = { id: randomUUID(), role: UserRole.ADMINISTRATOR } as UserIdentity;

  // Rutas exclusivamente de prueba; nunca forman parte de AppModule.
  @Controller('configuration-fixture')
  class FixtureController {
    @Get('missing') @UseGuards(SessionGuard, PermissionsGuard) missing() { return operation(); }
    @Get('valid') @RequirePermissions(PERMISSIONS.FIRST_ACCESS_ISSUE) valid() { return operation(); }
  }
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ controllers: [FixtureController],
      providers: [SessionGuard, PermissionsGuard, { provide: SessionsService, useValue: { findIdentity } },
        { provide: ConfigService, useValue: new ConfigService({ NODE_ENV: 'test' }) }],
    }).compile();
    app = moduleRef.createNestApplication<INestApplication<Server>>(); configureApplication(app); await app.init();
  });
  afterAll(async () => { await app?.close(); });
  it('SessionGuard responde 401 antes de evaluar metadata cuando no hay sesión', async () => {
    findIdentity.mockResolvedValue(null);
    await request(app.getHttpServer()).get('/api/v1/configuration-fixture/missing').expect(401);
    expect(operation).not.toHaveBeenCalled();
  });
  it('metadata ausente responde 500 uniforme, sin invocar la operación ni exponer detalles', async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    findIdentity.mockResolvedValue(identity);
    const response = await request(app.getHttpServer()).get('/api/v1/configuration-fixture/missing').expect(500);
    expect(response.body).toMatchObject({ statusCode: 500, message: 'Error interno del servidor.' });
    expect(response.body).not.toHaveProperty('stack');
    expect(JSON.stringify(response.body)).not.toContain('Configuración');
    expect(operation).not.toHaveBeenCalled();
  });
  it('una configuración válida invoca la operación autorizada', async () => {
    findIdentity.mockResolvedValue(identity); operation.mockReturnValue({ ok: true });
    await request(app.getHttpServer()).get('/api/v1/configuration-fixture/valid').expect(200, { ok: true });
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
