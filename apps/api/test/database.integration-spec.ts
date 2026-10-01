import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Server as HttpServer } from 'node:http';
import { Socket, connect, createServer } from 'node:net';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/config/application';
import { validateDatabaseUrl } from '../src/config/database-url';
import { AppEnvironment, validateEnvironment } from '../src/config/environment';
import { PrismaService } from '../src/database/prisma.service';

describe('PostgreSQL integration (requires real DATABASE_URL)', () => {
  let app: INestApplication<HttpServer> | undefined;
  let prisma: PrismaService;
  let observer: Pool;
  let proxyUrl: string;
  let unavailable = false;
  const sockets = new Set<Socket>();
  const databaseUrl = new URL(validateDatabaseUrl(process.env.DATABASE_URL));

  // Proxy TCP transparente: permite cortar conexiones reales sin detener una
  // instancia compartida ni modificar sus datos o permisos.
  const proxy = createServer((client) => {
    if (unavailable) { client.destroy(); return; }
    const upstream = connect({
      host: databaseUrl.hostname.replace(/^\[|\]$/g, ''),
      port: Number(databaseUrl.port || 5432),
    });
    for (const socket of [client, upstream]) {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
      socket.on('error', () => { client.destroy(); upstream.destroy(); });
    }
    client.on('close', () => upstream.destroy());
    upstream.on('close', () => client.destroy());
    client.pipe(upstream).pipe(client);
  });

  beforeAll(async () => {
    await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
    const address = proxy.address();
    if (!address || typeof address === 'string') throw new Error('TCP proxy did not bind a port');
    const target = new URL(databaseUrl);
    target.hostname = '127.0.0.1';
    target.port = String(address.port);
    proxyUrl = target.toString();
    observer = new Pool({ connectionString: databaseUrl.toString(), connectionTimeoutMillis: 5000 });

    const config = new ConfigService<AppEnvironment, true>(validateEnvironment({
      ...process.env, NODE_ENV: 'test', DATABASE_URL: proxyUrl,
    }));
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ConfigService).useValue(config).compile();
    app = moduleRef.createNestApplication<INestApplication<HttpServer>>();
    app.useLogger(false);
    configureApplication(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    try { await app?.close(); } finally {
      await observer?.end();
      for (const socket of sockets) socket.destroy();
      if (proxy.listening) await new Promise<void>((resolve, reject) => proxy.close((error) => error ? reject(error) : resolve()));
    }
  });

  it('connects and executes a parameterized query through Prisma', async () => {
    const result = await prisma.$queryRaw<Array<{ value: number }>>`SELECT ${1}::integer AS value`;
    expect(result).toEqual([{ value: 1 }]);
  });

  it('reports API and database healthy', async () => {
    if (!app) throw new Error('Application not initialized');
    await request(app.getHttpServer()).get('/api/v1/health').expect(200).expect({ status: 'ok', database: 'ok' });
  });

  it('returns 503 during a real connection outage and recovers afterward', async () => {
    if (!app) throw new Error('Application not initialized');
    unavailable = true;
    for (const socket of sockets) socket.destroy();
    const response = await request(app.getHttpServer()).get('/api/v1/health').expect(503);
    expect(response.body).toMatchObject({ statusCode: 503, path: '/api/v1/health' });
    expect(response.body).not.toHaveProperty('stack');
    if (databaseUrl.password) expect(response.text).not.toContain(databaseUrl.password);
    unavailable = false;
    await request(app.getHttpServer()).get('/api/v1/health').expect(200).expect({ status: 'ok', database: 'ok' });
  });

  it('fails startup clearly when PostgreSQL is unavailable and allows repeated cleanup', async () => {
    unavailable = true;
    const failing = new PrismaService(new ConfigService<AppEnvironment, true>(validateEnvironment({ DATABASE_URL: proxyUrl })));
    try {
      await expect(failing.onModuleInit()).rejects.toThrow('No se pudo conectar con PostgreSQL');
    } finally {
      await failing.onModuleDestroy();
      unavailable = false;
    }
  });

  it('releases application connections when Nest closes', async () => {
    const connections = await prisma.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
    const pid = connections[0]?.pid;
    expect(pid).toBeDefined();
    await app?.close();
    app = undefined;
    const result = await observer.query<{ connections: number }>(
      'SELECT count(*)::integer AS connections FROM pg_stat_activity WHERE pid = $1',
      [pid],
    );
    expect(result.rows[0]?.connections).toBe(0);
    await prisma.onModuleDestroy();
  });
});
