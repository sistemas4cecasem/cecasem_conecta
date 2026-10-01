import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { defineConfig } from 'prisma/config';
import { validateDatabaseUrl } from './src/config/database-url';

if (existsSync('.env')) loadEnvFile('.env');

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // Generate/validate no necesitan una conexión. Los comandos de migración
  // requieren que el entorno proporcione una URL real.
  datasource: {
    url: process.env.DATABASE_URL === undefined ? '' : validateDatabaseUrl(process.env.DATABASE_URL),
  },
});
