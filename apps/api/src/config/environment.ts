import { validateDatabaseUrl } from './database-url';
import { fileEnvironment } from '../modules/files/file-config';
import { translationEnvironment, type TranslationEnvironment } from '../modules/translation/translation-config';

export interface AppEnvironment extends TranslationEnvironment {
  FILE_STORAGE_ROOT: string;
  FILE_MAX_BYTES: number;
  NODE_ENV: 'development' | 'test' | 'production';
  APP_PORT: number;
  DATABASE_URL: string;
  SESSION_TTL_SECONDS: number;
  SESSION_COOKIE_SECURE: boolean;
  FIRST_ACCESS_TOKEN_TTL_SECONDS: number;
  PASSWORD_RESET_TOKEN_TTL_SECONDS: number;
}

export function validateEnvironment(
  environment: Record<string, unknown>,
): AppEnvironment {
  const nodeEnv = environment.NODE_ENV ?? 'development';
  if (nodeEnv !== 'development' && nodeEnv !== 'test' && nodeEnv !== 'production') {
    throw new Error('NODE_ENV debe ser development, test o production.');
  }

  const rawPort = environment.APP_PORT ?? '3001';
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

  const rawTtl = environment.SESSION_TTL_SECONDS ?? '28800';
  if ((typeof rawTtl !== 'string' && typeof rawTtl !== 'number') || !/^\d+$/.test(String(rawTtl)) ||
      !Number.isSafeInteger(Number(rawTtl)) || Number(rawTtl) < 1 || Number(rawTtl) > 604800) {
    throw new Error('SESSION_TTL_SECONDS debe ser un entero entre 1 y 604800.');
  }
  const rawSecure = environment.SESSION_COOKIE_SECURE ?? 'false';
  const passwordResetTtl = environment.PASSWORD_RESET_TOKEN_TTL_SECONDS ?? '14400';
  if ((typeof passwordResetTtl !== 'string' && typeof passwordResetTtl !== 'number') || !/^\d+$/.test(String(passwordResetTtl)) ||
    !Number.isSafeInteger(Number(passwordResetTtl)) || Number(passwordResetTtl) < 1 || Number(passwordResetTtl) > 28800) {
    throw new Error('PASSWORD_RESET_TOKEN_TTL_SECONDS debe ser un entero entre 1 y 28800.');
  }
  const firstAccessTtl = environment.FIRST_ACCESS_TOKEN_TTL_SECONDS ?? '86400';
  if ((typeof firstAccessTtl !== 'string' && typeof firstAccessTtl !== 'number') || !/^\d+$/.test(String(firstAccessTtl)) ||
    !Number.isSafeInteger(Number(firstAccessTtl)) || Number(firstAccessTtl) < 1 || Number(firstAccessTtl) > 172800) {
    throw new Error('FIRST_ACCESS_TOKEN_TTL_SECONDS debe ser un entero entre 1 y 172800.');
  }
  if (rawSecure !== 'true' && rawSecure !== 'false' && typeof rawSecure !== 'boolean') {
    throw new Error('SESSION_COOKIE_SECURE debe ser true o false.');
  }

  return {
    ...fileEnvironment(environment),
    ...translationEnvironment(environment),
    NODE_ENV: nodeEnv,
    APP_PORT: port,
    DATABASE_URL: validateDatabaseUrl(environment.DATABASE_URL),
    SESSION_TTL_SECONDS: Number(rawTtl),
    SESSION_COOKIE_SECURE: rawSecure === true || rawSecure === 'true',
    FIRST_ACCESS_TOKEN_TTL_SECONDS: Number(firstAccessTtl),
    PASSWORD_RESET_TOKEN_TTL_SECONDS: Number(passwordResetTtl),
  };
}
