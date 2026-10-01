import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { AppEnvironment } from '../config/environment';
import { PrismaClient } from '../generated/prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly pool: Pool;
  private closing?: Promise<void>;

  constructor(config: ConfigService<AppEnvironment, true>) {
    const pool = new Pool({
      connectionString: config.get('DATABASE_URL', { infer: true }),
      connectionTimeoutMillis: 5000,
      query_timeout: 5000,
      application_name: 'cecasem-conecta-api',
    });
    pool.on('error', () => new Logger('Database').error('Fallo de una conexión PostgreSQL inactiva.'));
    super({ adapter: new PrismaPg(pool), log: [] });
    this.pool = pool;
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      // El adapter crea el pool de forma diferida; esta consulta verifica conexión real.
      await this.$queryRaw`SELECT 1`;
    } catch {
      await this.onModuleDestroy();
      throw new Error('No se pudo conectar con PostgreSQL. Revise DATABASE_URL y la disponibilidad de la base de datos.');
    }
  }

  onModuleDestroy(): Promise<void> {
    return this.closing ??= this.closeConnections();
  }

  private async closeConnections(): Promise<void> {
    try {
      await this.$disconnect();
    } finally {
      // El servicio es propietario del pool externo; el adapter no lo cierra por defecto.
      await this.pool.end();
    }
  }
}
