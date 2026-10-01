import { validateDatabaseUrl } from './database-url';

export interface AppEnvironment {
  NODE_ENV: 'development' | 'test' | 'production';
  APP_PORT: number;
  DATABASE_URL: string;
}

export function validateEnvironment(
  environment: Record<string, unknown>,
): AppEnvironment {
  const nodeEnv = environment.NODE_ENV ?? 'development';
  if (nodeEnv !== 'development' && nodeEnv !== 'test' && nodeEnv !== 'production') {
    throw new Error('NODE_ENV debe ser development, test o production.');
  }

  const rawPort = environment.APP_PORT ?? '3000';
  if (
    (typeof rawPort !== 'string' && typeof rawPort !== 'number') ||
    (typeof rawPort === 'string' && !/^\d+$/.test(rawPort))
  ) {
    throw new Error('APP_PORT debe ser un entero entre 1 y 65535.');
  }

  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('APP_PORT debe ser un entero entre 1 y 65535.');
  }

  return {
    NODE_ENV: nodeEnv,
    APP_PORT: port,
    DATABASE_URL: validateDatabaseUrl(environment.DATABASE_URL),
  };
}
